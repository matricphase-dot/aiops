import { create } from "zustand";
import { mockSnapshot } from "./data/mockSnapshot";
import type { TelemetrySnapshot } from "./types";

interface CockpitState {
  snapshot: TelemetrySnapshot;
  selectedNodeId: string | null;
  setSnapshot: (snapshot: TelemetrySnapshot) => void;
  selectNode: (id: string | null) => void;
}

export const useStore = create<CockpitState>((set) => ({
  snapshot: mockSnapshot,
  selectedNodeId: null,
  // Phase 3 seam: packages/web/src/socket.ts calls
  // useStore.getState().setSnapshot(s) on every telemetry:snapshot event.
  setSnapshot: (snapshot) => set({ snapshot }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
}));
