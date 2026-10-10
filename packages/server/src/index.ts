import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
// Phase 4: import { AgentRunner } from "./agent/runner.js";
import { createCollector } from "./collect.js";
import { emitSnapshots } from "./loop.js";
import { SOCKET_PORT } from "./config.js";

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

const collector = await createCollector();

io.on("connection", (socket) => {
  console.log(`[io] client connected ${socket.id} — ${collector.describe()}`);
  emitSnapshots(io, collector);
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(
    `[telemetry] listening on :${SOCKET_PORT} — ${collector.describe()}`,
  );
});
