import http from "http";
import https from "https";
import tls from "tls";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { checkDatabaseHealth, getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";
import { scrapeWebsite } from "@/lib/agent/tools/scraper";
import { DnsLookupFn, ProhibitedIpError } from "@/lib/agent/tools/ssrf-guard";

describe("Live PostgreSQL Integration Suite: Scraper Security & Failure Auditing", () => {
  let isDbHealthy = false;
  let leadRepo: LeadRepository;
  let agentRepo: AgentRepository;

  let httpServer: http.Server;
  let httpPort: number;

  beforeAll(async () => {
    const health = await checkDatabaseHealth();
    isDbHealthy = health.isHealthy;
    if (isDbHealthy) {
      leadRepo = new LeadRepository(getPool());
      agentRepo = new AgentRepository(getPool());
    }

    // Spin up local HTTP test server
    httpServer = http.createServer((req, res) => {
      const url = req.url || "/";
      if (url === "/error500") {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<h1>Internal Server Error</h1>");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Integration Prospect Corp</title></head>
          <body>
            <h1>Automated Logistics API</h1>
            <p>Enterprise warehouse management software.</p>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer.address();
        if (addr && typeof addr === "object") {
          httpPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closePools();
  });

  async function createTestLead(prefix: string) {
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    return leadRepo.createLead({
      companyName: `${prefix} ${ts}`,
      websiteUrl: `https://${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}-${ts}.example.com`,
      contactName: `Contact ${ts}`,
      contactEmail: `lead-${ts}@example.com`,
      actorId: "scraper_test_operator",
      actorRole: "SALES_OPERATOR",
    });
  }

  it("should probe database readiness before executing integration tests", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }
    expect(isDbHealthy).toBe(true);
  });

  describe("1. Live Step Persistence in PostgreSQL", () => {
    it("should successfully record scrape step in agent_steps, update tool call count, and maintain audit log consistency", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Scrape-Step-Success");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "agent_runner",
        actorRole: "AGENT",
      });

      // Advance run to RESEARCHING state
      await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });

      const targetUrl = `http://127.0.0.1:${httpPort}/about`;
      const result = await scrapeWebsite(targetUrl, {
        allowPrivateIpsForTesting: true,
        allowCustomPortsForTesting: true,
        agentContext: {
          agentRepo,
          runId: run.id,
          stepNumber: 1,
        },
      });

      expect(result.statusCode).toBe(200);
      expect(result.title).toBe("Integration Prospect Corp");

      // Verify step was recorded in PostgreSQL agent_steps
      const pool = getPool();
      const stepCheck = await pool.query<{
        step_number: number;
        tool_name: string;
        cost_usd: string;
        tokens_used: number;
        output_payload: Record<string, unknown>;
      }>(
        "SELECT step_number, tool_name, cost_usd, tokens_used, output_payload FROM agent_steps WHERE run_id = $1;",
        [run.id]
      );

      expect(stepCheck.rows).toHaveLength(1);
      const step = stepCheck.rows[0];
      expect(step.step_number).toBe(1);
      expect(step.tool_name).toBe("scrapeWebsite");
      expect(Number(step.cost_usd)).toBe(0);
      expect(step.tokens_used).toBe(0);
      expect(step.output_payload.title).toBe("Integration Prospect Corp");
      expect(step.output_payload.statusCode).toBe(200);

      // Verify run tool_calls_count was incremented to 1
      const updatedRun = await agentRepo.getRun(run.id);
      expect(updatedRun?.tool_calls_count).toBe(1);
      expect(updatedRun?.current_step).toBe(1);

      // Verify leads.status remains RESEARCHING (not corrupted)
      const { lead: fetchedLead } = await leadRepo.getLeadWithAudit(lead.id);
      expect(fetchedLead?.status).toBe("RESEARCHING");
    });

    it("should record failed fetch in agent_steps without destroying lead status or prior audit logs", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Scrape-Step-Failure");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "agent_runner",
      });

      await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });

      const targetUrl = `http://127.0.0.1:${httpPort}/error500`;

      // 500 is non-retryable server error
      await expect(
        scrapeWebsite(targetUrl, {
          allowPrivateIpsForTesting: true,
          allowCustomPortsForTesting: true,
          agentContext: {
            agentRepo,
            runId: run.id,
            stepNumber: 1,
          },
        })
      ).rejects.toThrow();

      // Verify failed attempt was logged in agent_steps
      const pool = getPool();
      const stepCheck = await pool.query<{
        step_number: number;
        tool_name: string;
        output_payload: Record<string, unknown>;
      }>(
        "SELECT step_number, tool_name, output_payload FROM agent_steps WHERE run_id = $1;",
        [run.id]
      );

      expect(stepCheck.rows).toHaveLength(1);
      expect(stepCheck.rows[0].tool_name).toBe("scrapeWebsite");
      expect(stepCheck.rows[0].output_payload.errorCode).toBeDefined();

      // Lead status must still be RESEARCHING (intact)
      const { lead: fetchedLead, auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      expect(fetchedLead?.status).toBe("RESEARCHING");

      // Audit logs must contain AGENT_RUN_CREATED and AGENT_STATE_TRANSITION intact
      const events = auditLogs.map((a) => a.event_type);
      expect(events).toContain("AGENT_RUN_CREATED");
      expect(events).toContain("AGENT_STATE_TRANSITION");
    });
  });

  describe("2. DNS Rebinding & Socket Pinning Integration", () => {
    it("should connect socket strictly to pinned IP even if DNS changes after initial resolution", async () => {
      let dnsCalls = 0;
      const mockDns: DnsLookupFn = vi.fn().mockImplementation(async () => {
        dnsCalls++;
        if (dnsCalls === 1) {
          // First call resolves to our local test server IP
          return [{ address: "127.0.0.1", family: 4 }];
        }
        // Attacker flips DNS to cloud metadata IP on second lookup
        return [{ address: "169.254.169.254", family: 4 }];
      });

      // Target URL using custom domain name
      const targetUrl = `http://rebind-test-domain.example.com:${httpPort}/`;

      const result = await scrapeWebsite(targetUrl, {
        dnsLookupFn: mockDns,
        allowPrivateIpsForTesting: true, // Allow 127.0.0.1 for local test server
        allowCustomPortsForTesting: true,
      });

      expect(result.statusCode).toBe(200);
      expect(result.title).toBe("Integration Prospect Corp");
      // DNS was resolved once during validateAndPinTarget; socket connected directly to 127.0.0.1
      expect(dnsCalls).toBe(1);
    });

    it("should reject target immediately if initial DNS resolves to cloud metadata IP", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "169.254.169.254", family: 4 },
      ]);

      const targetUrl = "http://metadata-attacker.example.com/";

      await expect(
        scrapeWebsite(targetUrl, {
          dnsLookupFn: mockDns,
          allowPrivateIpsForTesting: false,
        })
      ).rejects.toThrow(ProhibitedIpError);
    });
  });
});
