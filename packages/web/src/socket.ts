import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@aiops/shared";
import { useStore } from "./store";
import { getToken, clearToken } from "./auth";

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * Demo mode is fully offline: never construct a socket, so there is no
 * handshake attempt, no "connection refused" terminal noise, and no
 * unauthorized reconnect loop while recording. Consumers already treat
 * `socket === null` as "no live stream" and fall back to local demo data.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = isDemoMode
  ? null
  : (() => {
      const token = getToken() || import.meta.env.VITE_DEV_TOKEN || "";
      if (!token) return null;
      const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";
      return io(serverUrl, { transports: ["websocket"], auth: { token } });
    })();

if (socket) {
  socket.on("connect", () => {
    if (import.meta.env.DEV) console.log("[socket] connected", socket.id);
  });
  socket.on("telemetry:snapshot", (s) => useStore.getState().setSnapshot(s));
  socket.on("connect_error", (err) => {
    if (err.message === "unauthorized") {
      clearToken();
      window.location.reload();
    }
  });
}
