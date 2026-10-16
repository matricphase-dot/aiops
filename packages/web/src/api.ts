import { getToken } from "./auth";

/**
 * Typed fetch wrapper for the proposals REST API. Always attaches the login
 * JWT as a Bearer header when a session exists. Non-2xx responses throw with
 * the raw response text so callers can surface the server's error message.
 *
 * Never puts the token in a query string or the body.
 */

export interface Preflight {
  applyCheck: boolean;
  pathAllowlist: boolean;
  sizeLimit: boolean;
  noNewFiles: boolean;
  noDeletions: boolean;
}

export type ProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "preflight_ok"
  | "pr_opened"
  | "rejected"
  | "failed";

export interface Proposal {
  id: string;
  runId: string;
  requester: string;
  approver: string | null;
  target: string | null;
  status: ProposalStatus;
  /** ISO string or epoch-ms — the server may emit either, Date() takes both. */
  createdAt: string | number;
  updatedAt: string | number;
  prUrl: string | null;
  reason: string | null;
  preflight: Preflight | null;
}

export interface CreateProposalBody {
  runId: string;
  diff: string;
  target?: string;
}

const BASE = "/api/proposals";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res;
}

export const api = {
  async createProposal(body: CreateProposalBody): Promise<Proposal> {
    const res = await request(BASE, { method: "POST", body: JSON.stringify(body) });
    return (await res.json()) as Proposal;
  },

  async listProposals(): Promise<Proposal[]> {
    const res = await request(BASE);
    return (await res.json()) as Proposal[];
  },

  async getProposal(id: string): Promise<Proposal> {
    const res = await request(`${BASE}/${encodeURIComponent(id)}`);
    return (await res.json()) as Proposal;
  },

  /** Raw text/plain diff for a proposal. */
  async getDiff(id: string): Promise<string> {
    const res = await request(`${BASE}/${encodeURIComponent(id)}/diff`);
    return await res.text();
  },

  async requestApply(id: string): Promise<Proposal> {
    const res = await request(`${BASE}/${encodeURIComponent(id)}/request`, { method: "POST" });
    return (await res.json()) as Proposal;
  },

  async approve(id: string): Promise<Proposal> {
    const res = await request(`${BASE}/${encodeURIComponent(id)}/approve`, { method: "POST" });
    return (await res.json()) as Proposal;
  },

  async reject(id: string, reason: string): Promise<Proposal> {
    const res = await request(`${BASE}/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return (await res.json()) as Proposal;
  },
};
