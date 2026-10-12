import type { Server, Socket } from "socket.io";
import type { Collector } from "../collect.js";
import { buildRegistry, invokeTool } from "./tools.js";
import { audit } from "../audit.js";
import { plan } from "./planner.js";

/**
 * Agent run loop. Gated by the Phase 5 safety layer:
 *   - unauthenticated sockets are rejected before anything streams
 *   - every agent run start is audited
 *   - every tool call goes through invokeTool() (the single choke point that
 *     schema-checks args, enforces the destructive gate, and audits the call)
 *
 * Phase 6: an optional single-shot LLM planner runs FIRST. When it returns a
 * usable plan, its steps execute through the SAME invokeTool choke point,
 * with an explicit registry allowlist check BEFORE each call (injection
 * defense: the LLM naming e.g. "shell" is denied and audited, never run).
 * When the planner returns null/empty/all-skipped, the deterministic
 * observe → diagnose → propose loop runs — IT IS THE FALLBACK, and is kept
 * byte-identical to Phase 5.
 *
 * Streaming format is unchanged: agent:token chunks (48 chars, 24 ms apart),
 * then agent:done or agent:error.
 */
export function attachAgent(
  _io: Server,
  socket: Socket,
  collector: Collector,
): void {
  const registry = buildRegistry(collector);
  const toolSpecs = Object.values(registry).map((t) => ({
    name: t.name,
    description: t.describe,
    schema: t.schema,
  }));

  socket.on("agent:run", async (raw: unknown) => {
    const promptRaw =
      typeof raw === "object" && raw && typeof (raw as { prompt?: unknown }).prompt === "string"
        ? (raw as { prompt: string }).prompt
        : "";
    const prompt = promptRaw.trim();

    // --- safety gate: no identity, no run ---
    const user = socket.data.user;
    if (!user) {
      socket.emit("agent:error", "unauthorized");
      return;
    }
    await audit.write({
      ts: Date.now(),
      userId: user.id,
      action: "agent.run",
      detail: prompt.slice(0, 500),
      result: "started",
    });

    if (!prompt) {
      socket.emit("agent:error", "agent:run requires { prompt: string }");
      await audit.write({
        ts: Date.now(),
        userId: user.id,
        action: "agent.run",
        detail: "missing prompt",
        result: "error",
      });
      return;
    }

    try {
      // --- optional planner phase ---
      const snapshot = await collector.snapshot();
      const planned = await plan(prompt, snapshot, toolSpecs);
      await audit.write({
        ts: Date.now(),
        userId: user.id,
        action: "agent.plan",
        result: planned ? "ok" : "error",
        detail: planned
          ? JSON.stringify(planned).slice(0, 2000)
          : "no plan (fallback to deterministic)",
      });

      if (planned && planned.length > 0) {
        const executed = await runPlannedSteps(socket, user.id, planned, registry);
        if (!executed) {
          // Every step was denied/failed — fall back so the user still
          // gets a diagnosis rather than a dead run.
          await runDeterministic(socket, user.id, prompt, registry);
          return;
        }
        return;
      }

      // no plan (no key, API error, empty array) — deterministic fallback
      await runDeterministic(socket, user.id, prompt, registry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[agent] run failed:", msg);
      await audit.write({
        ts: Date.now(),
        userId: user.id,
        action: "agent.run",
        detail: msg,
        result: "error",
      });
      socket.emit("agent:error", msg);
    }
  });
}

/**
 * Execute LLM-chosen steps. ALLOWLIST CHECK FIRST: a tool name that does not
 * exist in the registry is denied + audited + skipped, never executed. This
 * is the injection defense — a prompt that convinces the model to emit
 * tool:"shell" or tool:"rm" hits the denial path, not invokeTool.
 *
 * Returns true if at least one step actually executed (started→run reached),
 * false if every step was skipped before execution.
 */
async function runPlannedSteps(
  socket: Socket,
  userId: string,
  planned: { reasoning: string; tool: string; args: Record<string, unknown> }[],
  registry: ReturnType<typeof buildRegistry>,
): Promise<boolean> {
  const steps = planned.slice(0, 5); // hard cap: at most 5 planned steps
  await stream(socket, `\n[planner] ${planned.length}-step plan via ${steps.map((s) => s.tool).join(" → ")}\n`);

  let executedAny = false;

  for (const step of steps) {
    // 1. allowlist check MUST precede invokeTool — this is the injection gate.
    if (!(step.tool in registry)) {
      await audit.write({
        ts: Date.now(),
        userId,
        action: "tool.call",
        tool: step.tool,
        args: step.args,
        result: "denied",
        detail: "tool not in allowlist",
      });
      await stream(socket, `\n[planner] step skipped: "${step.tool}" is not an allowlisted tool\n`);
      continue;
    }

    try {
      // 2. the ONLY execution path — same choke point as every other caller.
      const out = (await invokeTool(step.tool, step.args, { userId }, registry)) as string;
      executedAny = true;
      await stream(socket, `\n[${step.tool}] ${step.reasoning.slice(0, 200)}\n${out}\n`);
    } catch (err) {
      // One failing step must not kill the run — log it and move on.
      const msg = err instanceof Error ? err.message : String(err);
      await stream(socket, `\n[${step.tool}] error: ${msg}\n`);
    }
  }

  await stream(socket, "\n=== run complete ===");
  socket.emit("agent:done");
  return executedAny;
}

/**
 * The EXISTING Phase 5 deterministic loop — observe → diagnose → propose.
 * This is the fallback when the planner is unavailable, denied, or empty.
 */
async function runDeterministic(
  socket: Socket,
  userId: string,
  prompt: string,
  registry: ReturnType<typeof buildRegistry>,
): Promise<void> {
  const steps = ["observe", "diagnose", "propose"] as const;

  const headers: string[] = [`goal: ${prompt}`, "plan: " + steps.join(" → "), ""];
  await stream(socket, headers.join("\n") + "\n");

  for (const step of steps) {
    const result = (await invokeTool(step, {}, { userId }, registry)) as string;
    await stream(socket, `\n[${step}]\n${result}\n`);
  }

  await stream(socket, "\n=== run complete ===");
  socket.emit("agent:done");
}

const CHUNK = 48; // chars per emitted token — keeps the UI visibly streaming
const PAUSE_MS = 24;

async function stream(socket: Socket, text: string): Promise<void> {
  for (let i = 0; i < text.length; i += CHUNK) {
    socket.emit("agent:token", text.slice(i, i + CHUNK));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}
