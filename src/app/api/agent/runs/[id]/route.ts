import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { AgentRepository } from "@/lib/agent/repository";
import { LeadRepository } from "@/lib/lead-repository";

const UuidSchema = z.string().uuid("Run ID must be a valid UUID format");

/**
 * GET /api/agent/runs/[id]
 * Retrieves the full execution status, step history, research facts, and ICP score
 * for a specific agent run.
 *
 * Requirements:
 * - Server-side authentication (ADMIN, SALES_OPERATOR, VIEWER).
 * - Distinguishes invalid ID format (400) from non-existent run (404).
 * - Sanitizes response: strips raw scraped HTML and internal credential leakage.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate (VIEWER is permitted to inspect run results)
  const auth = authenticateRequest(req, ["ADMIN", "SALES_OPERATOR", "VIEWER"]);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Resolve route parameters (Next.js 15 Promise-based params)
  const { id } = await context.params;

  // 3. Validate ID format
  const validation = UuidSchema.safeParse(id);
  if (!validation.success) {
    return jsonError(
      400,
      "INVALID_ID_FORMAT",
      "Run ID must be a valid UUID format",
      validation.error.errors
    );
  }

  try {
    const agentRepo = new AgentRepository();
    const leadRepo = new LeadRepository();

    const run = await agentRepo.getRun(id);
    if (!run) {
      return jsonError(404, "NOT_FOUND", `Agent run with ID '${id}' was not found`);
    }

    const [steps, research, score, leadResult] = await Promise.all([
      agentRepo.getRunSteps(id),
      agentRepo.getCompanyResearch(run.lead_id),
      agentRepo.getLeadScore(run.lead_id),
      leadRepo.getLeadWithAudit(run.lead_id),
    ]);

    const sanitizedSteps = steps.map((s) => ({
      id: s.id,
      stepNumber: s.step_number,
      toolName: s.tool_name,
      tokensUsed: s.tokens_used,
      costUsd: s.cost_usd,
      durationMs: s.duration_ms,
      retryCount: s.retry_count,
      backoffMs: s.backoff_ms,
      triggerStatusCode: s.trigger_status_code,
      createdAt: s.created_at,
    }));

    return jsonSuccess(
      {
        run: {
          id: run.id,
          leadId: run.lead_id,
          state: run.state,
          currentStep: run.current_step,
          maxSteps: run.max_steps,
          toolCallsCount: run.tool_calls_count,
          maxToolCalls: run.max_tool_calls,
          accruedCostUsd: run.accrued_cost_usd,
          budgetLimitUsd: run.budget_limit_usd,
          versionId: run.version_id,
          errorCode: run.error_code,
          errorDetails: run.error_details,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        },
        lead: leadResult.lead
          ? {
              id: leadResult.lead.id,
              companyName: leadResult.lead.company_name,
              websiteUrl: leadResult.lead.website_url,
              status: leadResult.lead.status,
            }
          : null,
        steps: sanitizedSteps,
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
              tier: score.tier,
              criteriaBreakdown: score.criteria_breakdown,
              missingInfo: score.missing_info,
              evidenceUrls: score.evidence_urls,
              rationale: score.rationale,
              createdAt: score.created_at,
            }
          : null,
      },
      200
    );
  } catch (error: unknown) {
    console.error(
      `[GET /api/agent/runs/${id}] Error retrieving run:`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to retrieve agent run details");
  }
}
