import "dotenv/config";
import os from "node:os";
import { io, type Socket } from "socket.io-client";
import Docker from "dockerode";
import si from "systeminformation";
import { AgentTelemetry } from "../agent/ingest.js";

/**
 * Remote Agent (Phase 7) — a tiny telemetry shipper for hosts other than the
 * one running the central server. It reads the local machine exactly the way
 * the central server's own collector does (systeminformation + dockerode) and
 * pushes a snapshot to the cockpit every AGENT_TICK_MS.
 *
 * Auth: AGENT_TOKEN travels in the socket handshake (`auth: { token }`) — the
 * same channel the browser uses for its JWT, so it never lands in a query
 * string or access log.
 */

const CENTRAL_URL = process.env.AGENT_SERVER_URL ?? "http://localhost:8787";
const TOKEN = process.env.AGENT_TOKEN;
const TICK_MS = Number(process.env.AGENT_TICK_MS ?? 5_000);

if (!TOKEN) {
  console.error("[agent] FATAL: AGENT_TOKEN is required (see .env.example)");
  process.exit(1);
}

function containerStatus(status: string): string {
  // dockerode Status strings look like "Up 3 days", "Exited (0) 2 hours ago",
  // "Paused", "Restarting". Normalize for the map's node status.
  if (/^(up|running)/i.test(status)) return "running";
  if (/paus/i.test(status)) return "paused";
  if (/restart/i.test(status)) return "restarting";
  return "exited";
}

async function collect(): Promise<AgentTelemetry> {
  const hostname = os.hostname();

  // Either read can fail; telemetry still ships with whatever we gathered so a
  // missing Docker daemon never takes the whole snapshot offline.
  const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
  const metrics = {
    cpu: Math.round(cpu.currentLoad),
    mem: Math.round((mem.used / mem.total) * 100),
  };

  let containers: AgentTelemetry["containers"] = [];
  try {
    const docker = new Docker();
    const list = await docker.listContainers({ all: true });
    containers = list.map((c) => ({
      id: c.Id.slice(0, 12),
      name: (c.Names?.[0] ?? c.Id).replace(/^\//, ""),
      status: containerStatus(c.Status ?? ""),
      image: c.Image ?? "unknown",
    }));
  } catch (err) {
    console.warn(
      "[agent] docker unavailable — omitting containers:",
      err instanceof Error ? err.message : err,
    );
  }

  return AgentTelemetry.parse({
    agentId: hostname,
    hostname,
    metrics,
    containers,
  });
}

const socket: Socket = io(CENTRAL_URL, {
  auth: { token: TOKEN },
  reconnection: true,
  reconnectionDelay: 2_000,
});

socket.on("connect", () => {
  console.log(`[agent] connected to ${CENTRAL_URL} as ${socket.id}`);
  void emit();
});
socket.on("disconnect", (reason) => {
  console.warn(`[agent] disconnected: ${reason}`);
});
socket.on("connect_error", (err) => {
  console.error(`[agent] connection failed: ${err.message}`);
});

let timer: NodeJS.Timeout | undefined;

function emit(): void {
  void collect()
    .then((payload) => {
      socket.emit("agent:telemetry", payload);
      console.log(
        `[agent] sent cpu=${payload.metrics.cpu}% mem=${payload.metrics.mem}%` +
          ` containers=${payload.containers.length}`,
      );
    })
    .catch((err: unknown) => {
      console.warn(
        "[agent] collection failed — skipping tick:",
        err instanceof Error ? err.message : err,
      );
    });
}

socket.on("connect", () => {
  // Only poll while connected; socket.io-client re-runs `connect` on every
  // reconnect, so this stays in sync with the transport.
  if (!timer) timer = setInterval(emit, TICK_MS);
});
socket.on("disconnect", () => {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
});

process.on("SIGINT", () => {
  if (timer) clearInterval(timer);
  socket.disconnect();
  process.exit(0);
});
