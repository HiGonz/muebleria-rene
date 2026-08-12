"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { buildNewModule, buildSampleKitchen, calculateKitchenMaterials, getCountertopModel, findFreeSpotNear, isFreestandingPosition, ISLAND_ELIGIBLE_CATEGORIES } from "@/services/kitchenData";
import type { SampleKitchenVariant } from "@/services/kitchenData";
import type {
  BoardMaterial, ExteriorTextureId, HardwareFinish, KitchenDraft, KitchenModule, KitchenModuleType,
  ModuleCategory, ModuleOptions, OpeningType, WallOpening, WallSide, ZocaloMaterial,
} from "@/types/kitchen";

// The fields that make up the room's shared finish — kept in sync across
// every module (see applyExteriorToAll/applyHardwareToAll/applyCountertopToAll/
// applyZocaloMaterialToAll below, wired up from ModuleInspector so any
// per-module edit fans out to the whole kitchen). A brand-new module picks
// these up from whatever's already in the room instead of falling back to
// the catalog's own hardcoded defaults, so it never shows up mismatched.
const GLOBAL_MATERIAL_FIELDS = [
  "exteriorMaterial", "exteriorTexture", "hardwareFinish", "zocaloMaterial",
  "countertopModel", "countertopMaterial", "countertopColor", "countertopTexture",
] as const satisfies readonly (keyof ModuleOptions)[];

function pickGlobalMaterial(source: ModuleOptions): Partial<ModuleOptions> {
  const picked: Partial<ModuleOptions> = {};
  for (const key of GLOBAL_MATERIAL_FIELDS) (picked as Record<string, unknown>)[key] = source[key];
  return picked;
}

// Categories whose visible faces (doors, drawer fronts, exterior side panels,
// a zócalo's front) are built from the exterior board — the set the global
// materials tool homogenizes in one shot. corona_luz's front/underside are
// exterior board too (category "upper"), so it's included like everything else.
const EXTERIOR_CATEGORIES: ModuleCategory[] = ["lower", "upper", "tower", "corner", "accessory"];

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
  rotation: KitchenModule["rotation"];
}
const MOVE_HISTORY_LIMIT = 3;

// ─── Store Interface ───────────────────────────────────────────────────────────
interface KitchenStore {
  draft: KitchenDraft;
  // Backend id of the saved kitchen project this draft came from/was saved to
  // — null means "not saved yet" (Guardar will POST/create instead of PUT/update).
  projectId: number | null;
  // Panel UI state (not persisted in draft)
  showSelector: boolean;
  activeTab: "builder" | "3d" | "summary";
  moveHistory: MoveHistoryEntry[];

  // Project actions
  updateProject: (payload: Partial<Pick<KitchenDraft, "clientName" | "clientPhone" | "projectName" | "notes" | "roomWidth" | "roomDepth" | "ceilingHeight">>) => void;
  resetDraft: () => void;
  loadSampleKitchen: (variant?: SampleKitchenVariant) => void;
  loadProject: (projectId: number, draft: KitchenDraft) => void;

  // Module actions
  addModule: (type: KitchenModuleType) => void;
  // Drops a niche's matching accessory (see NICHE_ACCESSORY_MATCH) right
  // into it — same x/z/rotation, sized to the niche's own applianceWidth/
  // applianceHeight instead of the accessory's generic catalog default.
  placeAccessoryInNiche: (nicheId: string, accessoryType: KitchenModuleType) => void;
  removeModule: (id: string) => void;
  updateModule: (id: string, patch: Partial<Pick<KitchenModule, "label" | "dimensions" | "options" | "x" | "z" | "rotation">>) => void;
  // mountHeightCm, when given, also commits a wall-mounted module's new
  // installation height in the same update — dragging it up/down along its
  // wall (see AssemblyContent's handleDragStart) resolves x/z/rotation and
  // mountHeight together in one gesture, so they land in one history entry.
  updateModulePosition: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
  nudgeModule: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  rotateModule: (id: string) => void;
  duplicateModule: (id: string) => void;
  toggleModuleLock: (id: string) => void;
  undoLastMove: () => void;

  // Bulk material actions — homogenize every relevant module in one click
  // instead of opening each one's inspector individually.
  applyExteriorToAll: (material: BoardMaterial, texture: ExteriorTextureId) => number;
  applyCountertopToAll: (modelId: string, color: string, texture: ExteriorTextureId | "ninguna") => number;
  applyHardwareToAll: (finish: HardwareFinish) => number;
  applyZocaloMaterialToAll: (material: ZocaloMaterial) => number;
  // Dimensions — floor cabinets get a uniform box height; wall cabinets get a
  // uniform mount height (distance from the floor) *and* a uniform box height,
  // so both their bottom and top edges line up across the run. Towers are
  // never touched by any of these — they're floor-to-ceiling and sized on
  // their own.
  applyLowerHeightToAll: (heightCm: number) => number;
  applyUpperMountHeightToAll: (mountHeightCm: number) => number;
  applyUpperHeightToAll: (heightCm: number) => number;

  // Opening actions (windows & doors)
  addOpening: (type: OpeningType, wall: WallSide) => void;
  removeOpening: (id: string) => void;
  updateOpening: (id: string, patch: Partial<Pick<WallOpening, "wall" | "offset" | "width" | "height" | "sillHeight">>) => void;

  // Selection / editing
  setEditingModule: (id: string | null) => void;

  // Selector panel
  openSelector: () => void;
  closeSelector: () => void;

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
      projectId: null,
      showSelector: false,
      activeTab: "3d",
      moveHistory: [],

      // ── Project actions ───────────────────────────────────────────────────
      updateProject: (payload) =>
        set((s) => ({ draft: { ...s.draft, ...payload } })),

      resetDraft: () =>
        set({ draft: { ...initialDraft }, projectId: null, showSelector: false, activeTab: "3d", moveHistory: [] }),

      loadSampleKitchen: (variant = 1) =>
        set({ draft: buildSampleKitchen(variant), projectId: null, showSelector: false, activeTab: "3d", moveHistory: [] }),

      loadProject: (projectId, draft) =>
        set({ draft, projectId, showSelector: false, activeTab: "3d", moveHistory: [] }),

      // ── Module actions ────────────────────────────────────────────────────
      addModule: (type) =>
        set((s) => {
          const entry = buildNewModule(type);
          // Every module's material/hardware options are kept in sync (see
          // applyExteriorToAll etc.), so any existing module is a
          // representative sample of the room's current finish — a new one
          // picks that up instead of the catalog's own hardcoded defaults.
          // First module in an empty room has nothing to match, so it just
          // keeps its catalog defaults and becomes the new baseline.
          const globalMaterial = s.draft.modules[0] ? pickGlobalMaterial(s.draft.modules[0].options) : {};
          // Drops straight into the middle of the room instead of opening its
          // inspector — drag it into place, or double-click / hit the gear
          // button when you actually want to configure it.
          const newModule = {
            ...entry,
            options: { ...entry.options, ...globalMaterial },
            x: s.draft.roomWidth / 2,
            z: s.draft.roomDepth / 2,
          };
          return {
            draft: { ...s.draft, modules: [...s.draft.modules, newModule] },
            showSelector: false,
          };
        }),

      placeAccessoryInNiche: (nicheId, accessoryType) =>
        set((s) => {
          const niche = s.draft.modules.find((m) => m.id === nicheId);
          if (!niche) return {};
          const entry = buildNewModule(accessoryType, niche.x, niche.z, niche.rotation);
          const globalMaterial = s.draft.modules[0] ? pickGlobalMaterial(s.draft.modules[0].options) : {};
          const newModule = {
            ...entry,
            options: { ...entry.options, ...globalMaterial },
            // Fills the niche's own opening — that's usually a touch smaller
            // than the niche's outer dimensions (ventilation clearance, a
            // toe-kick gap), not the accessory's generic catalog size.
            dimensions: {
              width: niche.options.applianceWidth || niche.dimensions.width,
              height: niche.options.applianceHeight || niche.dimensions.height,
              depth: niche.dimensions.depth,
            },
          };
          return { draft: { ...s.draft, modules: [...s.draft.modules, newModule] } };
        }),

      removeModule: (id) =>
        set((s) => {
          if (s.draft.modules.find((m) => m.id === id)?.options.locked) return {};
          return {
            moveHistory: s.moveHistory.filter((h) => h.moduleId !== id),
            draft: {
              ...s.draft,
              modules: s.draft.modules.filter((m) => m.id !== id),
              editingModuleId: s.draft.editingModuleId === id ? null : s.draft.editingModuleId,
            },
          };
        }),

      updateModule: (id, patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              m.id === id && !m.options.locked
                ? { ...m, ...patch, dimensions: patch.dimensions ? { ...m.dimensions, ...patch.dimensions } : m.dimensions, options: patch.options ? { ...m.options, ...patch.options } : m.options }
                : m
            ),
          },
        })),

      updateModulePosition: (id, x, z, rotation, mountHeightCm, islandMode) =>
        set((s) => {
          const current = s.draft.modules.find((m) => m.id === id);
          if (current?.options.locked) return {};
          // Record where it was dragged FROM (not to) — undo restores this.
          // Only the most recent few are kept; older entries just fall off.
          const history = current && (current.x !== x || current.z !== z)
            ? [...s.moveHistory, { moduleId: id, x: current.x, z: current.z, rotation: current.rotation }].slice(-MOVE_HISTORY_LIMIT)
            : s.moveHistory;
          const hasOptionsPatch = mountHeightCm !== undefined || islandMode !== undefined;
          return {
            moveHistory: history,
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) =>
                m.id === id
                  ? {
                      ...m, x, z, rotation: rotation ?? m.rotation,
                      options: hasOptionsPatch
                        ? {
                            ...m.options,
                            ...(mountHeightCm !== undefined ? { mountHeight: mountHeightCm } : {}),
                            ...(islandMode !== undefined ? { islandMode } : {}),
                          }
                        : m.options,
                    }
                  : m
              ),
            },
          };
        }),

      // Nudges a module by a fixed step via the SelectionToolbar (or arrow
      // keys) — most useful for modules sitting away from any wall/neighbor
      // to snap against, where free-hand dragging in a perspective 3D view
      // is hard to land precisely. dx/dz in cm (room plane); dMountHeight in
      // cm, only meaningful for wall-mounted modules (ignored — mountHeight
      // stays put — when 0). The caller (nudgeSelected in
      // KitchenAssemblyScene.tsx) already runs the precise footprint/wall-
      // inset-aware clamp — same one the drag handler uses — before computing
      // dx/dz, so this plain center-point room-bounds clamp is just a
      // defensive backstop, not the primary guard.
      nudgeModule: (id, dx, dz, dMountHeight) =>
        set((s) => {
          const mod = s.draft.modules.find((m) => m.id === id);
          if (!mod || mod.options.locked) return {};
          const x = Math.min(Math.max(mod.x + dx, 0), s.draft.roomWidth);
          const z = Math.min(Math.max(mod.z + dz, 0), s.draft.roomDepth);
          const mountHeight = dMountHeight
            ? Math.min(Math.max((mod.options.mountHeight || 144) + dMountHeight, 60), 280)
            : mod.options.mountHeight;
          const islandMode = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category)
            ? isFreestandingPosition(x / 100, z / 100, s.draft.roomWidth / 100, s.draft.roomDepth / 100, mod.options.islandMode ?? false)
            : mod.options.islandMode;
          // Same transition-only toast as the drag path (KitchenAssemblyScene.tsx)
          // — nudging is the other way islandMode can flip, and it gets zero
          // other feedback (frozen rotation, hidden inspector section).
          if (islandMode !== (mod.options.islandMode ?? false)) {
            toast(
              islandMode ? `"${mod.label}" ahora es isla` : `"${mod.label}" ya no es isla`,
              { description: islandMode ? "Gira libre y puedes configurar su cara trasera en el inspector." : "Volvió a orientarse hacia la pared más cercana.", duration: 2200 },
            );
          }
          return {
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) =>
                m.id === id ? { ...m, x, z, options: { ...m.options, mountHeight, islandMode } } : m
              ),
            },
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
              modules: s.draft.modules.map((m) => (m.id === last.moduleId && !m.options.locked ? { ...m, x: last.x, z: last.z, rotation: last.rotation } : m)),
            },
          };
        }),

      rotateModule: (id) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              m.id === id && !m.options.locked ? { ...m, rotation: ((m.rotation + 90) % 360) as KitchenModule["rotation"] } : m
            ),
          },
        })),

      duplicateModule: (id) =>
        set((s) => {
          const original = s.draft.modules.find((m) => m.id === id);
          if (!original) return {};
          const { x, z } = findFreeSpotNear(original, s.draft.modules, s.draft.roomWidth, s.draft.roomDepth);
          const copy: KitchenModule = {
            ...original,
            id: `${original.type}_${Date.now()}_copy`,
            label: `${original.label} (copia)`,
            x, z,
            // A copy is a fresh, independent module — never inherits the
            // original's lock, or you couldn't touch what you just made.
            options: { ...original.options, locked: false },
          };
          const idx = s.draft.modules.findIndex((m) => m.id === id);
          const updated = [...s.draft.modules.slice(0, idx + 1), copy, ...s.draft.modules.slice(idx + 1)];
          return { draft: { ...s.draft, modules: updated, editingModuleId: copy.id } };
        }),

      toggleModuleLock: (id) =>
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) => (m.id === id ? { ...m, options: { ...m.options, locked: !m.options.locked } } : m)),
          },
        })),

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

      applyHardwareToAll: (finish) => {
        const isCabinet = (m: KitchenModule) => m.category === "lower" || m.category === "upper" || m.category === "tower" || m.category === "corner";
        const affected = get().draft.modules.filter(isCabinet).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              isCabinet(m) ? { ...m, options: { ...m.options, hardwareFinish: finish } } : m
            ),
          },
        }));
        return affected;
      },

      // Matches the "does this module actually render/cost a zócalo" check
      // in calculateKitchenMaterials (kitchenData.ts) — upper cabinets carry
      // hasToeKick:true by default even though they never show one, so
      // they're excluded here too.
      applyZocaloMaterialToAll: (material) => {
        const hasZocalo = (m: KitchenModule) => {
          const isUpperForToeKick = m.category === "upper" || m.type === "esquinero_triangular" || m.type === "esquinero_triangular_puerta" || m.type === "gabinete_pared_esquinero_puertas";
          return !isUpperForToeKick && m.options.hasToeKick;
        };
        const affected = get().draft.modules.filter(hasZocalo).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              hasZocalo(m) ? { ...m, options: { ...m.options, zocaloMaterial: material } } : m
            ),
          },
        }));
        return affected;
      },

      applyLowerHeightToAll: (heightCm) => {
        const isLower = (m: KitchenModule) => m.category === "lower" || m.category === "corner";
        const affected = get().draft.modules.filter(isLower).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              isLower(m) ? { ...m, dimensions: { ...m.dimensions, height: heightCm } } : m
            ),
          },
        }));
        return affected;
      },

      applyUpperMountHeightToAll: (mountHeightCm) => {
        const isUpper = (m: KitchenModule) => m.category === "upper";
        const affected = get().draft.modules.filter(isUpper).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              isUpper(m) ? { ...m, options: { ...m.options, mountHeight: mountHeightCm } } : m
            ),
          },
        }));
        return affected;
      },

      applyUpperHeightToAll: (heightCm) => {
        const isUpper = (m: KitchenModule) => m.category === "upper";
        const affected = get().draft.modules.filter(isUpper).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              isUpper(m) ? { ...m, dimensions: { ...m.dimensions, height: heightCm } } : m
            ),
          },
        }));
        return affected;
      },

      applyCountertopToAll: (modelId, color, texture) => {
        const model = getCountertopModel(modelId);
        const hasCountertop = (m: KitchenModule) => m.category === "countertop" || m.options.includesCountertop;
        const affected = get().draft.modules.filter(hasCountertop).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              hasCountertop(m)
                ? {
                    ...m,
                    options: {
                      ...m.options,
                      countertopModel: modelId,
                      countertopMaterial: model?.material ?? m.options.countertopMaterial,
                      countertopColor: color,
                      countertopTexture: texture,
                    },
                  }
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
      openSelector: () =>
        set({ showSelector: true }),

      closeSelector: () =>
        set({ showSelector: false }),

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
      partialize: (state) => ({ draft: state.draft, projectId: state.projectId }),
    }
  )
);

