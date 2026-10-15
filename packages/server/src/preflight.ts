// packages/server/src/preflight.ts
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface PreflightInput {
  repoRoot: string;
  diffPath: string;
}

export interface PreflightResult {
  applyCheck: boolean;
  pathAllowlist: boolean;
  sizeLimit: boolean;
  noNewFiles: boolean;
  noDeletions: boolean;
  details: string[];
}

function parseDiff(diff: string) {
  const lines = diff.split("\n");
  const files = new Set<string>();
  let hasNewFile = false;
  let hasDeletion = false;
  let changedLines = 0;

  for (const line of lines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const p = line.slice(4).trim();
      if (p === "/dev/null" && line.startsWith("--- ")) hasNewFile = true;
      if (p && p !== "/dev/null") files.add(p.replace(/^[ab]\//, ""));
    }
    if (line.startsWith("+") && !line.startsWith("+++")) changedLines++;
    if (line.startsWith("-") && !line.startsWith("---")) {
      changedLines++;
      hasDeletion = true;
    }
  }

  return { files: Array.from(files), hasNewFile, hasDeletion, changedLines };
}

const ALLOWED_PREFIXES = [
  "packages/",
  "k8s/",
  "deploy/",
  "Dockerfile",
];

const MAX_CHANGED_LINES = 500;

export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const details: string[] = [];
  const result: PreflightResult = {
    applyCheck: false,
    pathAllowlist: false,
    sizeLimit: false,
    noNewFiles: false,
    noDeletions: false,
    details,
  };

  const diff = await fs.readFile(input.diffPath, "utf8");
  const parsed = parseDiff(diff);

  const offenders = parsed.files.filter(
    (f) => !ALLOWED_PREFIXES.some((p) => f === p || f.startsWith(p))
  );
  if (offenders.length === 0) {
    result.pathAllowlist = true;
  } else {
    details.push(`path allowlist: rejected paths ${offenders.join(", ")}`);
  }

  if (parsed.changedLines <= MAX_CHANGED_LINES) {
    result.sizeLimit = true;
  } else {
    details.push(`size limit: ${parsed.changedLines} > ${MAX_CHANGED_LINES}`);
  }

  if (!parsed.hasNewFile) {
    result.noNewFiles = true;
  } else {
    details.push("no new files: diff creates a new file");
  }

  if (!parsed.hasDeletion) {
    result.noDeletions = true;
  } else {
    details.push("no deletions: diff removes lines");
  }

  try {
    await exec("git", ["apply", "--check", "--whitespace=nowarn", input.diffPath], {
      cwd: input.repoRoot,
      timeout: 10_000,
    });
    result.applyCheck = true;
  } catch (e: any) {
    const msg = String(e?.stderr ?? e?.message ?? e).slice(0, 300);
    details.push(`git apply --check failed: ${msg}`);
  }

  return result;
}

export function allPassed(r: PreflightResult): boolean {
  return r.applyCheck && r.pathAllowlist && r.sizeLimit && r.noNewFiles && r.noDeletions;
}