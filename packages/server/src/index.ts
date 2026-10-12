import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
import { attachAgent } from "./agent/runner.js";
import { createCollector } from "./collect.js";
import { emitSnapshots } from "./loop.js";
import { installAuth } from "./auth.js";
import { SOCKET_PORT } from "./config.js";

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

// Startup guard — production must never boot with auth off.
// Verified by inspection only — exercising this kills the process.
// Re-verify manually before the first production deploy.
if (process.env.NODE_ENV === "production" && process.env.AUTH_DISABLED === "true") {
  console.error("[auth] FATAL: AUTH_DISABLED=true is not allowed in production");
  process.exit(1);
}

installAuth(io);
console.log(
  process.env.AUTH_DISABLED === "true"
    ? "[auth] DISABLED — dev only"
    : "[auth] enabled (JWT)",
);

const collector = await createCollector();

io.on("connection", (socket) => {
  console.log(`[io] client connected ${socket.id} — ${collector.describe()}`);
  emitSnapshots(io, collector);
  attachAgent(io, socket, collector);
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(
    `[telemetry] listening on :${SOCKET_PORT} — ${collector.describe()}`,
  );
});
