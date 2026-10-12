import { z } from "zod";
import type { Collector, Snapshot } from "../collect.js";
import { audit } from "../audit.js";

/**
 * Tool registry. Every tool that a socket client can trigger goes through
 * invokeTool() below — the single choke point that (1) rejects unknown
 * tools, (2) schema-validates args, (3) enforces the destructive gate BEFORE
 * any execution, and (4) writes started/ok/error audit entries around it.
 *
 * Tools close over the Collector so they read the freshest snapshot at
 * execution time rather than one captured before streaming started.
 */

export interface AgentTool {
  name: string;
  describe: string;
  /** Input schema; args failing this are denied, not sanitized. */
  schema: z.ZodTypeAny;
  /** If true, runs only when ALLOW_DESTRUCTIVE_TOOLS === "true". */
  destructive: boolean;
  run(args: unknown): Promise<string>;
}

export interface ToolCtx {
  userId: string;
}

const emptyArgsSchema = z.object({}).strict();

/** --- tool implementations (behavior unchanged from Phase 4) --- */

function observeImpl(snapshot: Snapshot): string {
  return snapshot.nodes
    .map(
      (n) =>
        `${n.id} [${n.kind}] status=${n.status}` +
        (n.metrics ? ` cpu=${n.metrics.cpu}% mem=${n.metrics.mem}%` : ""),
    )
    .join("\n");
}

function diagnoseImpl(snapshot: Snapshot): string {
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
}

function proposeImpl(snapshot: Snapshot): string {
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
}

/**
 * Build the registry bound to a collector. Only invokeTool() may execute
 * entries from this registry — see runner.ts.
 */
export function buildRegistry(collector: Collector): Record<string, AgentTool> {
  const fetchSnapshot = async (): Promise<Snapshot> => collector.snapshot();
  return {
    observe: {
      name: "observe",
      describe: "Read the latest live telemetry snapshot",
      schema: emptyArgsSchema,
      destructive: false,
      async run() {
        const snap = await fetchSnapshot();
        // observe covers the whole graph, not just one node id.
        return observeImpl(snap);
      },
    },
    diagnose: {
      name: "diagnose",
      describe: "Rank unhealthy nodes and hypothesize a cause",
      schema: emptyArgsSchema,
      destructive: false,
      async run() {
        return diagnoseImpl(await fetchSnapshot());
      },
    },
    propose: {
      name: "propose",
      describe: "Suggest concrete, reversible remediation steps",
      schema: emptyArgsSchema,
      destructive: false,
      async run() {
        return proposeImpl(await fetchSnapshot());
      },
    },
  };
}

/**
 * THE choke point. The only way any tool executes in this package — the
 * single tool-execution call site lives here. Order is load-bearing:
 *   unknown → schema → destructive gate → audit(started) → run → audit(ok/error)
 * The destructive gate strictly precedes tool.run — an expensive or mutating
 * tool must never execute just to be denied afterward.
 */
export async function invokeTool(
  name: string,
  rawArgs: unknown,
  ctx: { userId: string },
  registry: Record<string, AgentTool>,
): Promise<unknown> {
  const tool = registry[name];

  // 1. unknown tool
  if (!tool) {
    await audit.write({
      ts: Date.now(),
      userId: ctx.userId,
      action: "tool.call",
      tool: name,
      result: "denied",
      detail: "unknown tool",
    });
    throw new Error(`unknown tool: ${name}`);
  }

  // 2. schema parse (deny on failure)
  let parsed: unknown;
  try {
    parsed = tool.schema.parse(rawArgs ?? {});
  } catch {
    await audit.write({
      ts: Date.now(),
      userId: ctx.userId,
      action: "tool.call",
      tool: name,
      args: rawArgs,
      result: "denied",
      detail: "schema parse failed",
    });
    throw new Error(`invalid args for ${name}`);
  }

  // 3. destructive gate — MUST run BEFORE tool.run
  if (tool.destructive) {
    if (process.env.ALLOW_DESTRUCTIVE_TOOLS !== "true") {
      await audit.write({
        ts: Date.now(),
        userId: ctx.userId,
        action: "tool.call",
        tool: name,
        args: parsed,
        result: "denied",
        detail: "destructive tools disabled by env",
      });
      throw new Error("destructive tools disabled");
    }
  }

  // 4. audit STARTED before execution
  await audit.write({
    ts: Date.now(),
    userId: ctx.userId,
    action: "tool.call",
    tool: name,
    args: parsed,
    result: "started",
  });

  // 5. run — the single tool-execution call site in this package
  try {
    const out = await tool.run(parsed);
    await audit.write({
      ts: Date.now(),
      userId: ctx.userId,
      action: "tool.call",
      tool: name,
      args: parsed,
      result: "ok",
    });
    return out;
  } catch (e: any) {
    await audit.write({
      ts: Date.now(),
      userId: ctx.userId,
      action: "tool.call",
      tool: name,
      args: parsed,
      result: "error",
      detail: String(e?.message ?? e),
    });
    throw e;
  }
}
