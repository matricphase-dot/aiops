import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@aiops/shared";
import { useStore } from "./store";
import { getToken, clearToken } from "./auth";

// Set to true if you want to run without a backend (uses mock data)
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

const token = getToken() || import.meta.env.VITE_DEV_TOKEN || "";

// Only connect if we have a token or auth is disabled on the backend
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> | null =
  token
    ? io(import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787", {
        transports: ["websocket"],
        auth: { token },
      })
    : null;

if (socket) {
  socket.on("connect", () => console.log("[socket] connected", socket.id));
  socket.on("telemetry:snapshot", (s) => useStore.getState().setSnapshot(s));
  socket.on("agent:event", (e) => useStore.getState().pushAgent(e));
  
  socket.on("connect_error", (err) => {
    if (err.message === "unauthorized") {
      clearToken();
      window.location.reload();
    }
  });
}