import { useCallback, useEffect, useRef, useState } from "react";
import { isDemoMode, socket } from "../socket";
import { api } from "../api";
import { DEMO_DIAGNOSIS, MOCK_DIFF } from "../data/demo";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const CHUNK = 32; // chars per demo tick — fast enough to read as live streaming
const TICK_MS = 16;

export default function AgentPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Cockpit agent online. Describe an incident and I'll diagnose it against the live telemetry (observe → diagnose → propose).",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const demoTimers = useRef<number[]>([]);

  const clearDemoTimers = useCallback(() => {
    for (const id of demoTimers.current) window.clearTimeout(id);
    demoTimers.current = [];
  }, []);

  useEffect(() => clearDemoTimers, [clearDemoTimers]);

  // Live agent stream (socket.io). In demo mode `socket` is null, so this
  // never attaches and nothing reaches the network.
  useEffect(() => {
    if (!socket) return; // no token / demo mode — cockpit falls back to local data
    const s = socket; // local alias so the cleanup closure sees a non-null socket
    const onToken = (tok: string) => {
      setMessages((m) => {
        const copy = [...m];
        const lastMsg = copy[copy.length - 1];
        if (lastMsg?.role === "assistant") {
          copy[copy.length - 1] = { ...lastMsg, text: lastMsg.text + tok };
        }
        return copy;
      });
    };
    const onDone = () => setRunning(false);
    const onError = (msg: string) => {
      setRunning(false);
      setMessages((m) => [...m, { role: "assistant", text: `⚠ ${msg}` }]);
    };

    s.on("agent:token", onToken);
    s.on("agent:done", onDone);
    s.on("agent:error", onError);
    return () => {
      s.off("agent:token", onToken);
      s.off("agent:done", onDone);
      s.off("agent:error", onError);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  /** Stream the canned diagnosis locally — no socket, no fetch, deterministic. */
  const streamDemoRun = () => {
    clearDemoTimers();
    setDemoReady(false);
    const text = DEMO_DIAGNOSIS;
    const chunks = Math.ceil(text.length / CHUNK);
    for (let i = 1; i <= chunks; i++) {
      const id = window.setTimeout(() => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (!last || last.role !== "assistant") return copy;
          copy[copy.length - 1] = { ...last, text: text.slice(0, i * CHUNK) };
          return copy;
        });
        if (i === chunks) {
          setRunning(false);
          setDemoReady(true);
        }
      }, i * TICK_MS);
      demoTimers.current.push(id);
    }
  };

  const send = () => {
    const prompt = draft.trim();
    if (!prompt || running) return;
    if (!isDemoMode && !socket) return;

    setMessages((m) => [
      ...m,
      { role: "user", text: prompt },
      { role: "assistant", text: "" }, // the stream fills this
    ]);
    setDraft("");
    setRunning(true);

    if (isDemoMode) {
      streamDemoRun();
      return;
    }
    socket?.emit("agent:run", { prompt });
  };

  /** Demo-only shortcut: turn the streamed diagnosis into the mock proposal. */
  const saveProposal = async () => {
    try {
      const p = await api.createProposal({
        runId: "run_demo_0001",
        diff: MOCK_DIFF,
        target: "deploy/worker-queue.yaml",
      });
      window.dispatchEvent(new CustomEvent("aiops:open-proposals"));
      alert(`Proposal created: ${p.id}`);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xs font-semibold tracking-[0.2em] text-zinc-400">
            AGENT
          </h1>
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("aiops:open-proposals"))
            }
            className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Proposals
          </button>
        </div>
        {running && (
          <span className="animate-pulse text-[10px] font-semibold text-sky-400">
            running…
          </span>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => {
          if (m.role === "assistant" && i === messages.length - 1 && running && m.text === "") {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-500 ring-1 ring-zinc-800">
                  <span className="animate-pulse">▊</span>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-sky-600/20 text-sky-100 ring-1 ring-sky-500/30"
                    : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {isDemoMode && demoReady && !running && (
        <div className="border-t border-zinc-800 px-3 pt-3">
          <button
            onClick={() => void saveProposal()}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Save as proposal
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-zinc-800 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe an incident…"
          disabled={running}
          className="min-w-0 flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-600 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={running}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </aside>
  );
}
