import { io } from "socket.io-client";
import { TelemetrySnapshot } from "@aiops/shared";
import { useStore } from "./store";

// The Phase 3 seam: every telemetry:snapshot from the server is schema-checked
// and pushed into the store, replacing the mock snapshot.
export const socket = io("http://localhost:8787");

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
