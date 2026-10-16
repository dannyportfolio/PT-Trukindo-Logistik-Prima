import { Readable } from "node:stream";
import { parse as createCsvParser } from "csv-parse";
import { LeadInput, LeadInputSchema } from "../types/lead";

/**
 * Standard CSV Engine Limits
 */
export const CSV_LIMITS = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB limit
  MAX_ROWS: 5000,
  MAX_FIELD_LENGTH: 4096,
} as const;

/**
 * Custom structured CSV error classes
 */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export class CsvEmptyError extends CsvError {
  constructor(message: string = "CSV file is empty") {
    super(message);
    this.name = "CsvEmptyError";
  }
}

export class CsvSizeLimitExceededError extends CsvError {
  constructor(maxBytes: number = CSV_LIMITS.MAX_FILE_SIZE_BYTES) {
    super(`CSV file exceeds maximum allowed size of ${maxBytes} bytes (5MB limit)`);
    this.name = "CsvSizeLimitExceededError";
  }
}

export class CsvRowLimitExceededError extends CsvError {
  constructor(maxRows: number = CSV_LIMITS.MAX_ROWS) {
    super(`CSV file exceeds maximum allowed limit of ${maxRows} data rows`);
    this.name = "CsvRowLimitExceededError";
  }
}

export class CsvHeaderError extends CsvError {
  constructor(message: string) {
    super(message);
    this.name = "CsvHeaderError";
  }
}

export class CsvSyntaxError extends CsvError {
  public rowNumber?: number;
  constructor(message: string, rowNumber?: number) {
    super(rowNumber ? `CSV syntax error at line ${rowNumber}: ${message}` : `CSV syntax error: ${message}`);
    this.name = "CsvSyntaxError";
    this.rowNumber = rowNumber;
  }
}

/**
 * Structured row-level error description
 */
export interface CsvRowError {
  field: string;
  message: string;
}

/**
 * Invalid row result containing file line number, raw input, and validation errors
 */
export interface CsvInvalidRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: CsvRowError[];
}

/**
 * Valid row result containing file line number and strongly-typed LeadInput
 */
export interface CsvValidRow {
  rowNumber: number;
  data: LeadInput;
}

/**
 * Overall batch parsing result representing partial or complete ingestion
 */
export interface CsvParseResult {
  totalRows: number;
  validRows: CsvValidRow[];
  invalidRows: CsvInvalidRow[];
}

export interface ParseCsvOptions {
  maxFileSize?: number;
  maxRows?: number;
  maxFieldLength?: number;
  sanitizeFormulas?: boolean;
}

/**
 * Formula injection trigger characters per OWASP guidance
 */
const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Checks if a string starts with formula trigger characters that could
 * lead to CSV / DDE injection when opened in spreadsheet viewers.
 */
export function isFormulaInjectionRisk(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trimStart();
  if (trimmed.length === 0) return false;
  // If already escaped with a leading single quote, spreadsheet engines treat it as text
  if (trimmed.startsWith("'")) return false;
  return FORMULA_TRIGGER_CHARS.includes(trimmed[0]);
}

/**
 * Sanitizes cell values to neutralize spreadsheet formula injection.
 * Prepends a single quote (') if the value starts with =, +, -, @, \t, or \r.
 */
export function sanitizeFormulaInjection(value: string): string {
  if (typeof value !== "string") return value;
  if (isFormulaInjectionRisk(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Applies formula injection sanitization to all fields of a LeadInput.
 */
export function sanitizeLeadInput(input: LeadInput): LeadInput {
  return {
    companyName: sanitizeFormulaInjection(input.companyName),
    websiteUrl: sanitizeFormulaInjection(input.websiteUrl),
    contactName: sanitizeFormulaInjection(input.contactName),
    contactEmail: sanitizeFormulaInjection(input.contactEmail),
  };
}

/**
 * Escapes a cell according to RFC-4180 with formula injection neutralization.
 */
export function escapeCsvCell(value: string): string {
  const sanitized = sanitizeFormulaInjection(value);
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Serializes LeadInput objects into an RFC-4180 compliant CSV string
 * with formula injection protection applied.
 */
export function exportLeadsToCsv(leads: LeadInput[]): string {
  const headers = ["company_name", "website_url", "contact_name", "contact_email"];
  const rows = leads.map((lead) =>
    [
      escapeCsvCell(lead.companyName),
      escapeCsvCell(lead.websiteUrl),
      escapeCsvCell(lead.contactName),
      escapeCsvCell(lead.contactEmail),
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Canonical lead field names required for successful lead ingestion
 */
const REQUIRED_CANONICAL_FIELDS: (keyof LeadInput)[] = [
  "companyName",
  "websiteUrl",
  "contactName",
  "contactEmail",
];

/**
 * Header alias dictionary normalizing varied CSV column labels to canonical keys
 */
const HEADER_CANONICAL_MAP: Record<string, keyof LeadInput> = {
  // companyName
  companyname: "companyName",
  company_name: "companyName",
  company: "companyName",
  "company name": "companyName",
  organization: "companyName",
  organization_name: "companyName",

  // websiteUrl
  websiteurl: "websiteUrl",
  website_url: "websiteUrl",
  website: "websiteUrl",
  "website url": "websiteUrl",
  url: "websiteUrl",
  web: "websiteUrl",

  // contactName
  contactname: "contactName",
  contact_name: "contactName",
  contact: "contactName",
  "contact name": "contactName",
  name: "contactName",
  "full name": "contactName",
  fullname: "contactName",

  // contactEmail
  contactemail: "contactEmail",
  contact_email: "contactEmail",
  email: "contactEmail",
  "contact email": "contactEmail",
  "email address": "contactEmail",
  emailaddress: "contactEmail",
};

/**
 * Resolves raw header array into canonical column mapping and validates headers.
 */
function resolveAndValidateHeaders(rawHeaders: string[]): {
  indexToCanonical: Map<number, keyof LeadInput>;
  indexToRaw: Map<number, string>;
} {
  if (rawHeaders.length === 0 || rawHeaders.every((h) => !h || h.trim() === "")) {
    throw new CsvHeaderError("CSV file header row is empty or missing");
  }

  const seenRawHeaders = new Set<string>();
  const canonicalToHeader = new Map<keyof LeadInput, string>();
  const indexToCanonical = new Map<number, keyof LeadInput>();
  const indexToRaw = new Map<number, string>();

  for (let i = 0; i < rawHeaders.length; i++) {
    const rawHeader = rawHeaders[i]?.trim() ?? "";
    if (!rawHeader) continue;

    indexToRaw.set(i, rawHeader);
    const normalizedKey = rawHeader.toLowerCase().replace(/[\s_-]+/g, " ");

    // Check duplicate raw header
    if (seenRawHeaders.has(normalizedKey)) {
      throw new CsvHeaderError(`Duplicate header detected: "${rawHeader}"`);
    }
    seenRawHeaders.add(normalizedKey);

    // Check canonical mapping
    const mappedCanonical =
      HEADER_CANONICAL_MAP[normalizedKey] ||
      HEADER_CANONICAL_MAP[rawHeader.toLowerCase().replace(/\s+/g, "")];

    if (mappedCanonical) {
      if (canonicalToHeader.has(mappedCanonical)) {
        throw new CsvHeaderError(
          `Conflicting duplicate columns detected for "${mappedCanonical}": "${canonicalToHeader.get(
            mappedCanonical
          )}" and "${rawHeader}"`
        );
      }
      canonicalToHeader.set(mappedCanonical, rawHeader);
      indexToCanonical.set(i, mappedCanonical);
    }
  }

  // Verify all required canonical fields are present
  const missing = REQUIRED_CANONICAL_FIELDS.filter(
    (field) => !canonicalToHeader.has(field)
  );

  if (missing.length > 0) {
    const readableMissing = missing
      .map((f) => {
        switch (f) {
          case "companyName":
            return "Company Name (e.g. company_name)";
          case "websiteUrl":
            return "Website URL (e.g. website_url)";
          case "contactName":
            return "Contact Name (e.g. contact_name)";
          case "contactEmail":
            return "Contact Email (e.g. contact_email)";
        }
      })
      .join(", ");
    throw new CsvHeaderError(`Missing required CSV header: ${readableMissing}`);
  }

  return { indexToCanonical, indexToRaw };
}

/**
 * Creates a byte-measuring readable stream to enforce max file size limit during streaming.
 */
function createSizeGuardedStream(
  source: Readable,
  maxBytes: number
): Readable {
  let totalBytesRead = 0;

  const guarded = new Readable({
    read() {},
  });

  source.on("data", (chunk: Buffer | string) => {
    const chunkSize = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(chunk, "utf8");
    totalBytesRead += chunkSize;

    if (totalBytesRead > maxBytes) {
      source.destroy();
      guarded.destroy(new CsvSizeLimitExceededError(maxBytes));
      return;
    }

    guarded.push(chunk);
  });

  source.on("end", () => {
    guarded.push(null);
  });

  source.on("error", (err) => {
    guarded.destroy(err);
  });

  return guarded;
}

/**
 * Parses CSV input (string, Buffer, or stream) and validates each row against LeadInput schema.
 * Enforces file size limit, row limit, field length limits, formula sanitization, and returns
 * structured line-by-line valid and invalid results.
 */
export async function parseCsv(
  input: string | Buffer | NodeJS.ReadableStream,
  options: ParseCsvOptions = {}
): Promise<CsvParseResult> {
  const maxFileSize = options.maxFileSize ?? CSV_LIMITS.MAX_FILE_SIZE_BYTES;
  const maxRows = options.maxRows ?? CSV_LIMITS.MAX_ROWS;
  const maxFieldLength = options.maxFieldLength ?? CSV_LIMITS.MAX_FIELD_LENGTH;
  const sanitizeFormulas = options.sanitizeFormulas ?? false;

  // 1. Initial size and empty checks for Buffer / string
  if (typeof input === "string") {
    if (input.trim().length === 0) {
      throw new CsvEmptyError();
    }
    const byteLength = Buffer.byteLength(input, "utf8");
    if (byteLength > maxFileSize) {
      throw new CsvSizeLimitExceededError(maxFileSize);
    }
  } else if (Buffer.isBuffer(input)) {
    if (input.length === 0 || input.toString("utf8").trim().length === 0) {
      throw new CsvEmptyError();
    }
    if (input.length > maxFileSize) {
      throw new CsvSizeLimitExceededError(maxFileSize);
    }
  }

  // 2. Create readable stream
  let sourceStream: Readable;
  if (typeof input === "string") {
    sourceStream = Readable.from([input]);
  } else if (Buffer.isBuffer(input)) {
    sourceStream = Readable.from([input]);
  } else {
    sourceStream = input as Readable;
  }

  const guardedStream = createSizeGuardedStream(sourceStream, maxFileSize);

  // 3. Configure csv-parse
  const parser = createCsvParser({
    bom: true,
    info: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  });

  guardedStream.pipe(parser);

  let headerResolved = false;
  let indexToCanonical = new Map<number, keyof LeadInput>();
  let indexToRaw = new Map<number, string>();

  const validRows: CsvValidRow[] = [];
  const invalidRows: CsvInvalidRow[] = [];
  let totalRows = 0;

  try {
    for await (const chunk of parser) {
      const { record: rawRecordRow, info: recordInfo } = chunk as {
        record: string[];
        info: { lines: number };
      };

      // Handle Header (First non-empty line)
      if (!headerResolved) {
        const resolved = resolveAndValidateHeaders(rawRecordRow);
        indexToCanonical = resolved.indexToCanonical;
        indexToRaw = resolved.indexToRaw;
        headerResolved = true;
        continue;
      }

      // Handle Data Rows
      totalRows++;

      if (totalRows > maxRows) {
        guardedStream.destroy();
        parser.destroy();
        throw new CsvRowLimitExceededError(maxRows);
      }

      // The line number in the source CSV file from the per-record info snapshot
      const rowNumber = recordInfo.lines;

      const rawObject: Record<string, string> = {};
      const canonicalObject: Partial<Record<keyof LeadInput, string>> = {};
      const rowFieldErrors: CsvRowError[] = [];

      for (let i = 0; i < rawRecordRow.length; i++) {
        const rawVal = rawRecordRow[i] ?? "";
        const headerName = indexToRaw.get(i) || `column_${i + 1}`;
        rawObject[headerName] = rawVal;

        // Check field length limit
        if (rawVal.length > maxFieldLength) {
          rowFieldErrors.push({
            field: headerName,
            message: `Field exceeds maximum length of ${maxFieldLength} characters`,
          });
        }

        const canonicalKey = indexToCanonical.get(i);
        if (canonicalKey) {
          const processedVal = sanitizeFormulas
            ? sanitizeFormulaInjection(rawVal.trim())
            : rawVal.trim();
          canonicalObject[canonicalKey] = processedVal;
        }
      }

      if (rowFieldErrors.length > 0) {
        invalidRows.push({
          rowNumber,
          raw: rawObject,
          errors: rowFieldErrors,
        });
        continue;
      }

      // Validate mapped canonical data against LeadInputSchema
      const parseResult = LeadInputSchema.safeParse(canonicalObject);

      if (parseResult.success) {
        validRows.push({
          rowNumber,
          data: parseResult.data,
        });
      } else {
        const errors: CsvRowError[] = parseResult.error.errors.map((err) => ({
          field: err.path.join(".") || "row",
          message: err.message,
        }));

        invalidRows.push({
          rowNumber,
          raw: rawObject,
          errors,
        });
      }
    }
  } catch (err: unknown) {
    if (
      err instanceof CsvSizeLimitExceededError ||
      err instanceof CsvRowLimitExceededError ||
      err instanceof CsvHeaderError ||
      err instanceof CsvEmptyError
    ) {
      throw err;
    }

    if (err instanceof Error) {
      // Check if csv-parse syntax error
      const rowNum = (parser.info && parser.info.lines) || undefined;
      throw new CsvSyntaxError(err.message, rowNum);
    }

    throw new CsvSyntaxError("Unknown CSV parsing error");
  }

  // If no rows at all were read, file was completely blank
  if (!headerResolved) {
    throw new CsvEmptyError();
  }

  return {
    totalRows,
    validRows,
    invalidRows,
  };
}
