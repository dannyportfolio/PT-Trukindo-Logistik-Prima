import { test, expect } from "@playwright/test";
import { getPool, closePools } from "@/lib/db";
import { AgentRepository } from "@/lib/agent/repository";

test.describe("Browser Human-in-the-Loop Review & Research Dossier Flow", () => {
  let awaitingApprovalLeadId: string;
  let insufficientEvidenceLeadId: string;

  test.beforeAll(async () => {
    const pool = getPool();
    const agentRepo = new AgentRepository(pool);
    const ts = Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    // 1. Seed Awaiting Approval Lead
    const lead1Res = await pool.query(
      `INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
       VALUES ($1, $2, $3, $4, 'INGESTED')
       RETURNING *;`,
      [
        `Awaiting Corp ${ts}`,
        `https://awaiting-${ts}.example.com`,
        "Alice Operator",
        `alice_${ts}@e2e-review.example`,
      ]
    );
    const lead1 = lead1Res.rows[0];
    awaitingApprovalLeadId = lead1.id;

    const run1 = await agentRepo.createRun({
      leadId: lead1.id,
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.saveCompanyResearch({
      leadId: lead1.id,
      runId: run1.id,
      industry: "Enterprise B2B Cloud Telemetry",
      companySize: "100-250 employees",
      offerings: ["Continuous Cloud Monitoring", "Automated Posture Management"],
      techStack: ["TypeScript", "Next.js", "PostgreSQL"],
      summary: "AstraOps evaluated enterprise B2B platform with verified citations.",
      contentHash: "hash-e2e-awaiting-1",
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.saveLeadScore({
      leadId: lead1.id,
      runId: run1.id,
      score: 86,
      confidence: 0.88,
      evidenceCoverage: 0.82,
      tier: "TIER_1",
      criteriaBreakdown: {
        industry: { score: 28, maxScore: 30, verified: true, evidence: "Cloud Telemetry" },
        company_size: { score: 20, maxScore: 25, verified: true, evidence: "100-250 employees" },
        offerings: { score: 22, maxScore: 25, verified: true, evidence: "Continuous Monitoring" },
        tech_stack: { score: 16, maxScore: 20, verified: true, evidence: "Next.js, PostgreSQL" },
      },
      missingInfo: [],
      evidenceUrls: [`https://awaiting-${ts}.example.com/platform`],
      rationale: "Strong alignment with B2B Enterprise ICP",
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await pool.query("UPDATE agent_runs SET state = 'AWAITING_APPROVAL' WHERE id = $1;", [run1.id]);
    await pool.query("UPDATE leads SET status = 'AWAITING_APPROVAL' WHERE id = $1;", [lead1.id]);

    // 2. Seed Insufficient Evidence Lead
    const lead2Res = await pool.query(
      `INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
       VALUES ($1, $2, $3, $4, 'INGESTED')
       RETURNING *;`,
      [
        `Stealth Corp ${ts}`,
        `https://stealth-${ts}.example.com`,
        "Bob Stealth",
        `bob_${ts}@e2e-review.example`,
      ]
    );
    const lead2 = lead2Res.rows[0];
    insufficientEvidenceLeadId = lead2.id;

    const run2 = await agentRepo.createRun({
      leadId: lead2.id,
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.saveCompanyResearch({
      leadId: lead2.id,
      runId: run2.id,
      industry: "Stealth AI Security",
      companySize: "10-50 employees",
      offerings: [],
      techStack: ["Python"],
      summary: "Early stealth startup without public product offerings.",
      contentHash: "hash-e2e-stealth-2",
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.saveLeadScore({
      leadId: lead2.id,
      runId: run2.id,
      score: 62,
      confidence: 0.50,
      evidenceCoverage: 0.45,
      tier: "INSUFFICIENT_EVIDENCE",
      criteriaBreakdown: {
        industry: { score: 25, maxScore: 30, verified: true, evidence: "AI Security" },
        company_size: { score: 15, maxScore: 25, verified: true, evidence: "10-50" },
        offerings: { score: 12.5, maxScore: 25, verified: false, evidence: null },
        tech_stack: { score: 10, maxScore: 20, verified: false, evidence: null },
      },
      missingInfo: ["Verified primary offerings citation", "Evidence coverage below 70%"],
      evidenceUrls: [],
      rationale: "Routed to INSUFFICIENT_EVIDENCE due to unevidenced core offerings",
      actorId: "seed_e2e_operator",
      actorRole: "SALES_OPERATOR",
    });

    await pool.query("UPDATE agent_runs SET state = 'INSUFFICIENT_EVIDENCE' WHERE id = $1;", [run2.id]);
    await pool.query("UPDATE leads SET status = 'INSUFFICIENT_EVIDENCE' WHERE id = $1;", [lead2.id]);
  });

  test.afterAll(async () => {
    const pool = getPool();
    try {
      await pool.query("DELETE FROM audit_logs WHERE actor_id LIKE '%e2e_operator%';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@e2e-review.example';");
    } catch {
      // ignore cleanup
    }
    await closePools();
  });

  test("Operator reviews AWAITING_APPROVAL lead: inspects facts, scores, citations and approves to QUALIFIED", async ({
    page,
  }) => {
    // 1. Authenticate via Operator modal
    await page.goto("/leads");
    await page.waitForLoadState("networkidle");

    const authBtn = page.getByRole("button", { name: "Authenticate" });
    await authBtn.click();
    await page.locator("#operator-token").fill("astraops-secret-token");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.locator("header").getByText("SALES_OPERATOR")).toBeVisible({ timeout: 10000 });

    // 2. Navigate to Awaiting Approval Lead Detail
    await page.goto(`/leads/${awaitingApprovalLeadId}`);
    await page.waitForLoadState("networkidle");

    // 3. Verify Dossier & ICP Score Presentation
    await expect(page.getByText("AWAITING APPROVAL").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("TIER 1").first()).toBeVisible();

    // Verify Facts
    await expect(page.getByText("Enterprise B2B Cloud Telemetry")).toBeVisible();
    await expect(page.getByText("Continuous Cloud Monitoring")).toBeVisible();
    await expect(page.getByText("Automated Posture Management")).toBeVisible();

    // Verify Score & Metrics
    await expect(page.getByText("86/100")).toBeVisible();
    await expect(page.getByText("88%")).toBeVisible(); // Confidence
    await expect(page.getByText("82%")).toBeVisible(); // Evidence Coverage

    // Verify Review Gate Banner is displayed
    await expect(page.getByText("Qualification Complete — Awaiting Sales Operator Decision")).toBeVisible();

    // 4. Submit Human Review Approval
    const approveBtn = page.locator("#approve-lead-btn");
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // 5. Verify Transition to QUALIFIED & Immutable Audit Log
    await expect(page.getByText(/Lead is now QUALIFIED/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".card").getByText("HUMAN_REVIEW_DECISION")).toBeVisible();
  });

  test("Operator reviews INSUFFICIENT_EVIDENCE lead: authorizes manual override with rationale to QUALIFIED", async ({
    page,
  }) => {
    // 1. Authenticate
    await page.goto("/leads");
    await page.waitForLoadState("networkidle");

    const authIndicator = page.locator("header").getByText("SALES_OPERATOR");
    if (!(await authIndicator.isVisible())) {
      const authBtn = page.getByRole("button", { name: "Authenticate" });
      await authBtn.click();
      await page.locator("#operator-token").fill("astraops-secret-token");
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page.locator("header").getByText("SALES_OPERATOR")).toBeVisible({ timeout: 10000 });
    }

    // 2. Navigate to Insufficient Evidence Lead Detail
    await page.goto(`/leads/${insufficientEvidenceLeadId}`);
    await page.waitForLoadState("networkidle");

    // 3. Verify Insufficient Evidence Banner
    await expect(page.getByText("INSUFFICIENT EVIDENCE").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Insufficient Evidence Gate Triggered")).toBeVisible();
    await expect(page.getByText("Missing Evidence Factors:")).toBeVisible();

    // 4. Open Manual Override Modal
    const overrideBtn = page.locator("#override-approve-btn");
    await expect(overrideBtn).toBeVisible();
    await overrideBtn.click();

    // Verify modal elements
    await expect(page.getByText("Authorize Manual Override: Insufficient Evidence")).toBeVisible();
    const rationaleInput = page.locator("#override-rationale");
    const confirmCheckbox = page.locator("#override-confirm");

    // Fill in justification rationale and confirm
    await rationaleInput.fill("Verified company founders and enterprise scale via direct Zoom demo and SEC filing");
    await confirmCheckbox.check();

    // Submit override
    await page.getByRole("button", { name: "Confirm Override & Qualify" }).click();

    // 5. Verify status updated to QUALIFIED
    await expect(page.getByText(/Lead is now QUALIFIED/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".card").getByText("HUMAN_REVIEW_DECISION")).toBeVisible();
  });
});
