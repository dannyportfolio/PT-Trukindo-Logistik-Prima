import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";

const UuidSchema = z.string().uuid("Lead ID must be a valid UUID format");

/**
 * GET /api/leads/[id]/research
 * Exposes the full prospect research dossier, factual corporate findings,
 * decoupled static ICP score breakdown, confidence, evidence coverage,
 * verified citations, and previous execution runs.
 *
 * Requirements:
 * - Server-side authentication (ADMIN, SALES_OPERATOR, VIEWER).
 * - Distinguishes invalid ID format (400) from non-existent lead (404).
 * - Strictly strips raw scraped HTML and internal credential/secret data.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate (VIEWER is permitted read-only inspection)
  const auth = await authenticateRequest(req, ["ADMIN", "SALES_OPERATOR", "VIEWER"]);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Resolve route parameters
  const { id } = await context.params;

  // 3. Validate ID format
  const validation = UuidSchema.safeParse(id);
  if (!validation.success) {
    return jsonError(
      400,
      "INVALID_ID_FORMAT",
      "Lead ID must be a valid UUID format",
      validation.error.errors
    );
  }

  try {
    const leadRepo = new LeadRepository();
    const agentRepo = new AgentRepository();

    // 4. Fetch lead details
    const { lead } = await leadRepo.getLeadWithAudit(id);
    if (!lead) {
      return jsonError(404, "NOT_FOUND", `Lead with ID '${id}' was not found`);
    }

    // 5. Fetch research facts, scores, and execution runs
    const [research, score, runs] = await Promise.all([
      agentRepo.getCompanyResearch(id),
      agentRepo.getLeadScore(id),
      agentRepo.getRunsByLeadId(id),
    ]);

    return jsonSuccess(
      {
        lead: {
          id: lead.id,
          companyName: lead.company_name,
          websiteUrl: lead.website_url,
          contactName: lead.contact_name,
          contactEmail: lead.contact_email,
          status: lead.status,
          createdAt: lead.created_at,
          updatedAt: lead.updated_at,
        },
        research: research
          ? {
              industry: research.industry,
              companySize: research.company_size,
              offerings: research.offerings,
              techStack: research.tech_stack,
              summary: research.summary,
              contentHash: research.content_hash,
              createdAt: research.created_at,
            }
          : null,
        score: score
          ? {
              score: score.score,
              confidence: score.confidence,
              evidenceCoverage: score.evidence_coverage,
              evidence_coverage: score.evidence_coverage,
              tier: score.tier,
              criteriaBreakdown: score.criteria_breakdown,
              criteria_breakdown: score.criteria_breakdown,
              missingInfo: score.missing_info,
              missing_info: score.missing_info,
              evidenceUrls: score.evidence_urls,
              evidence_urls: score.evidence_urls,
              rationale: score.rationale,
              createdAt: score.created_at,
            }
          : null,
        runs: runs.map((r) => ({
          id: r.id,
          state: r.state,
          currentStep: r.current_step,
          maxSteps: r.max_steps,
          toolCallsCount: r.tool_calls_count,
          maxToolCalls: r.max_tool_calls,
          accruedCostUsd: r.accrued_cost_usd,
          budgetLimitUsd: r.budget_limit_usd,
          errorCode: r.error_code,
          errorDetails: r.error_details,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      },
      200
    );
  } catch (error: unknown) {
    console.error(
      `[GET /api/leads/${id}/research] Error retrieving research dossier:`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to retrieve prospect research dossier");
  }
}
