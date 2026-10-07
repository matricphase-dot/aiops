import { useState } from "react";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export default function AgentPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Cockpit agent online. Describe an incident and I'll diagnose it — the tool graph gets wired in Phase 4.",
    },
  ]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { role: "user", text },
      {
        role: "assistant",
        text: "Not wired yet — Phase 4 connects this panel to the LangGraph run. 🧩",
      },
    ]);
    setDraft("");
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-xs font-semibold tracking-[0.2em] text-zinc-400">
          AGENT
        </h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-sky-600/20 text-sky-100 ring-1 ring-sky-500/30"
                  : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t border-zinc-800 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe an incident…"
          className="min-w-0 flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-600"
        />
        <button
          onClick={send}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Send
        </button>
      </div>
    </aside>
  );
}
