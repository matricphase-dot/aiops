import type { Server, Socket } from "socket.io";
import type { Collector } from "../collect.js";
import { buildRegistry, invokeTool } from "./tools.js";
import { audit } from "../audit.js";

/**
 * Agent run loop. Gated by the Phase 5 safety layer:
 *   - unauthenticated sockets are rejected before anything streams
 *   - every agent run start is audited
 *   - every tool call goes through invokeTool() (the single choke point that
 *     schema-checks args, enforces the destructive gate, and audits the call)
 * The streaming format is unchanged from Phase 4: plan header, then
 * agent:token chunks (48 chars, 24 ms apart), then agent:done.
 */
export function attachAgent(
  _io: Server,
  socket: Socket,
  collector: Collector,
): void {
  const registry = buildRegistry(collector);

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

    const steps = ["observe", "diagnose", "propose"] as const;

    try {
      const headers: string[] = [`goal: ${prompt}`, "plan: " + steps.join(" → "), ""];
      await stream(socket, headers.join("\n") + "\n");

      for (const step of steps) {
        const result = (await invokeTool(step, {}, { userId: user.id }, registry)) as string;
        await stream(socket, `\n[${step}]\n${result}\n`);
      }

      await stream(socket, "\n=== run complete ===");
      socket.emit("agent:done");
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

const CHUNK = 48; // chars per emitted token — keeps the UI visibly streaming
const PAUSE_MS = 24;

async function stream(socket: Socket, text: string): Promise<void> {
  for (let i = 0; i < text.length; i += CHUNK) {
    socket.emit("agent:token", text.slice(i, i + CHUNK));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}
