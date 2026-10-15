// packages/server/src/proposals.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { audit } from "./audit.js";

export const ProposalStatus = z.enum([
  "draft",
  "pending",
  "approved",
  "preflight_ok",
  "pr_opened",
  "rejected",
  "failed",
]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

export const ProposalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  requester: z.string(),
  approver: z.string().nullable(),
  diffPath: z.string(),
  target: z.string(),
  status: ProposalStatus,
  createdAt: z.number(),
  updatedAt: z.number(),
  prUrl: z.string().nullable(),
  reason: z.string().nullable(),
  preflight: z.object({
    applyCheck: z.boolean(),
    pathAllowlist: z.boolean(),
    sizeLimit: z.boolean(),
    noNewFiles: z.boolean(),
    noDeletions: z.boolean(),
  }).nullable(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

const ROOT = process.env.PROPOSALS_DIR ?? path.resolve(process.cwd(), "proposals");

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true, mode: 0o750 });
}

function proposalFile(id: string) {
  return path.join(ROOT, `${id}.json`);
}

export async function createProposal(input: {
  runId: string;
  requester: string;
  diff: string;
  target: string;
}): Promise<Proposal> {
  await ensureRoot();
  const id = nanoid(12);
  const diffPath = path.join(ROOT, `${id}.diff`);
  await fs.writeFile(diffPath, input.diff, { mode: 0o640 });

  const proposal: Proposal = {
    id,
    runId: input.runId,
    requester: input.requester,
    approver: null,
    diffPath,
    target: input.target,
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prUrl: null,
    reason: null,
    preflight: null,
  };

  await writeProposal(proposal);
  await audit.write({
    ts: Date.now(),
    userId: input.requester,
    action: "proposal.create",
    result: "ok",
    detail: `proposal ${id} for run ${input.runId}`,
  });
  return proposal;
}

export async function writeProposal(p: Proposal) {
  p.updatedAt = Date.now();
  const file = proposalFile(p.id);
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(p, null, 2), { mode: 0o640 });
  await fs.rename(tmp, file);
}

export async function readProposal(id: string): Promise<Proposal | null> {
  try {
    const raw = await fs.readFile(proposalFile(id), "utf8");
    return ProposalSchema.parse(JSON.parse(raw));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function listProposals(): Promise<Proposal[]> {
  await ensureRoot();
  const entries = await fs.readdir(ROOT);
  const out: Proposal[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const id = name.replace(/\.json$/, "");
    const p = await readProposal(id);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function requestApply(id: string, requester: string): Promise<Proposal> {
  const p = await readProposal(id);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "draft") throw new Error(`cannot request from status ${p.status}`);
  if (p.requester !== requester) throw new Error("only the requester can request apply");
  p.status = "pending";
  await writeProposal(p);
  await audit.write({
    ts: Date.now(), userId: requester, action: "proposal.request", result: "ok",
    detail: `proposal ${id} -> pending`,
  });
  return p;
}

export async function approve(id: string, approver: string): Promise<Proposal> {
  const p = await readProposal(id);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "pending") throw new Error(`cannot approve from status ${p.status}`);
  if (p.requester === approver) throw new Error("requester cannot approve their own proposal");
  p.status = "approved";
  p.approver = approver;
  await writeProposal(p);
  await audit.write({
    ts: Date.now(), userId: approver, action: "proposal.approve", result: "ok",
    detail: `proposal ${id} approved by ${approver}`,
  });
  return p;
}

export async function reject(id: string, approver: string, reason: string): Promise<Proposal> {
  const p = await readProposal(id);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "pending") throw new Error(`cannot reject from status ${p.status}`);
  p.status = "rejected";
  p.approver = approver;
  p.reason = reason;
  await writeProposal(p);
  await audit.write({
    ts: Date.now(), userId: approver, action: "proposal.reject", result: "denied",
    detail: `proposal ${id}: ${reason}`,
  });
  return p;
}