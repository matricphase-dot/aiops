import { z } from "zod";

// Single source of truth for the snapshot contract. The server produces these
// objects; the web app parses every socket payload against them before it
// touches the store.

export const NodeKind = z.enum(["host", "container", "cloud"]);
export const NodeStatus = z.enum(["healthy", "degraded", "down"]);

export const TopoNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKind,
  status: NodeStatus,
  position: z.tuple([z.number(), z.number(), z.number()]),
  metrics: z
    .object({
      cpu: z.number().min(0).max(100).optional(),
      mem: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export const TopoEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const TelemetrySnapshot = z.object({
  ts: z.number(),
  nodes: z.array(TopoNode),
  edges: z.array(TopoEdge),
});

export type NodeKind = z.infer<typeof NodeKind>;
export type NodeStatus = z.infer<typeof NodeStatus>;
export type TopoNode = z.infer<typeof TopoNode>;
export type TopoEdge = z.infer<typeof TopoEdge>;
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshot>;
