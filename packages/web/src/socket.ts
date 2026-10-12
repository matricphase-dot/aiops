import { io, type Socket } from "socket.io-client";
import { TelemetrySnapshot } from "@aiops/shared";
import { useStore } from "./store";
import { getToken, clearToken } from "./auth";

// The Phase 3 seam: every telemetry:snapshot from the server is schema-checked
// and pushed into the store, replacing the mock snapshot.
//
// Phase 6: token preference is the login-session token first, then the dev
// env token. With neither, we don't even open a socket — the cockpit is
// behind the LoginPage, so there is nothing to talk to yet.

let socket: Socket | null = null;

const loginToken = getToken();
const devToken = import.meta.env.VITE_DEV_TOKEN as string | undefined;
const token = loginToken ?? devToken;

if (!token) {
  console.warn("[socket] no token (session or VITE_DEV_TOKEN) — connection skipped");
} else {
  socket = io("http://localhost:8787", {
    auth: { token },
  });

  socket.on("telemetry:snapshot", (raw: unknown) => {
    const parsed = TelemetrySnapshot.safeParse(raw);
    if (!parsed.success) {
      console.warn("[socket] bad snapshot payload, ignoring:", parsed.error.issues[0]?.message);
      return;
    }
    useStore.getState().setSnapshot(parsed.data);
  });

  socket.on("connect", () => console.log("[socket] telemetry link up"));
  socket.on("disconnect", (reason: string) =>
    console.warn("[socket] telemetry link down:", reason),
  );

  // Expired/invalid JWT: drop the dead token and start over at the login page.
  socket.on("connect_error", (err: Error) => {
    if (err.message === "unauthorized") {
      clearToken();
      window.location.reload();
    }
  });
}

export { socket };
