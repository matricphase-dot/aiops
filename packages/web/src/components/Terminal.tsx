import { useEffect, useRef } from "react";

const LINES = [
  "[boot] aiops-cockpit v0.1.0 — phase 3 (live telemetry)",
  "[telemetry] link: socket.io → localhost:8787 (every 2s)",
  "[topology] mockSnapshot shown until first live snapshot arrives",
  "[agent] idle — graph ships in phase 4",
  "[safety] allowlist + audit log land in phase 5",
  "[hint] drag to orbit · scroll to zoom · click a node",
];

export default function Terminal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, []);

  return (
    <section className="flex min-w-0 flex-1 flex-col border-t border-zinc-800 bg-black">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <h2 className="text-xs font-semibold tracking-[0.2em] text-zinc-500">
          TERMINAL
        </h2>
      </header>
      <div
        ref={ref}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed text-emerald-400/90"
      >
        {LINES.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div>
          <span className="text-zinc-600">$</span>{" "}
          <span className="animate-pulse text-zinc-400">▊</span>
        </div>
      </div>
    </section>
  );
}
