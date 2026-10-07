// Phase 3 seam: these types move to @aiops/shared as zod schemas.
export type NodeKind = "host" | "container" | "cloud";
export type NodeStatus = "healthy" | "degraded" | "down";

export interface TopoNode {
  id: string;
  label: string;
  kind: NodeKind;
  status: NodeStatus;
  position: [number, number, number];
  metrics?: { cpu?: number; mem?: number };
}

export interface TopoEdge {
  id: string;
  source: string;
  target: string;
}

export interface TelemetrySnapshot {
  ts: number;
  nodes: TopoNode[];
  edges: TopoEdge[];
}
