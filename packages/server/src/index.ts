import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
import { attachAgent } from "./agent/runner.js";
import { createCollector } from "./collect.js";
import { emitSnapshots } from "./loop.js";
import { installAuth } from "./auth.js";
import { installHttpAuth } from "./http-auth.js";
import { installProposalRoutes } from "./routes/proposals.js";
import { SOCKET_PORT } from "./config.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));
installHttpAuth(app);          // /api/login · /api/logout · /api/me
installProposalRoutes(app);    // /api/proposals/*
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

// Startup guard ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â production must never boot with auth off.
// Verified by inspection only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â exercising this kills the process.
// Re-verify manually before the first production deploy.
if (process.env.NODE_ENV === "production" && process.env.AUTH_DISABLED === "true") {
  console.error("[auth] FATAL: AUTH_DISABLED=true is not allowed in production");
  process.exit(1);
}

installAuth(io);
console.log(
  process.env.AUTH_DISABLED === "true"
    ? "[auth] DISABLED ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â dev only"
    : "[auth] enabled (JWT)",
);

const collector = await createCollector();

io.on("connection", (socket) => {
  console.log(`[io] client connected ${socket.id} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${collector.describe()}`);
  emitSnapshots(io, collector);
  attachAgent(io, socket, collector);
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(
    `[telemetry] listening on :${SOCKET_PORT} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${collector.describe()}`,
  );
  console.log(
    process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
      ? `[http-auth] login route enabled for ${process.env.ADMIN_EMAIL}`
      : "[http-auth] ADMIN_EMAIL/ADMIN_PASSWORD unset ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â /api/login will deny all",
  );
});
