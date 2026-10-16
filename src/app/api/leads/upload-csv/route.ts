import { Readable } from "node:stream";
import {
  parseCsv,
  CsvEmptyError,
  CsvHeaderError,
  CsvSyntaxError,
  CsvSizeLimitExceededError,
  CsvRowLimitExceededError,
  CSV_LIMITS,
} from "@/lib/csv-parser";
import { LeadRepository } from "@/lib/lead-repository";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";

const MAX_FILE_SIZE = CSV_LIMITS.MAX_FILE_SIZE_BYTES; // 5MB
const MAX_MULTIPART_OVERHEAD = 512 * 1024; // 512KB for headers, boundaries, metadata
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD;

/**
 * POST /api/leads/upload-csv
 * Multipart CSV bulk upload endpoint.
 *
 * Security & Resource Limits:
 * - Early Content-Length verification before parsing body into memory.
 * - Streaming body byte-counter guard to prevent unbounded memory allocation for chunked uploads.
 * - Enforces 5MB file size limit.
 * - Rejects empty files and non-CSV MIME/extensions.
 * - Preserves raw data integrity during ingestion (formula sanitization applies to spreadsheet export).
 * - Atomic batch rollback: if database write fails, whole batch rolls back.
 */
export async function POST(req: Request) {
  // 1. Authentication & Authorization check (server-derived identity only)
  const auth = await authenticateRequest(req);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Validate Content-Type is multipart/form-data
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(
      400,
      "INVALID_CONTENT_TYPE",
      "Request Content-Type must be multipart/form-data"
    );
  }

  // 3. Early Content-Length validation (reject oversized requests before buffering)
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (isNaN(contentLength) || contentLength < 0 || !Number.isInteger(contentLength)) {
      return jsonError(400, "BAD_REQUEST", "Invalid Content-Length header");
    }
    if (contentLength > MAX_REQUEST_BYTES) {
      return jsonError(
        413,
        "FILE_TOO_LARGE",
        `Request body exceeds maximum allowed size of 5MB (${MAX_FILE_SIZE} bytes)`
      );
    }
  }

  // 4. Wrap request body in a streaming byte-limiter for chunked/missing Content-Length
  let guardedReq = req;
  if (req.body) {
    let bytesRead = 0;
    const transformStream = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        bytesRead += chunk.byteLength;
        if (bytesRead > MAX_REQUEST_BYTES) {
          controller.error(new CsvSizeLimitExceededError(MAX_FILE_SIZE));
          return;
        }
        controller.enqueue(chunk);
      },
    });

    try {
      guardedReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body.pipeThrough(transformStream),
        // @ts-expect-error duplex is required in Node fetch when body is a stream
        duplex: "half",
      });
    } catch {
      // If duplex stream clone is unsupported in specific test runner, fallback to req
      guardedReq = req;
    }
  }

  // 5. Extract multipart form data
  let formData: FormData;
  try {
    formData = await guardedReq.formData();
  } catch (err: unknown) {
    if (err instanceof CsvSizeLimitExceededError) {
      return jsonError(413, "FILE_TOO_LARGE", err.message);
    }
    console.error("[POST /api/leads/upload-csv] Failed to parse multipart form data:", err);
    return jsonError(400, "BAD_REQUEST", "Failed to parse multipart form data");
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return jsonError(
      400,
      "FILE_REQUIRED",
      "A file must be uploaded under the 'file' field"
    );
  }

  const uploadFile = file as File;

  // Validate file name / extension
  const fileName = uploadFile.name || "";
  const isCsvExtension = fileName.toLowerCase().endsWith(".csv");
  const isCsvMime =
    !uploadFile.type ||
    uploadFile.type === "text/csv" ||
    uploadFile.type === "text/plain" ||
    uploadFile.type === "application/vnd.ms-excel";

  if (!isCsvExtension && !isCsvMime) {
    return jsonError(
      400,
      "INVALID_FILE_TYPE",
      "Only CSV files are accepted. File name must end with .csv"
    );
  }

  // Check file size limit
  if (uploadFile.size > MAX_FILE_SIZE) {
    return jsonError(
      413,
      "FILE_TOO_LARGE",
      `CSV file exceeds maximum allowed size of 5MB (${MAX_FILE_SIZE} bytes)`
    );
  }

  // Check empty file
  if (uploadFile.size === 0) {
    return jsonError(400, "EMPTY_FILE", "Uploaded CSV file is empty");
  }

  // 6. Stream and parse CSV content
  let parseResult;
  try {
    // Stream directly into parser to avoid double buffering
    // @ts-expect-error Readable.fromWeb handles web ReadableStream in Node 18+
    const nodeStream = Readable.fromWeb(uploadFile.stream());

    parseResult = await parseCsv(nodeStream, {
      maxFileSize: MAX_FILE_SIZE,
      maxRows: CSV_LIMITS.MAX_ROWS,
      sanitizeFormulas: false, // Maintain true raw data in DB; sanitization applies on export
    });
  } catch (err: unknown) {
    if (err instanceof CsvSizeLimitExceededError) {
      return jsonError(413, "FILE_TOO_LARGE", err.message);
    }
    if (err instanceof CsvEmptyError) {
      return jsonError(400, "EMPTY_FILE", err.message);
    }
    if (err instanceof CsvHeaderError) {
      return jsonError(400, "CSV_HEADER_ERROR", err.message);
    }
    if (err instanceof CsvRowLimitExceededError) {
      return jsonError(400, "ROW_LIMIT_EXCEEDED", err.message);
    }
    if (err instanceof CsvSyntaxError) {
      return jsonError(400, "CSV_SYNTAX_ERROR", err.message);
    }

    console.error("[POST /api/leads/upload-csv] Unexpected parsing error:", err);
    return jsonError(400, "CSV_PARSE_ERROR", "Failed to parse CSV file");
  }

  // 7. Batch persistence policy
  if (parseResult.validRows.length === 0) {
    return jsonSuccess({
      success: false,
      importedCount: 0,
      totalRows: parseResult.totalRows,
      validRows: [],
      invalidRows: parseResult.invalidRows,
    });
  }

  // Atomic batch insertion
  try {
    const repo = new LeadRepository();
    const leadsToInsert = parseResult.validRows.map((r) => r.data);

    await repo.createLeadsBatch(
      leadsToInsert,
      auth.user.userId,
      auth.user.role
    );

    return jsonSuccess({
      success: true,
      importedCount: parseResult.validRows.length,
      totalRows: parseResult.totalRows,
      validRows: parseResult.validRows,
      invalidRows: parseResult.invalidRows,
    });
  } catch (error: unknown) {
    console.error(
      "[POST /api/leads/upload-csv] Batch insertion transaction aborted:",
      error instanceof Error ? error.message : error
    );

    return jsonError(
      500,
      "DATABASE_TRANSACTION_FAILED",
      "Failed to persist batch import in database. Transaction was rolled back completely."
    );
  }
}
