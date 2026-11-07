import { create } from "zustand";
import { mockSnapshot } from "./data/mockSnapshot";
import type { TelemetrySnapshot } from "./types";

interface CockpitState {
  snapshot: TelemetrySnapshot;
  selected: string | null;
  setSnapshot: (snapshot: TelemetrySnapshot) => void;
  select: (id: string | null) => void;
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;
}

export const useStore = create<CockpitState>((set) => ({
  snapshot: mockSnapshot,
  selected: null,
  selectedNodeId: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  select: (id) => set({ selected: id, selectedNodeId: id }),
  selectNode: (id) => set({ selected: id, selectedNodeId: id }),
}));