import { io } from "socket.io-client";
import { TelemetrySnapshot } from "@aiops/shared";
import { useStore } from "./store";

// The Phase 3 seam: every telemetry:snapshot from the server is schema-checked
// and pushed into the store, replacing the mock snapshot.

// Phase 5: pass the dev token in the handshake auth payload (never a query
// string — that would leak it into server access logs). No login UI, no
// localStorage; set VITE_DEV_TOKEN in .env.local for dev only.
const token = import.meta.env.VITE_DEV_TOKEN as string | undefined;
if (!token) {
  console.warn("[socket] VITE_DEV_TOKEN missing — server may reject connection");
}

export const socket = io("http://localhost:8787", {
  auth: { token: token ?? "" },
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
socket.on("disconnect", (reason: string) => console.warn("[socket] telemetry link down:", reason));
