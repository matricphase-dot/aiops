import type { Server, Socket } from "socket.io";
import type { Collector } from "../collect.js";
import { buildTools } from "./tools.js";

/**
 * Deterministic plan→observe→diagnose→propose run loop. Streams text tokens
 * back to the client via agent:token / agent:Done events. Not LLM-backed yet
 * (that needs the phase 5 safety layer around any model-in-the-loop use).
 */
export function attachAgent(
  _io: Server,
  socket: Socket,
  collector: Collector,
): void {
  socket.on("agent:run", async (raw: unknown) => {
    const goal =
      typeof raw === "object" && raw && typeof (raw as { prompt?: unknown }).prompt === "string"
        ? (raw as { prompt: string }).prompt.trim()
        : "";
    if (!goal) {
      socket.emit("agent:error", "agent:run requires { prompt: string }");
      return;
    }

    const tools = buildTools(collector);
    const steps = ["observe", "diagnose", "propose"] as const;

    try {
      const snapshot = await collector.snapshot();
      const headers: string[] = [`goal: ${goal}`, "plan: " + steps.join(" → "), ""];

      // Stream the header, then each tool's contribution as a paragraph.
      const buffer = headers.join("\n") + "\n";
      await stream(socket, buffer);

      for (const step of steps) {
        const tool = tools.find((t) => t.name === step)!;
        const result = (await tool.run({ goal, snapshot })) as string;
        const chunk = `\n[${step}]\n${result}\n`;
        await stream(socket, chunk);
      }

      await stream(socket, "\n=== run complete ===");
      socket.emit("agent:done");
    } catch (err) {
      console.warn(
        "[agent] run failed:",
        err instanceof Error ? err.message : err,
      );
      socket.emit("agent:error", "agent run failed — check server logs");
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
