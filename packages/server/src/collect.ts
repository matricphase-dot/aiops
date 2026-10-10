import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** systeminformation, loaded lazily so the module never fails to import. */
let si: typeof import("systeminformation") | undefined;
async function getSi() {
  si ??= (await import("systeminformation")).default;
  return si;
}

export interface TopologyDef {
  hosts: { id: string; label: string }[];
  containerTargets: {
    /** Regex matched (case-insensitive) against live container names. */
    match: string;
    label: string;
    id: string;
  }[];
  cloud: {
    id: string;
    label: string;
    /** If true and AWS credentials exist, try to reflect real ECS health. */
    aws: boolean;
  }[];
  edges: { source: string; target: string }[];
}

export interface CollectedNode {
  id: string;
  label: string;
  kind: "host" | "container" | "cloud";
  status: "healthy" | "degraded" | "down";
  position: [number, number, number];
  metrics?: {
    cpu?: number;
    mem?: number;
  };
}

export interface Snapshot {
  ts: number;
  nodes: CollectedNode[];
  edges: { id: string; source: string; target: string }[];
  topology: TopologyDef;
}

export interface Collector {
  describe(): string;
  /** Build one topology snapshot (nodes with live metrics + edges). */
  snapshot(): Promise<Snapshot>;
}

function circle(i: number, n: number, radius = 5): [number, number, number] {
  const angle = (i / n) * Math.PI * 2;
  return [
    Math.round(Math.sin(angle) * radius * 100) / 100,
    0,
    Math.round(Math.cos(angle) * radius * 100) / 100,
  ];
}

function statusFromCpuMem(cpu: number, mem: number) {
  if (cpu >= 85 || mem >= 90) return "down" as const;
  if (cpu >= 60 || mem >= 75) return "degraded" as const;
  return "healthy" as const;
}

function pruneEdges(snapshot: Omit<Snapshot, "edges">): Snapshot {
  // Keep only edges whose endpoints actually exist in this tick — a container
  // that disappears must not leave a dangling edge in the payload.
  const present = new Set(snapshot.nodes.map((n) => n.id));
  return {
    ...snapshot,
    edges: snapshot.topology.edges
      .map((e, i) => ({ id: `e${i + 1}`, ...e }))
      .filter((e) => present.has(e.source) && present.has(e.target)),
  };
}

class HostCollector implements Collector {
  constructor(
    private hostId: string,
    private label: string,
    private topology: TopologyDef,
  ) {}

  describe(): string {
    return "host via systeminformation";
  }

  async snapshot(): Promise<Snapshot> {
    const si = await getSi();
    const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    const cpuPct = Math.round(cpu.currentLoad);
    const memPct = Math.round((mem.used / mem.total) * 100);
    return pruneEdges({
      ts: Date.now(),
      topology: this.topology,
      nodes: [
        {
          id: this.hostId,
          label: this.label,
          kind: "host",
          status: statusFromCpuMem(cpuPct, memPct),
          position: circle(0, 5),
          metrics: { cpu: cpuPct, mem: memPct },
        },
      ],
    });
  }
}

class DockerCollector implements Collector {
  constructor(
    private inner: Collector,
    private targets: { id: string; label: string; match: RegExp }[],
  ) {}

  describe(): string {
    return `${this.inner.describe()} + docker via dockerode`;
  }

  async snapshot(): Promise<Snapshot> {
    const partial = await this.inner.snapshot();
    const nodes = [...partial.nodes];

    if (this.targets.length > 0) {
      try {
        const { default: Docker } = await import("dockerode");
        const docker = new Docker();
        const list = await docker.listContainers({ all: false });

        for (const target of this.targets) {
          const match = list.find((c) =>
            (c.Names ?? []).some((n) =>
              target.match.test(n.replace(/^\//, "")),
            ),
          );
          if (!match) {
            // Container is stopped/removed — omit the node this tick so the
            // map reflects reality (and its edges get pruned).
            continue;
          }
          const name = (match.Names?.[0] ?? "").replace(/^\//, "");
          const s = await getSi();
          const siDocker = await s.dockerAll();
          const stats = siDocker.find(
            (d: { id?: string; name?: string }) =>
              d.id === match.Id || d.name === name,
          );
          const cpu = Math.round(stats?.cpuPercent ?? 0);
          const mem = Math.round(stats?.memUsage ?? 0);
          nodes.push({
            id: target.id,
            label: target.label,
            kind: "container",
            status: statusFromCpuMem(cpu, mem),
            position: circle(nodes.length, 5),
            metrics: { cpu, mem },
          });
        }
      } catch (err) {
        console.warn(
          "[collect] docker unavailable — container nodes omitted:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return pruneEdges({ ...partial, nodes });
  }
}

class CloudCollector implements Collector {
  constructor(
    private inner: Collector,
    private clouds: { id: string; label: string; aws: boolean }[],
  ) {}

  describe(): string {
    return `${this.inner.describe()} + cloud (${this.clouds.map((c) => c.label).join(", ")})`;
  }

  async snapshot(): Promise<Snapshot> {
    const partial = await this.inner.snapshot();
    const nodes = [
      ...partial.nodes,
      ...this.clouds.map((c) => ({
        id: c.id,
        label: c.label,
        kind: "cloud" as const,
        status: "healthy" as const,
        position: circle(partial.nodes.length, 5),
      })),
    ];

    // ECS is best-effort: only when credentials exist, and every failure
    // degrades the node gracefully instead of throwing.
    for (const cloud of this.clouds) {
      if (!cloud.aws || !process.env.AWS_ACCESS_KEY_ID) continue;
      try {
        const { ECSClient, DescribeServicesCommand } = await import(
          "@aws-sdk/client-ecs"
        );
        const client = new ECSClient({
          region: process.env.AWS_REGION ?? "us-east-1",
        });
        const cluster = process.env.AWS_ECS_CLUSTER;
        const service = process.env.AWS_ECS_SERVICE;
        if (!cluster || !service) continue;
        const res = await client.send(
          new DescribeServicesCommand({ cluster, services: [service] }),
        );
        const svc = res.services?.[0];
        if (!svc) continue;
        const running = svc.deployments?.[0]?.runningCount ?? 0;
        const desired = svc.deployments?.[0]?.desiredCount ?? 0;
        const node = nodes.find((n) => n.id === cloud.id);
        if (node) {
          node.status =
            running === 0 ? "down" : running < desired ? "degraded" : "healthy";
        }
      } catch (err) {
        console.warn(
          `[collect] ECS check failed for ${cloud.id} — node stays healthy:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return pruneEdges({ ...partial, nodes });
  }
}

export async function createCollector(): Promise<Collector> {
  const topology = readTopology();
  let collector: Collector = new HostCollector(
    topology.hosts[0]?.id ?? "host/local-dev",
    topology.hosts[0]?.label ?? "local-dev",
    topology,
  );
  if (
    process.env.ENABLE_DOCKER !== "false" &&
    topology.containerTargets.length > 0
  ) {
    collector = new DockerCollector(
      collector,
      topology.containerTargets.map((t) => ({
        id: t.id,
        label: t.label,
        match: new RegExp(t.match, "i"),
      })),
    );
  }
  if (topology.cloud.length > 0) {
    collector = new CloudCollector(collector, topology.cloud);
  }
  return collector;
}

function readTopology(): TopologyDef {
  try {
    return JSON.parse(
      readFileSync(path.join(__dirname, "topology.json"), "utf8"),
    );
  } catch {
    // Intentional dev fallback: with no topology.json, the server still emits
    // a single real host node so the cockpit is never empty.
    return {
      hosts: [{ id: "host/local-dev", label: "local-dev" }],
      containerTargets: [],
      cloud: [],
      edges: [],
    };
  }
}
