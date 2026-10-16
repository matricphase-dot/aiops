import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export default function AgentPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Cockpit agent online. Describe an incident and I'll diagnose it against the live telemetry (observe → diagnose → propose).",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return; // no token — cockpit is behind LoginPage, no socket
    const s = socket; // local alias so the cleanup closure sees a non-null socket
    const onToken = (tok: string) => {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant" && last.text !== "__streaming__") {
          // Continuation of the streaming block already finalized below.
        }
        // The runner streams plain tokens; we append to the last assistant msg.
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

  const send = () => {
    const prompt = draft.trim();
    if (!prompt || running || !socket) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: prompt },
      { role: "assistant", text: "" }, // the stream fills this
    ]);
    setDraft("");
    setRunning(true);
    socket.emit("agent:run", { prompt });
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
