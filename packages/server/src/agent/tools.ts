import type { Collector, Snapshot } from "../collect.js";
import type { CollectedNode } from "../collect.js";

export interface AgentTool {
  name: string;
  describe: string;
  run(args: { goal: string; snapshot: Snapshot }): Promise<string>;
}

/** Tool 1: observe the live topology snapshot. */
export function observeTool(_collector: Collector): AgentTool {
  return {
    name: "observe",
    describe: "Read the latest live telemetry snapshot",
    async run({ snapshot }) {
      const lines = snapshot.nodes.map(
        (n) =>
          `${n.id} [${n.kind}] status=${n.status}` +
          (n.metrics ? ` cpu=${n.metrics.cpu}% mem=${n.metrics.mem}%` : ""),
      );
      return lines.join("\n");
    },
  };
}

/** Tool 2: diagnose the worst nodes against the incident goal. */
export function diagnoseTool(): AgentTool {
  return {
    name: "diagnose",
    describe: "Rank unhealthy nodes and hypothesize a cause",
    async run({ snapshot }) {
      const bad = snapshot.nodes
        .filter((n) => n.status !== "healthy")
        .map((n) => ({
          n,
          score: (n.metrics?.cpu ?? 0) + (n.metrics?.mem ?? 0),
        }))
        .sort((a, b) => b.score - a.score);

      if (bad.length === 0) {
        return "No degraded or down nodes in the current snapshot. The incident may be client-side or network-related — re-run after the next tick or check external dependencies.";
      }
      const worst = bad[0];
      const m = worst.n.metrics;
      const parts: string[] = [];
      parts.push(
        `${bad.length} unhealthy node(s); worst is ${worst.n.id} (status=${worst.n.status})`,
      );
      if (m) {
        const cpu = m.cpu ?? 0;
        const mem = m.mem ?? 0;
        if (cpu >= 60) parts.push(`CPU ${cpu}%${cpu >= 85 ? " (critical)" : " (elevated)"}`);
        if (mem >= 75) parts.push(`memory ${mem}%${mem >= 90 ? " (near OOM)" : " (high)"}`);
      }
      parts.push("hypothesis: resource saturation on the most-loaded node");
      return parts.join("; ");
    },
  };
}

/** Tool 3: propose remediation steps (advisory only — action lands in phase 5+). */
export function proposeTool(): AgentTool {
  return {
    name: "propose",
    describe: "Suggest concrete, reversible remediation steps",
    async run({ snapshot }) {
      const degraded = snapshot.nodes.filter((n) => n.status !== "healthy");
      if (degraded.length === 0) {
        return "No remediation needed — topology is healthy at this tick.";
      }
      const worst = degraded
        .map((n) => ({ n, score: (n.metrics?.cpu ?? 0) + (n.metrics?.mem ?? 0) }))
        .sort((a, b) => b.score - a.score)[0];
      return [
        `For ${worst.n.id}:`,
        "1. capture a memory+CPU profile for 30s",
        "2. if mem ≥90%, prepare a scale-out (never scale down first)",
        "3. restart only after profiling confirms saturation",
        "All steps are advisory — Phase 5 adds the safety layer before any action executes.",
      ].join("\n");
    },
  };
}

export function buildTools(collector: Collector): AgentTool[] {
  return [observeTool(collector), diagnoseTool(), proposeTool()];
}

export type { CollectedNode };
