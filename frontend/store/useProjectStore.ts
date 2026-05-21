"use client";

import { create } from "zustand";
import { calculateMaterials, quoteTotals, type FurnitureType, type MaterialKind } from "@/services/materialCalculator";

export interface ProjectDraft {
  clientName: string;
  clientPhone: string;
  projectName: string;
  type: FurnitureType;
  height: number;
  width: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
  material: MaterialKind;
  color: string;
  notes: string;
}

const initialDraft: ProjectDraft = {
  clientName: "",
  clientPhone: "",
  projectName: "",
  type: "Closet",
  height: 220,
  width: 180,
  depth: 60,
  shelves: 3,
  drawers: 2,
  doors: 2,
  material: "Melamina nogal",
  color: "#8b5e3c",
  notes: "",
};

interface ProjectStore {
  draft: ProjectDraft;
  step: number;
  updateDraft: (payload: Partial<ProjectDraft>) => void;
  setStep: (step: number) => void;
  resetDraft: () => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  draft: initialDraft,
  step: 1,
  updateDraft: (payload) => set((state) => ({ draft: { ...state.draft, ...payload } })),
  setStep: (step) => set({ step }),
  resetDraft: () => set({ draft: initialDraft, step: 1 }),
}));

export function getDraftMaterials(draft: ProjectDraft) {
  return calculateMaterials({
    type: draft.type,
    width: draft.width,
    height: draft.height,
    depth: draft.depth,
    shelves: draft.shelves,
    drawers: draft.drawers,
    doors: draft.doors,
    material: draft.material,
  });
}

export function getDraftQuote(draft: ProjectDraft) {
  return quoteTotals(getDraftMaterials(draft));
}
