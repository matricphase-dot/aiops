import { create } from "zustand";
import { mockSnapshot } from "./data/mockSnapshot";
import type { TelemetrySnapshot } from "./types";

interface CockpitState {
  snapshot: TelemetrySnapshot;
  /** 3D-map node under the cursor/point-gesture (null = nothing). */
  selected: string | null;
  setSnapshot: (snapshot: TelemetrySnapshot) => void;
  select: (id: string | null) => void;
  /** Legacy alias kept for phase-3-era call sites. */
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;
}

export const useStore = create<CockpitState>((set) => ({
  snapshot: mockSnapshot,
  selected: null,
  selectedNodeId: null, // same value as selected — one alias, mirrored below
  // Phase 3 seam: packages/web/src/socket.ts calls
  // useStore.getState().setSnapshot(s) on every telemetry:snapshot event.
  setSnapshot: (snapshot) => set({ snapshot }),
  select: (id) => set({ selected: id, selectedNodeId: id }),
  selectNode: (id) => set({ selected: id, selectedNodeId: id }),
}));
