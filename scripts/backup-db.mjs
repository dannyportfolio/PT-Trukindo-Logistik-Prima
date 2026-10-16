#!/usr/bin/env node

/**
 * Automated PostgreSQL Database Backup Script for PT Trukindo Logistik Prima / AstraOps
 * 
 * Features:
 * - Logical snapshot with gzip compression streaming (zero temp uncompressed file)
 * - SHA-256 checksum generation for backup integrity verification
 * - Configurable retention policy (default: 30 days) with automatic pruning
 * - Supports direct pg_dump or docker exec container dump
 * - Structured audit logs with execution duration, file size, and checksum
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { spawn } from "child_process";

const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
const BACKUP_DIR = path.resolve(process.cwd(), process.env.BACKUP_DIR || "backups");
const CONTAINER_NAME = process.env.BACKUP_CONTAINER_NAME || "trukindo-postgres-prod";
const DB_NAME = process.env.POSTGRES_DB || "astraops_prod";
const DB_USER = process.env.POSTGRES_USER || "astraops_admin";

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
}

function pruneOldBackups(backupDir, retentionDays) {
  if (!fs.existsSync(backupDir)) return 0;

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  let prunedCount = 0;

  const files = fs.readdirSync(backupDir);
  for (const file of files) {
    if (file.startsWith("backup_astraops_") && (file.endsWith(".sql.gz") || file.endsWith(".sha256"))) {
      const filePath = path.join(backupDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          prunedCount++;
          console.log(`[Backup Prune] Removed expired backup file: ${file}`);
        }
      } catch (err) {
        console.warn(`[Backup Prune] Warning: unable to check/remove ${file}:`, err.message);
      }
    }
  }

  return prunedCount;
}

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function spawnDumpProcess() {
  const connString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

  // Mode 1: Direct pg_dump CLI if available
  if (process.env.USE_DOCKER_DUMP !== "true") {
    const dumpArgs = connString ? [connString] : ["-U", DB_USER, "-d", DB_NAME];
    return {
      cmd: "pg_dump",
      args: dumpArgs,
      proc: spawn("pg_dump", dumpArgs, { stdio: ["ignore", "pipe", "pipe"] }),
    };
  }

  // Mode 2: Docker container exec pg_dump
  const dockerArgs = ["exec", "-i", CONTAINER_NAME, "pg_dump", "-U", DB_USER, "-d", DB_NAME];
  return {
    cmd: "docker",
    args: dockerArgs,
    proc: spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] }),
  };
}

async function runBackup() {
  const startTime = Date.now();
  console.log("=================================================");
  console.log(" AstraOps Database Backup Initiated");
  console.log(` Timestamp: ${new Date().toISOString()}`);
  console.log(` Target DB: ${DB_NAME} (User: ${DB_USER})`);
  console.log("=================================================");

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[Backup] Created backup target directory: ${BACKUP_DIR}`);
  }

  const timestampStr = formatTimestamp();
  const backupFileName = `backup_astraops_${timestampStr}.sql.gz`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  const checksumFilePath = path.join(BACKUP_DIR, `${backupFileName}.sha256`);

  console.log(`[Backup] Streaming dump to: ${backupFileName}`);

  await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnDumpProcess();
    } catch (err) {
      return reject(new Error(`Failed to spawn dump process: ${err.message}`));
    }

    const { proc, cmd } = child;
    const gzip = zlib.createGzip({ level: 9 });
    const outputStream = fs.createWriteStream(backupFilePath);

    let stderrData = "";
    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Executable '${cmd}' not found in PATH. Ensure PostgreSQL client tools or Docker are installed.`
          )
        );
      } else {
        reject(err);
      }
    });

    proc.stdout.pipe(gzip).pipe(outputStream);

    outputStream.on("finish", () => {
      if (stderrData.length > 0 && !stderrData.includes("NOTICE")) {
        console.warn(`[Backup Warnings]:\n${stderrData}`);
      }
      resolve();
    });

    outputStream.on("error", reject);
    gzip.on("error", reject);
  });

  // Calculate SHA-256 Checksum
  const checksum = await computeFileSha256(backupFilePath);
  const fileStat = fs.statSync(backupFilePath);
  const sizeMb = (fileStat.size / (1024 * 1024)).toFixed(2);

  fs.writeFileSync(checksumFilePath, `${checksum}  ${backupFileName}\n`, "utf8");

  // Prune expired backups according to retention policy
  const pruned = pruneOldBackups(BACKUP_DIR, RETENTION_DAYS);

  const durationMs = Date.now() - startTime;

  console.log("\n=================================================");
  console.log(" AstraOps Database Backup Completed Successfully");
  console.log(` File:       ${backupFileName}`);
  console.log(` Size:       ${sizeMb} MB (${fileStat.size} bytes)`);
  console.log(` SHA-256:    ${checksum}`);
  console.log(` Duration:   ${durationMs} ms`);
  console.log(` Pruned:     ${pruned} old files (> ${RETENTION_DAYS} days)`);
  console.log("=================================================\n");
}

export { formatTimestamp, pruneOldBackups, computeFileSha256, runBackup };

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("backup-db.mjs") || 
  process.argv[1].endsWith("backup-db")
);

if (isDirectRun) {
  runBackup().catch((err) => {
    console.error("\n[Backup FAILED]:", err.message);
    process.exit(1);
  });
}
