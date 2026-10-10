import type { Server } from "socket.io";
import { TICK_MS } from "./config.js";
import type { Collector } from "./collect.js";
import { TelemetrySnapshot } from "@aiops/shared";

let timer: NodeJS.Timeout | undefined;

export function emitSnapshots(io: Server, collector: Collector): void {
  if (timer) return; // one loop shared by all clients

  const tick = async () => {
    try {
      const snapshot = await collector.snapshot();
      const parsed = TelemetrySnapshot.safeParse({
        ts: snapshot.ts,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      });
      if (!parsed.success) {
        console.warn(
          "[telemetry] snapshot failed schema validation — skipped:",
          parsed.error.issues.slice(0, 3).map((i) => i.message).join("; "),
        );
        return;
      }
      io.emit("telemetry:snapshot", parsed.data);
      console.log(
        `[telemetry] t=${snapshot.ts} nodes=${snapshot.nodes.length} edges=${snapshot.edges.length}`,
      );
    } catch (err) {
      console.warn(
        "[telemetry] snapshot collection failed — skipping tick:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  void tick(); // first snapshot immediately on connect
  timer = setInterval(tick, TICK_MS);
}

process.on("SIGINT", () => {
  if (timer) clearInterval(timer);
});
