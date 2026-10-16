import { useCallback, useEffect, useState } from "react";
import { api, type Proposal, type ProposalStatus } from "../api";

/**
 * Full-screen proposals review drawer: list on the left, detail + diff +
 * lifecycle actions on the right. All mutations go through the REST wrapper
 * (server enforces roles/preflight); on error we surface a red banner and
 * keep the drawer open rather than navigating away.
 */

function StatusPill({ status }: { status: ProposalStatus }) {
  const cls =
    status === "pr_opened"
      ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
      : status === "rejected" || status === "failed"
        ? "bg-red-500/10 text-red-400 ring-red-500/30"
        : status === "pending"
          ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
          : "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}>
      {status}
    </span>
  );
}

function PreflightCheck({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ring-1 ${
        pass
          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
          : "bg-red-500/10 text-red-400 ring-red-500/30"
      }`}
    >
      <span className={pass ? "text-emerald-500" : "text-red-500"}>
        {pass ? "✓" : "✗"}
      </span>
      {label}
    </span>
  );
}

export default function ProposalsDrawer({ onClose }: { onClose: () => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- data plumbing ------------------------------------------------------

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await api.listProposals();
      setProposals(list);
      // keep the currently selected one fresh if it still exists
      setSelected((cur) =>
        cur ? list.find((p) => p.id === cur.id) ?? null : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setDiff("");
      return;
    }
    let alive = true;
    api
      .getDiff(selected.id)
      .then((d) => {
        if (alive) {
          setDiff(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes, like other heavyweight overlays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // --- actions --------------------------------------------------------------

  const mutate = async (fn: () => Promise<Proposal>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const act = {
    requestApply: () => selected && mutate(() => api.requestApply(selected.id)),
    approve: () => selected && mutate(() => api.approve(selected.id)),
    reject: () => {
      if (!selected || busy) return;
      const reason = window.prompt("Rejection reason:");
      if (reason === null) return; // cancelled
      void mutate(() => api.reject(selected.id, reason));
    },
  };

  // --- render ---------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex h-full max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* LEFT — list */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-zinc-800">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold tracking-[0.2em] text-zinc-400">
              PROPOSALS
            </h2>
            <span className="text-[10px] text-zinc-600">{proposals.length}</span>
          </header>
          <div className="flex-1 overflow-y-auto">
            {proposals.length === 0 && (
              <p className="px-4 py-6 text-xs text-zinc-600">
                No proposals yet — save a hotfix from the editor.
              </p>
            )}
            {proposals.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`block w-full border-b border-zinc-900 px-3 py-2.5 text-left transition ${
                  selected?.id === p.id
                    ? "bg-zinc-800/70"
                    : "hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-zinc-200">
                    {p.id.slice(0, 8)}
                  </span>
                  <StatusPill status={p.status} />
                </div>
                <div className="mt-1 truncate text-[11px] text-zinc-500">
                  {p.requester} → {p.target ?? "—"}
                </div>
                <div className="text-[10px] text-zinc-600">
                  {new Date(p.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT — detail */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-sm text-zinc-200">
                {selected ? selected.id : "no proposal selected"}
              </h2>
              {selected && <StatusPill status={selected.status} />}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void act.requestApply()}
                disabled={busy || !selected || selected.status !== "draft"}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-40"
              >
                Request apply
              </button>
              <button
                onClick={() => void act.approve()}
                disabled={busy || !selected || selected.status !== "pending"}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                Approve &amp; open PR
              </button>
              <button
                onClick={() => act.reject()}
                disabled={busy || !selected || selected.status !== "pending"}
                className="rounded-md bg-red-900/60 px-3 py-1.5 text-xs font-medium text-red-200 ring-1 ring-red-800/60 hover:bg-red-900 disabled:opacity-40"
              >
                Reject
              </button>
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Close
              </button>
            </div>
          </header>

          {error && (
            <div className="border-b border-red-900/50 bg-red-950/60 px-4 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
              Select a proposal from the list.
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* fields */}
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-zinc-500">requester</dt>
                <dd className="text-zinc-300">{selected.requester}</dd>
                <dt className="text-zinc-500">approver</dt>
                <dd className="text-zinc-300">{selected.approver ?? "—"}</dd>
                <dt className="text-zinc-500">target</dt>
                <dd className="text-zinc-300">{selected.target ?? "—"}</dd>
                <dt className="text-zinc-500">reason</dt>
                <dd className="whitespace-pre-wrap text-zinc-300">
                  {selected.reason ?? "—"}
                </dd>
                <dt className="text-zinc-500">pr</dt>
                <dd>
                  {selected.prUrl ? (
                    <a
                      href={selected.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 underline hover:text-sky-300"
                    >
                      {selected.prUrl}
                    </a>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </dd>
              </dl>

              {/* preflight grid */}
              {selected.preflight && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <PreflightCheck label="applyCheck" pass={selected.preflight.applyCheck} />
                  <PreflightCheck label="pathAllowlist" pass={selected.preflight.pathAllowlist} />
                  <PreflightCheck label="sizeLimit" pass={selected.preflight.sizeLimit} />
                  <PreflightCheck label="noNewFiles" pass={selected.preflight.noNewFiles} />
                  <PreflightCheck label="noDeletions" pass={selected.preflight.noDeletions} />
                </div>
              )}

              {/* diff */}
              <div className="mt-4 border-t border-zinc-800 pt-3">
                <h3 className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-zinc-500">
                  DIFF
                </h3>
                <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-md bg-black px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300 ring-1 ring-zinc-800">
                  {diff || "loading…"}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
