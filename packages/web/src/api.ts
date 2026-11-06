import { getToken } from "./auth";

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

export const api = {
  createProposal: (body: { runId: string; diff: string; target?: string }) =>
    request<Proposal>("/api/proposals", { method: "POST", body: JSON.stringify(body) }),
  listProposals: () => request<Proposal[]>("/api/proposals"),
  getProposal: (id: string) => request<Proposal>(`/api/proposals/${id}`),
  getDiff: async (id: string) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/proposals/${id}/diff`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.text();
  },
  requestApply: (id: string) => request<Proposal>(`/api/proposals/${id}/request`, { method: "POST" }),
  approve: (id: string) => request<Proposal>(`/api/proposals/${id}/approve`, { method: "POST" }),
  reject: (id: string, reason: string) => request<Proposal>(`/api/proposals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
};