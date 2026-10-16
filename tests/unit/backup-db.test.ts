import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { formatTimestamp, pruneOldBackups, computeFileSha256 } from "../../scripts/backup-db.mjs";

describe("Database Backup Utility (backup-db.mjs)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astraops-backup-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should format timestamps into predictable YYYY-MM-DD_HHmmss pattern", () => {
    const fixedDate = new Date(2026, 9, 16, 17, 30, 45); // Oct 16, 2026, 17:30:45
    const formatted = formatTimestamp(fixedDate);
    expect(formatted).toBe("2026-10-16_173045");
  });

  it("should accurately compute SHA-256 hash of a file", async () => {
    const testFile = path.join(tempDir, "test.txt");
    fs.writeFileSync(testFile, "Hello AstraOps Backup Verification", "utf8");

    const hash = await computeFileSha256(testFile);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA-256 hex length
    expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
  });

  it("should prune backup files older than retention policy and preserve recent ones", () => {
    const recentBackup = path.join(tempDir, "backup_astraops_2026-10-15_120000.sql.gz");
    const recentSha = path.join(tempDir, "backup_astraops_2026-10-15_120000.sql.gz.sha256");
    const oldBackup = path.join(tempDir, "backup_astraops_2026-08-01_120000.sql.gz");
    const oldSha = path.join(tempDir, "backup_astraops_2026-08-01_120000.sql.gz.sha256");
    const unrelatedFile = path.join(tempDir, "other_file.txt");

    fs.writeFileSync(recentBackup, "recent dummy data");
    fs.writeFileSync(recentSha, "recent hash");
    fs.writeFileSync(oldBackup, "old dummy data");
    fs.writeFileSync(oldSha, "old hash");
    fs.writeFileSync(unrelatedFile, "unrelated data");

    // Set old file modified time to 45 days ago
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldBackup, fortyFiveDaysAgo, fortyFiveDaysAgo);
    fs.utimesSync(oldSha, fortyFiveDaysAgo, fortyFiveDaysAgo);
    fs.utimesSync(unrelatedFile, fortyFiveDaysAgo, fortyFiveDaysAgo);

    // Run pruning with 30-day retention
    const prunedCount = pruneOldBackups(tempDir, 30);

    expect(prunedCount).toBe(2); // oldBackup and oldSha
    expect(fs.existsSync(recentBackup)).toBe(true);
    expect(fs.existsSync(recentSha)).toBe(true);
    expect(fs.existsSync(oldBackup)).toBe(false);
    expect(fs.existsSync(oldSha)).toBe(false);
    // Unrelated file should never be touched
    expect(fs.existsSync(unrelatedFile)).toBe(true);
  });
});
