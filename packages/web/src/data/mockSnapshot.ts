import type { TelemetrySnapshot, TopoNode } from "../types";

// Circle layout — same strategy the Phase 3 server will use, so swapping
// mockSnapshot for a live telemetry:snapshot payload needs no layout changes.
function circle(i: number, n: number, radius = 5): [number, number, number] {
  const angle = (i / n) * Math.PI * 2;
  return [Math.sin(angle) * radius, 0, Math.cos(angle) * radius];
}

const defs = [
  {
    id: "host/local-dev",
    label: "local-dev",
    kind: "host",
    status: "healthy",
    metrics: { cpu: 23, mem: 61 },
  },
  {
    id: "container/api-gateway",
    label: "api-gateway",
    kind: "container",
    status: "healthy",
    metrics: { cpu: 41, mem: 38 },
  },
  {
    id: "container/worker-queue",
    label: "worker-queue",
    kind: "container",
    status: "degraded",
    metrics: { cpu: 87, mem: 74 },
  },
  {
    id: "cloud/aws-ecs-prod",
    label: "aws-ecs-prod",
    kind: "cloud",
    status: "healthy",
  },
  {
    id: "cloud/grafana-cloud",
    label: "grafana-cloud",
    kind: "cloud",
    status: "down",
  },
] satisfies Omit<TopoNode, "position">[];

// Phase 3: still the store's initial value so the UI renders before the first
// socket event lands; socket.ts replaces it with live data on connect.
export const mockSnapshot: TelemetrySnapshot = {
  ts: Date.now(),
  nodes: defs.map((def, i) => ({ ...def, position: circle(i, defs.length) })),
  edges: [
    { id: "e1", source: "host/local-dev", target: "container/api-gateway" },
    { id: "e2", source: "host/local-dev", target: "container/worker-queue" },
    { id: "e3", source: "container/api-gateway", target: "cloud/aws-ecs-prod" },
    { id: "e4", source: "container/worker-queue", target: "cloud/aws-ecs-prod" },
    { id: "e5", source: "cloud/aws-ecs-prod", target: "cloud/grafana-cloud" },
  ],
};
