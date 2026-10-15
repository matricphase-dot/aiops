// packages/server/src/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitContext {
  repoRoot: string;
  remote: string;
  baseBranch: string;
}

async function run(args: string[], cwd: string, timeoutMs = 30_000) {
  return exec("git", args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
}

async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return stdout.trim();
}

export async function openFixBranch(
  ctx: GitContext,
  proposalId: string,
  diffPath: string
): Promise<{ branch: string; prUrl: string | null; commitSha: string }> {
  const { repoRoot, remote, baseBranch } = ctx;
  const originalBranch = await currentBranch(repoRoot);
  const branch = `aiops/fix-${proposalId}`;

  try {
    const { stdout: statusOut } = await run(["status", "--porcelain"], repoRoot);
    if (statusOut.trim().length > 0) {
      throw new Error("working tree not clean — refusing to apply");
    }

    await run(["fetch", remote, baseBranch], repoRoot);
    await run(["checkout", "-B", branch, `${remote}/${baseBranch}`], repoRoot);
    await run(["apply", "--whitespace=nowarn", diffPath], repoRoot);
    await run(["add", "-A"], repoRoot);
    await run(
      ["commit", "-m", `aiops: apply hotfix proposal ${proposalId}`],
      repoRoot
    );

    const { stdout: shaOut } = await run(["rev-parse", "HEAD"], repoRoot);
    const commitSha = shaOut.trim();

    await run(["push", "-u", remote, branch], repoRoot);

    let prUrl: string | null = null;
    try {
      const { stdout } = await run(
        [
          "pr", "create",
          "--title", `aiops: hotfix ${proposalId}`,
          "--body", `Automated hotfix proposal. Review before merging. Proposal: ${proposalId}`,
          "--base", baseBranch,
          "--head", branch,
        ],
        repoRoot
      );
      prUrl = stdout.trim();
    } catch {
      // gh not available — branch is already pushed
    }

    return { branch, prUrl, commitSha };
  } finally {
    try {
      await run(["checkout", originalBranch], repoRoot);
    } catch {
      // best effort
    }
  }
}