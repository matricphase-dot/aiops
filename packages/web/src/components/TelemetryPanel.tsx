import { useStore } from "../store";
import { socket } from "../socket";
import type { NodeStatus } from "../types";

const DOT: Record<NodeStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

export default function TelemetryPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectNode = useStore((s) => s.selectNode);
  const connected = socket.connected;

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h1 className="text-xs font-semibold tracking-[0.2em] text-zinc-400">
          TELEMETRY
        </h1>
        <span
          className={
            connected
              ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30"
              : "rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 ring-1 ring-amber-500/30"
          }
        >
          {connected ? "LIVE" : "MOCK"}
        </span>
      </header>

      <ul className="flex-1 overflow-y-auto p-2">
        {snapshot.nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          return (
            <li key={node.id}>
              <button
                data-selected={selected || undefined}
                onClick={() => selectNode(selected ? null : node.id)}
                className={`mb-1 flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition ${
                  selected
                    ? "border-zinc-600 bg-zinc-800"
                    : "border-transparent hover:bg-zinc-900"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT[node.status]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-200">
                    {node.label}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {node.kind}
                    {node.metrics
                      ? ` · cpu ${node.metrics.cpu}% · mem ${node.metrics.mem}%`
                      : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
        snapshot {new Date(snapshot.ts).toLocaleTimeString()} ·{" "}
        {snapshot.nodes.length} nodes · {snapshot.edges.length} edges
      </footer>
    </aside>
  );
}
