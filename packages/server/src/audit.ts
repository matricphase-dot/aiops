import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Append-only JSONL audit log. Best-effort by design: a failure to WRITE an
 * audit entry must never take down the caller (agent run, tool exec), so
 * write() swallows and logs. readTail() is for humans/ops, loud failures are
 * fine there.
 *
 * No rotation, no deletion, no truncation — ever.
 */

export interface AuditEntry {
  ts: number;
  userId: string;
  action: string;
  tool?: string;
  args?: unknown;
  result: "started" | "ok" | "denied" | "error";
  detail?: string;
}

const auditPath = path.resolve(
  process.cwd(),
  process.env.AUDIT_LOG_PATH ?? "./audit.log",
);

function serialize(entry: AuditEntry): string {
  return JSON.stringify(entry) + "\n";
}

export const audit = {
  async write(entry: AuditEntry): Promise<void> {
    try {
      await fs.appendFile(auditPath, serialize(entry), { mode: 0o600 });
    } catch (err) {
      // Best-effort: never crash a tool or agent run over logging.
      console.error("[audit] write failed:", err instanceof Error ? err.message : err);
    }
  },

  async readTail(n: number): Promise<AuditEntry[]> {
    try {
      const raw = await fs.readFile(auditPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim() !== "")
        .slice(-n)
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return []; // no log yet is not an error
      }
      throw err;
    }
  },
};
