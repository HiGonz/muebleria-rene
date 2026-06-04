"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildNewModule, calculateKitchenMaterials } from "@/services/kitchenData";
import type { KitchenDraft, KitchenModule, KitchenModuleType, ModuleCategory } from "@/types/kitchen";

// ─── Initial State ─────────────────────────────────────────────────────────────
const initialDraft: KitchenDraft = {
  clientName: "",
  clientPhone: "",
  projectName: "Cocina nueva",
  notes: "",
  kitchenStyle: "Lineal",
  wallALength: 300,
  wallBLength: 200,
  wallCLength: 200,
  ceilingHeight: 240,
  modules: [],
  editingModuleId: null,
  activeWall: "A",
};

// ─── Store Interface ───────────────────────────────────────────────────────────
interface KitchenStore {
  draft: KitchenDraft;
  // Panel UI state (not persisted in draft)
  showSelector: boolean;
  selectorCategory: ModuleCategory | null;
  activeTab: "builder" | "3d" | "summary";

  // Project actions
  updateProject: (payload: Partial<Pick<KitchenDraft, "clientName" | "clientPhone" | "projectName" | "notes" | "kitchenStyle" | "wallALength" | "wallBLength" | "wallCLength" | "ceilingHeight">>) => void;
  resetDraft: () => void;

  // Module actions
  addModule: (type: KitchenModuleType) => void;
  removeModule: (id: string) => void;
  updateModule: (id: string, patch: Partial<Pick<KitchenModule, "label" | "dimensions" | "options" | "wall" | "position">>) => void;
  duplicateModule: (id: string) => void;
  reorderModules: (wallModules: KitchenModule[], wall: KitchenDraft["activeWall"]) => void;
  moveModule: (id: string, direction: "up" | "down") => void;

  // Selection / editing
  setEditingModule: (id: string | null) => void;
  setActiveWall: (wall: KitchenDraft["activeWall"]) => void;

  // Selector panel
  openSelector: (category?: ModuleCategory) => void;
  closeSelector: () => void;
  setSelectorCategory: (category: ModuleCategory | null) => void;

  // Tab
  setActiveTab: (tab: "builder" | "3d" | "summary") => void;

  // Computed helpers (not reactive, call as needed)
  getModulesByWall: (wall: KitchenDraft["activeWall"]) => KitchenModule[];
  getEditingModule: () => KitchenModule | undefined;
  getMaterials: () => ReturnType<typeof calculateKitchenMaterials>;
}

// ─── Store ─────────────────────────────────────────────────────────────────────
export const useKitchenStore = create<KitchenStore>()(
  persist(
    (set, get) => ({
      draft: initialDraft,
      showSelector: false,
      selectorCategory: null,
      activeTab: "builder",

      // ── Project actions ───────────────────────────────────────────────────
      updateProject: (payload) =>
        set((s) => ({ draft: { ...s.draft, ...payload } })),

      resetDraft: () =>
        set({ draft: { ...initialDraft }, showSelector: false, selectorCategory: null, activeTab: "builder" }),

      // ── Module actions ────────────────────────────────────────────────────
      addModule: (type) =>
        set((s) => {
          const wall = s.draft.activeWall;
          const wallModules = s.draft.modules.filter((m) => m.wall === wall);
          const newModule = buildNewModule(type, wallModules.length, wall);
          return {
            draft: { ...s.draft, modules: [...s.draft.modules, newModule], editingModuleId: newModule.id },
            showSelector: false,
          };
        }),

      removeModule: (id) =>
        set((s) => {
          const remaining = s.draft.modules.filter((m) => m.id !== id);
          // Re-index positions per wall
          const reindexed = reindexWall(remaining, s.draft.modules.find((m) => m.id === id)?.wall ?? "A");
          return { draft: { ...s.draft, modules: reindexed, editingModuleId: s.draft.editingModuleId === id ? null : s.draft.editingModuleId } };
        }),

      updateModule: (id, patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              m.id === id ? { ...m, ...patch, dimensions: patch.dimensions ? { ...m.dimensions, ...patch.dimensions } : m.dimensions, options: patch.options ? { ...m.options, ...patch.options } : m.options } : m
            ),
          },
        })),

      duplicateModule: (id) =>
        set((s) => {
          const original = s.draft.modules.find((m) => m.id === id);
          if (!original) return {};
          const copy: KitchenModule = {
            ...original,
            id: `${original.type}_${Date.now()}_copy`,
            label: `${original.label} (copia)`,
            position: original.position + 1,
          };
          // Insert after original
          const idx = s.draft.modules.findIndex((m) => m.id === id);
          const updated = [...s.draft.modules.slice(0, idx + 1), copy, ...s.draft.modules.slice(idx + 1)];
          return { draft: { ...s.draft, modules: reindexWall(updated, original.wall), editingModuleId: copy.id } };
        }),

      reorderModules: (wallModules, wall) =>
        set((s) => {
          const otherModules = s.draft.modules.filter((m) => m.wall !== wall);
          const reindexed = wallModules.map((m, i) => ({ ...m, position: i }));
          return { draft: { ...s.draft, modules: [...otherModules, ...reindexed] } };
        }),

      moveModule: (id, direction) =>
        set((s) => {
          const mod = s.draft.modules.find((m) => m.id === id);
          if (!mod) return {};
          const wallMods = s.draft.modules.filter((m) => m.wall === mod.wall).sort((a, b) => a.position - b.position);
          const idx = wallMods.findIndex((m) => m.id === id);
          const newIdx = direction === "up" ? idx - 1 : idx + 1;
          if (newIdx < 0 || newIdx >= wallMods.length) return {};
          [wallMods[idx], wallMods[newIdx]] = [wallMods[newIdx], wallMods[idx]];
          const reindexed = wallMods.map((m, i) => ({ ...m, position: i }));
          const others = s.draft.modules.filter((m) => m.wall !== mod.wall);
          return { draft: { ...s.draft, modules: [...others, ...reindexed] } };
        }),

      // ── Selection ─────────────────────────────────────────────────────────
      setEditingModule: (id) =>
        set((s) => ({ draft: { ...s.draft, editingModuleId: id }, showSelector: id === null ? s.showSelector : false })),

      setActiveWall: (wall) =>
        set((s) => ({ draft: { ...s.draft, activeWall: wall } })),

      // ── Selector panel ────────────────────────────────────────────────────
      openSelector: (category) =>
        set({ showSelector: true, selectorCategory: category ?? null }),

      closeSelector: () =>
        set({ showSelector: false }),

      setSelectorCategory: (category) =>
        set({ selectorCategory: category }),

      // ── Tab ───────────────────────────────────────────────────────────────
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ── Computed ──────────────────────────────────────────────────────────
      getModulesByWall: (wall) =>
        get()
          .draft.modules.filter((m) => m.wall === wall)
          .sort((a, b) => a.position - b.position),

      getEditingModule: () => {
        const { draft } = get();
        return draft.modules.find((m) => m.id === draft.editingModuleId);
      },

      getMaterials: () => calculateKitchenMaterials(get().draft.modules),
    }),
    {
      name: "kitchen-draft",
      partialize: (state) => ({ draft: state.draft }),
    }
  )
);

// ─── Helpers ───────────────────────────────────────────────────────────────────
function reindexWall(modules: KitchenModule[], wall: KitchenModule["wall"]): KitchenModule[] {
  let pos = 0;
  return modules.map((m) => (m.wall === wall ? { ...m, position: pos++ } : m));
}
