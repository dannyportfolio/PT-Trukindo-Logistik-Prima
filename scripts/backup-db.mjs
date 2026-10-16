// Automated logical backup of the AstraOps PostgreSQL database.
//
// Produces a compressed custom-format dump (pg_dump -Fc) and prunes backups older
// than BACKUP_RETENTION_DAYS (default 30) so the retention requirement is always met.
//
// Usage:
//   npm run db:backup
//
// Relevant environment variables:
//   DATABASE_URL / MIGRATION_DATABASE_URL  source connection (migration role preferred)
//   BACKUP_DIR                             destination directory (default ./backups)
//   BACKUP_RETENTION_DAYS                  retention window in days (default 30)
//   BACKUP_DOCKER_SERVICE                  compose service for docker fallback (default postgres)

import fs from "node:fs";
import path from "node:path";
import { resolveConnection, redactConnection, parseConnection, runPg, pickMode, toText } from "./lib/pg-cli.mjs";

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(process.cwd(), "backups");
const RETENTION_DAYS = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
const DUMP_PATTERN = /^astraops_.*\.(dump|sql|tar|gz)$/;

function log(message) {
  console.log(`[db:backup] ${message}`);
}

function fail(message) {
  console.error(`[db:backup] ERROR: ${message}`);
  process.exit(1);
}

function pruneExpiredBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return 0;
  }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const entry of fs.readdirSync(BACKUP_DIR)) {
    if (!DUMP_PATTERN.test(entry)) {
      continue;
    }
    const fullPath = path.join(BACKUP_DIR, entry);
    const { mtimeMs } = fs.statSync(fullPath);
    if (mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      removed += 1;
      log(`pruned expired backup (>${RETENTION_DAYS}d): ${entry}`);
    }
  }
  return removed;
}

function main() {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS < 1) {
    fail(`BACKUP_RETENTION_DAYS must be a positive integer, received "${process.env.BACKUP_RETENTION_DAYS}"`);
  }

  const connection = resolveConnection();
  const { user, database } = parseConnection(connection);
  const mode = pickMode("pg_dump");

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `astraops_${stamp}.dump`;
  const outFile = path.join(BACKUP_DIR, filename);

  log(`source      : ${redactConnection(connection)}`);
  log(`destination : ${outFile}`);
  log(`retention   : ${RETENTION_DAYS} days`);
  log(`pg_dump     : ${mode} mode`);

  const result = runPg(
    "pg_dump",
    ["-U", user, "-d", database, "--format=custom", "--no-owner", "--no-privileges"],
    { connection, mode }
  );

  if (result.error) {
    fail(`failed to execute pg_dump: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`pg_dump exited with code ${result.status}: ${toText(result.stderr).trim()}`);
  }

  const payload = result.stdout;
  if (!payload || payload.length === 0) {
    fail("pg_dump produced an empty dump; aborting");
  }

  fs.writeFileSync(outFile, payload);
  const { size } = fs.statSync(outFile);
  if (size === 0) {
    fail("written dump file is empty; aborting");
  }

  log(`backup written: ${filename} (${(size / 1024).toFixed(1)} KiB)`);

  const removed = pruneExpiredBackups();
  log(`retention prune complete: ${removed} file(s) removed`);

  const available = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^astraops_.*\.dump$/.test(f))
    .sort();
  log(`available backups: ${available.length}`);
  for (const file of available) {
    log(`  - ${file}`);
  }
}

main();
