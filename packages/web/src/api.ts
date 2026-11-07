import { getToken } from "./auth";
import { isDemoMode } from "./socket";
import { MOCK_DIFF, MOCK_PROPOSAL } from "./data/demo";

const API_BASE = import.meta.env.VITE_SERVER_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface Proposal {
  id: string;
  runId: string;
  requester: string;
  approver: string | null;
  target: string;
  status: "draft" | "pending" | "approved" | "preflight_ok" | "pr_opened" | "rejected" | "failed";
  createdAt: number;
  updatedAt: number;
  prUrl: string | null;
  reason: string | null;
  preflight: Record<string, boolean> | null;
}

export type ProposalStatus = Proposal["status"];

export interface ProposalApi {
  createProposal: (body: { runId: string; diff: string; target?: string }) => Promise<Proposal>;
  listProposals: () => Promise<Proposal[]>;
  getProposal: (id: string) => Promise<Proposal>;
  getDiff: (id: string) => Promise<string>;
  requestApply: (id: string) => Promise<Proposal>;
  approve: (id: string) => Promise<Proposal>;
  reject: (id: string, reason: string) => Promise<Proposal>;
}

// --- live implementation -----------------------------------------------------

const liveApi: ProposalApi = {
  createProposal: (body) =>
    request<Proposal>("/api/proposals", { method: "POST", body: JSON.stringify(body) }),
  listProposals: () => request<Proposal[]>("/api/proposals"),
  getProposal: (id) => request<Proposal>(`/api/proposals/${id}`),
  getDiff: async (id) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/proposals/${id}/diff`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.text();
  },
  requestApply: (id) => request<Proposal>(`/api/proposals/${id}/request`, { method: "POST" }),
  approve: (id) => request<Proposal>(`/api/proposals/${id}/approve`, { method: "POST" }),
  reject: (id, reason) =>
    request<Proposal>(`/api/proposals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

// --- demo implementation -----------------------------------------------------
//
// No fetch(), no token, no server. The drawer starts empty; saving a hotfix
// seeds it with MOCK_PROPOSAL (carrying whatever diff the editor held), and
// lifecycle buttons mutate the same in-memory record so the flow feels real.

let demoProposals: Proposal[] = [];
let demoDiff = MOCK_DIFF;

function upsertDemo(patch: Partial<Proposal> & { id: string }): Proposal {
  const idx = demoProposals.findIndex((p) => p.id === patch.id);
  const base = idx >= 0 ? demoProposals[idx]! : { ...MOCK_PROPOSAL, id: patch.id };
  const next: Proposal = { ...base, ...patch, updatedAt: Date.now() };
  if (idx >= 0) demoProposals[idx] = next;
  else demoProposals.push(next);
  return { ...next };
}

const demoApi: ProposalApi = {
  createProposal: async (body) => {
    const now = Date.now();
    const created: Proposal = {
      ...MOCK_PROPOSAL,
      runId: body.runId,
      target: body.target ?? MOCK_PROPOSAL.target,
      status: "draft",
      approver: null,
      prUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    demoDiff = body.diff.trim() ? body.diff : MOCK_DIFF;
    demoProposals = [created]; // one clean record per take — no duplicates
    return { ...created };
  },
  listProposals: async () => demoProposals.map((p) => ({ ...p })),
  getProposal: async (id) => {
    const found = demoProposals.find((p) => p.id === id);
    return { ...(found ?? MOCK_PROPOSAL) };
  },
  getDiff: async () => demoDiff,
  requestApply: async (id) => upsertDemo({ id, status: "pending" }),
  approve: async (id) =>
    upsertDemo({
      id,
      status: "pr_opened",
      approver: "approver@aiops.dev",
      prUrl: "https://github.com/aiops/infra/pull/482",
    }),
  reject: async (id, reason) => upsertDemo({ id, status: "rejected", reason }),
};

export const api: ProposalApi = isDemoMode ? demoApi : liveApi;
