import { z } from "zod";
import type { Server } from "socket.io";
import type { Collector, CollectedNode, Snapshot } from "../collect.js";
import { statusFromCpuMem } from "../collect.js";

/**
 * Phase 7 — ingestion of telemetry pushed by remote agents
 * (packages/server/src/scripts/remote-agent.ts).
 *
 * The agent validates its own payload against this schema before emitting and
 * the central server validates again on arrival, so neither side can push a
 * malformed snapshot into the map. The registry is an in-memory Map keyed by
 * agentId holding the newest payload; entries older than STALE_MS stop
 * appearing on the map (and are pruned) until the agent's next tick.
 */

export const AgentTelemetry = z.object({
  agentId: z.string().min(1),
  hostname: z.string().min(1),
  metrics: z.object({
    cpu: z.number().min(0).max(100),
    mem: z.number().min(0).max(100),
  }),
  containers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      status: z.string().min(1),
      image: z.string(),
    }),
  ),
});
export type AgentTelemetry = z.infer<typeof AgentTelemetry>;

/** Drop a remote node from the map after 3 missed 5 s ticks. */
export const STALE_MS = 15_000;

interface RegistryEntry {
  telemetry: AgentTelemetry;
  last: number;
  socketId: string;
}

const registry = new Map<string, RegistryEntry>();

export function activeRemoteAgents(): AgentTelemetry[] {
  const now = Date.now();
  const live: AgentTelemetry[] = [];
  for (const [agentId, entry] of registry) {
    if (now - entry.last > STALE_MS) {
      registry.delete(agentId);
      console.log(`[agent-ingest] ${agentId} stale — dropped from map`);
    } else {
      live.push(entry.telemetry);
    }
  }
  return live;
}

/**
 * Registers the `agent:telemetry` handler on every *agent* socket. Browser
 * sockets (no isAgent flag) never receive remote-agent identity: their
 * telemetry events simply have no handler called.
 */
export function installAgentIngestion(io: Server): void {
  io.on("connection", (socket) => {
    if (!socket.data.isAgent) return;
    console.log(`[agent-ingest] remote agent connected (${socket.id})`);

    socket.on("agent:telemetry", (payload: unknown) => {
      const parsed = AgentTelemetry.safeParse(payload);
      if (!parsed.success) {
        console.warn(
          "[agent-ingest] rejected malformed telemetry:",
          parsed.error.issues.slice(0, 3).map((i) => i.message).join("; "),
        );
        return;
      }
      const { agentId } = parsed.data;
      registry.set(agentId, {
        telemetry: parsed.data,
        last: Date.now(),
        socketId: socket.id,
      });
    });

    socket.on("disconnect", () => {
      for (const [agentId, entry] of registry) {
        if (entry.socketId === socket.id) {
          registry.delete(agentId);
          console.log(`[agent-ingest] ${agentId} disconnected — removed`);
        }
      }
    });
  });
}

/** "running" et al. (agent's normalized dockerode status) → map node status. */
function remoteContainerStatus(status: string): "healthy" | "degraded" | "down" {
  if (status === "running") return "healthy";
  if (status === "exited" || status === "dead") return "down";
  return "degraded";
}

/** Remote hosts sit on an outer ring; theirs containers orbit tight beside them. */
function ringPoint(i: number, count: number, radius: number): [number, number, number] {
  const angle = (i / count) * Math.PI * 2;
  return [
    Math.round(Math.sin(angle) * radius * 100) / 100,
    0,
    Math.round(Math.cos(angle) * radius * 100) / 100,
  ];
}

/**
 * Wraps the local collector so every telemetry:snapshot includes one host node
 * (+ its containers) per live remote agent, positioned on an outer ring and
 * flagged isRemote so the UI can badge them.
 */
export function createRemoteMergedCollector(base: Collector): Collector {
  return {
    describe: () => `${base.describe()} + remote agents`,
    async snapshot(): Promise<Snapshot> {
      const snapshot = await base.snapshot();
      const agents = activeRemoteAgents();
      if (agents.length === 0) return snapshot;

      const nodes: CollectedNode[] = [...snapshot.nodes];
      const newEdges: { source: string; target: string }[] = [];
      const anchor = snapshot.nodes[0]?.id; // local host edges feed the map view

      agents.forEach((agent, i) => {
        const hostId = `remote/${agent.agentId}`;
        const hostPos = ringPoint(i, agents.length, 7);
        nodes.push({
          id: hostId,
          label: agent.hostname,
          kind: "host",
          status: statusFromCpuMem(agent.metrics.cpu, agent.metrics.mem),
          position: hostPos,
          metrics: { cpu: agent.metrics.cpu, mem: agent.metrics.mem },
          isRemote: true,
        });
        if (anchor) newEdges.push({ source: anchor, target: hostId });

        agent.containers.forEach((c, j) => {
          const radial = ringPoint(j, Math.max(1, agent.containers.length), 2.2);
          nodes.push({
            id: `remote/${agent.agentId}/${c.id}`,
            label: c.name,
            kind: "container",
            status: remoteContainerStatus(c.status),
            position: [
              Math.round((hostPos[0] + radial[0]) * 100) / 100,
              0,
              Math.round((hostPos[2] + radial[2]) * 100) / 100,
            ],
            isRemote: true,
          });
        });
      });

      // A container that vanishes between ticks must not leave a dangling edge.
      const present = new Set(nodes.map((n) => n.id));
      return {
        ...snapshot,
        nodes,
        edges: [...snapshot.edges, ...newEdges.map((e, i) => ({ id: `er-${i + 1}`, ...e }))]
          .filter((e) => present.has(e.source) && present.has(e.target)),
      };
    },
  };
}
