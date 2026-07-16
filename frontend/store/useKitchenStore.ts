"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildNewModule, buildSampleKitchen, calculateKitchenMaterials } from "@/services/kitchenData";
import type {
  BoardMaterial, CountertopMaterial, ExteriorTextureId, KitchenDraft, KitchenModule, KitchenModuleType,
  ModuleCategory, OpeningType, WallOpening, WallSide,
} from "@/types/kitchen";

// Categories whose visible faces (doors, drawer fronts, exterior side panels,
// a zócalo's front) are built from the exterior board — the set the global
// materials tool homogenizes in one shot.
const EXTERIOR_CATEGORIES: ModuleCategory[] = ["lower", "upper", "tower", "accessory"];

// ─── Initial State ─────────────────────────────────────────────────────────────
const initialDraft: KitchenDraft = {
  clientName: "",
  clientPhone: "",
  projectName: "Cocina nueva",
  notes: "",
  roomWidth: 400,
  roomDepth: 300,
  ceilingHeight: 240,
  modules: [],
  openings: [],
  editingModuleId: null,
};

// Openings are pinned to the wall's world-space length (roomWidth for north/south,
// roomDepth for east/west) — needed to default-center a new opening and to clamp
// edits so it can't be dragged past the wall's corners.
function wallLengthFor(wall: WallSide, roomWidth: number, roomDepth: number): number {
  return wall === "north" || wall === "south" ? roomWidth : roomDepth;
}

function clampOffset(offset: number, width: number, wallLength: number): number {
  const half = width / 2;
  if (wallLength <= width) return wallLength / 2;
  return Math.min(Math.max(offset, half), wallLength - half);
}

// A position a module was dragged FROM, kept just long enough to undo an
// accidental drag (e.g. grabbing a module while trying to orbit the camera).
interface MoveHistoryEntry {
  moduleId: string;
  x: number;
  z: number;
}
const MOVE_HISTORY_LIMIT = 3;

// ─── Store Interface ───────────────────────────────────────────────────────────
interface KitchenStore {
  draft: KitchenDraft;
  // Panel UI state (not persisted in draft)
  showSelector: boolean;
  selectorCategory: ModuleCategory | null;
  activeTab: "builder" | "3d" | "summary";
  moveHistory: MoveHistoryEntry[];

  // Project actions
  updateProject: (payload: Partial<Pick<KitchenDraft, "clientName" | "clientPhone" | "projectName" | "notes" | "roomWidth" | "roomDepth" | "ceilingHeight">>) => void;
  resetDraft: () => void;
  loadSampleKitchen: () => void;

  // Module actions
  addModule: (type: KitchenModuleType) => void;
  removeModule: (id: string) => void;
  updateModule: (id: string, patch: Partial<Pick<KitchenModule, "label" | "dimensions" | "options" | "x" | "z" | "rotation">>) => void;
  updateModulePosition: (id: string, x: number, z: number) => void;
  rotateModule: (id: string) => void;
  duplicateModule: (id: string) => void;
  undoLastMove: () => void;

  // Bulk material actions — homogenize every relevant module in one click
  // instead of opening each one's inspector individually.
  applyExteriorToAll: (material: BoardMaterial, texture: ExteriorTextureId) => number;
  applyCountertopToAll: (material: CountertopMaterial, color: string, texture: ExteriorTextureId | "ninguna") => number;

  // Opening actions (windows & doors)
  addOpening: (type: OpeningType, wall: WallSide) => void;
  removeOpening: (id: string) => void;
  updateOpening: (id: string, patch: Partial<Pick<WallOpening, "wall" | "offset" | "width" | "height" | "sillHeight">>) => void;

  // Selection / editing
  setEditingModule: (id: string | null) => void;

  // Selector panel
  openSelector: (category?: ModuleCategory) => void;
  closeSelector: () => void;
  setSelectorCategory: (category: ModuleCategory | null) => void;

  // Tab
  setActiveTab: (tab: "builder" | "3d" | "summary") => void;

  // Computed helpers (not reactive, call as needed)
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
      activeTab: "3d",
      moveHistory: [],

      // ── Project actions ───────────────────────────────────────────────────
      updateProject: (payload) =>
        set((s) => ({ draft: { ...s.draft, ...payload } })),

      resetDraft: () =>
        set({ draft: { ...initialDraft }, showSelector: false, selectorCategory: null, activeTab: "3d", moveHistory: [] }),

      loadSampleKitchen: () =>
        set({ draft: buildSampleKitchen(), showSelector: false, selectorCategory: null, activeTab: "3d", moveHistory: [] }),

      // ── Module actions ────────────────────────────────────────────────────
      addModule: (type) =>
        set((s) => {
          const entry = buildNewModule(type); // used only to read default dimensions for placement
          const { x, z } = computeDefaultPlacement(s.draft.modules, entry.dimensions.width, entry.dimensions.depth, s.draft.roomWidth);
          const newModule = { ...entry, x, z };
          return {
            draft: { ...s.draft, modules: [...s.draft.modules, newModule], editingModuleId: newModule.id },
            showSelector: false,
          };
        }),

      removeModule: (id) =>
        set((s) => ({
          moveHistory: s.moveHistory.filter((h) => h.moduleId !== id),
          draft: {
            ...s.draft,
            modules: s.draft.modules.filter((m) => m.id !== id),
            editingModuleId: s.draft.editingModuleId === id ? null : s.draft.editingModuleId,
          },
        })),

      updateModule: (id, patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              m.id === id ? { ...m, ...patch, dimensions: patch.dimensions ? { ...m.dimensions, ...patch.dimensions } : m.dimensions, options: patch.options ? { ...m.options, ...patch.options } : m.options } : m
            ),
          },
        })),

      updateModulePosition: (id, x, z) =>
        set((s) => {
          const current = s.draft.modules.find((m) => m.id === id);
          // Record where it was dragged FROM (not to) — undo restores this.
          // Only the most recent few are kept; older entries just fall off.
          const history = current && (current.x !== x || current.z !== z)
            ? [...s.moveHistory, { moduleId: id, x: current.x, z: current.z }].slice(-MOVE_HISTORY_LIMIT)
            : s.moveHistory;
          return {
            moveHistory: history,
            draft: { ...s.draft, modules: s.draft.modules.map((m) => (m.id === id ? { ...m, x, z } : m)) },
          };
        }),

      undoLastMove: () =>
        set((s) => {
          const history = [...s.moveHistory];
          const last = history.pop();
          if (!last) return {};
          return {
            moveHistory: history,
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) => (m.id === last.moduleId ? { ...m, x: last.x, z: last.z } : m)),
            },
          };
        }),

      rotateModule: (id) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              m.id === id ? { ...m, rotation: ((m.rotation + 90) % 360) as KitchenModule["rotation"] } : m
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
            x: original.x + 20,
          };
          const idx = s.draft.modules.findIndex((m) => m.id === id);
          const updated = [...s.draft.modules.slice(0, idx + 1), copy, ...s.draft.modules.slice(idx + 1)];
          return { draft: { ...s.draft, modules: updated, editingModuleId: copy.id } };
        }),

      // ── Bulk material actions ──────────────────────────────────────────────
      applyExteriorToAll: (material, texture) => {
        const affected = get().draft.modules.filter((m) => EXTERIOR_CATEGORIES.includes(m.category)).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              EXTERIOR_CATEGORIES.includes(m.category)
                ? { ...m, options: { ...m.options, exteriorMaterial: material, exteriorTexture: texture } }
                : m
            ),
          },
        }));
        return affected;
      },

      applyCountertopToAll: (material, color, texture) => {
        const hasCountertop = (m: KitchenModule) => m.category === "countertop" || m.options.includesCountertop;
        const affected = get().draft.modules.filter(hasCountertop).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              hasCountertop(m)
                ? { ...m, options: { ...m.options, countertopMaterial: material, countertopColor: color, countertopTexture: texture } }
                : m
            ),
          },
        }));
        return affected;
      },

      // ── Opening actions ───────────────────────────────────────────────────
      addOpening: (type, wall) =>
        set((s) => {
          const wallLength = wallLengthFor(wall, s.draft.roomWidth, s.draft.roomDepth);
          const defaults = type === "window"
            ? { width: 100, height: 120, sillHeight: 90 }
            : { width: 90, height: 205, sillHeight: 0 };
          const width = Math.min(defaults.width, Math.max(wallLength - 10, 40));
          const opening: WallOpening = {
            id: `${type}_${Date.now()}`,
            type,
            wall,
            offset: clampOffset(wallLength / 2, width, wallLength),
            width,
            height: defaults.height,
            sillHeight: defaults.sillHeight,
          };
          return { draft: { ...s.draft, openings: [...s.draft.openings, opening] } };
        }),

      removeOpening: (id) =>
        set((s) => ({ draft: { ...s.draft, openings: s.draft.openings.filter((o) => o.id !== id) } })),

      updateOpening: (id, patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            openings: s.draft.openings.map((o) => {
              if (o.id !== id) return o;
              const merged = { ...o, ...patch };
              const wallLength = wallLengthFor(merged.wall, s.draft.roomWidth, s.draft.roomDepth);
              merged.width = Math.min(Math.max(merged.width, 40), wallLength);
              merged.offset = clampOffset(merged.offset, merged.width, wallLength);
              return merged;
            }),
          },
        })),

      // ── Selection ─────────────────────────────────────────────────────────
      setEditingModule: (id) =>
        set((s) => ({ draft: { ...s.draft, editingModuleId: id }, showSelector: id === null ? s.showSelector : false })),

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
      getEditingModule: () => {
        const { draft } = get();
        return draft.modules.find((m) => m.id === draft.editingModuleId);
      },

      getMaterials: () => calculateKitchenMaterials(get().draft.modules),
    }),
    {
      // Bumped from "kitchen-draft-v2": added the `openings` array (windows &
      // doors) to the draft shape, so old localStorage drafts are intentionally
      // orphaned instead of migrated (see v1→v2 bump above for precedent).
      name: "kitchen-draft-v3",
      partialize: (state) => ({ draft: state.draft }),
    }
  )
);

// ─── Helpers ───────────────────────────────────────────────────────────────────
// Simple placement heuristic for newly added modules — no neighbor-collision
// awareness, just a "good enough" cascade against the room's top wall (z≈0),
// wrapping into a new row when it would overflow the room's width. Modules
// placed this way keep rotation 0 (back faces -Z, i.e. the top wall).
const ROW_GAP_CM = 10;

function computeDefaultPlacement(modules: KitchenModule[], width: number, depth: number, roomWidth: number): { x: number; z: number } {
  const rowModules = modules.filter((m) => m.rotation === 0);
  if (rowModules.length === 0) {
    return { x: width / 2, z: depth / 2 };
  }

  const rows = new Map<number, KitchenModule[]>();
  for (const m of rowModules) {
    const list = rows.get(m.z) ?? [];
    list.push(m);
    rows.set(m.z, list);
  }
  const lastZ = Math.max(...rows.keys());
  const lastRow = rows.get(lastZ)!;
  const usedWidth = lastRow.reduce((sum, m) => sum + m.dimensions.width, 0);

  if (usedWidth + width <= roomWidth) {
    return { x: usedWidth + width / 2, z: lastZ };
  }

  const maxDepthInRow = Math.max(...lastRow.map((m) => m.dimensions.depth));
  const rowFarEdge = lastZ + maxDepthInRow / 2;
  return { x: width / 2, z: rowFarEdge + ROW_GAP_CM + depth / 2 };
}
