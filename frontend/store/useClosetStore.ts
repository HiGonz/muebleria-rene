"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type {
  ClosetBlock, ClosetBlockKind, ClosetModule, ClosetProject,
  DoorBlockConfig, DrawerBlockConfig, HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
import { buildNewArea, buildNewBlock, buildNewClosetModule, buildNewConjunto } from "@/services/closetData";

// Partial<A|B|C|D> would resolve to Partial<{}> (a union's keyof is the
// INTERSECTION of its members' keys, and these four share none) — useless
// for a patch object. Partial of the INTERSECTION instead makes every
// possible field across all four kinds optional; callers only ever pass
// fields belonging to the block's actual kind (see ClosetModuleStackEditor),
// the store just spreads whatever it's given.
type ClosetBlockConfigPatch = Partial<DrawerBlockConfig & OpenBlockConfig & DoorBlockConfig & HangRodBlockConfig>;

type PersistedClosetState = { project: ClosetProject | null };

const PERSIST_DEBOUNCE_MS = 500;

// Same debounced-write shape useKitchenStore.ts uses (copied, not imported —
// small and self-contained enough that duplicating it beats coupling two
// independent stores together for one helper).
function createDebouncedLocalStorage(delayMs: number): PersistStorage<PersistedClosetState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<PersistedClosetState>) : null;
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        window.localStorage.setItem(name, JSON.stringify(value));
        timer = null;
      }, delayMs);
    },
    removeItem: (name) => {
      if (typeof window === "undefined") return;
      if (timer) { clearTimeout(timer); timer = null; }
      window.localStorage.removeItem(name);
    },
  };
}

interface ClosetStore {
  project: ClosetProject | null;
  selectedModuleId: string | null;

  initNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
  addModule: (widthCm: number, depthCm: number) => void;
  removeModule: (moduleId: string) => void;
  selectModule: (moduleId: string | null) => void;
  addBlock: (moduleId: string, kind: ClosetBlockKind) => void;
  removeBlock: (moduleId: string, blockId: string) => void;
  moveBlock: (moduleId: string, blockId: string, direction: "up" | "down") => void;
  updateBlockHeight: (moduleId: string, blockId: string, heightCm: number) => void;
  updateBlockConfig: (moduleId: string, blockId: string, patch: ClosetBlockConfigPatch) => void;
}

// Every module-mutating action goes through this so "which conjunto/module"
// lookup logic lives in exactly one place. Phase 1 only ever has one area
// and one conjunto (see the plan's Global Constraints) — this still walks
// the full areas[]/conjuntos[] arrays rather than hardcoding [0][0] so nothing
// here has to change when phase 2 adds more.
function updateModuleInProject(project: ClosetProject, moduleId: string, updater: (mod: ClosetModule) => ClosetModule): ClosetProject {
  return {
    ...project,
    areas: project.areas.map((area) => ({
      ...area,
      conjuntos: area.conjuntos.map((conjunto) => ({
        ...conjunto,
        modules: conjunto.modules.map((mod) => (mod.id === moduleId ? updater(mod) : mod)),
      })),
    })),
  };
}

export const useClosetStore = create<ClosetStore>()(
  persist(
    (set) => ({
      project: null,
      selectedModuleId: null,

      initNiche: (widthCm, heightCm, depthCm) => {
        const area = buildNewArea("Closet", "niche", { width: widthCm, height: heightCm, depth: depthCm });
        area.conjuntos = [buildNewConjunto(0, 0)];
        set({
          project: { id: null, clientName: "", projectName: "Closet nuevo", notes: "", areas: [area] },
          selectedModuleId: null,
        });
      },

      addModule: (widthCm, depthCm) =>
        set((s) => {
          if (!s.project) return {};
          const newModule = buildNewClosetModule(widthCm, depthCm);
          return {
            project: {
              ...s.project,
              areas: s.project.areas.map((area) => ({
                ...area,
                conjuntos: area.conjuntos.map((conjunto, i) =>
                  i === 0 ? { ...conjunto, modules: [...conjunto.modules, newModule] } : conjunto
                ),
              })),
            },
            selectedModuleId: newModule.id,
          };
        }),

      removeModule: (moduleId) =>
        set((s) => {
          if (!s.project) return {};
          return {
            project: {
              ...s.project,
              areas: s.project.areas.map((area) => ({
                ...area,
                conjuntos: area.conjuntos.map((conjunto) => ({
                  ...conjunto,
                  modules: conjunto.modules.filter((m) => m.id !== moduleId),
                })),
              })),
            },
            selectedModuleId: s.selectedModuleId === moduleId ? null : s.selectedModuleId,
          };
        }),

      selectModule: (moduleId) => set({ selectedModuleId: moduleId }),

      addBlock: (moduleId, kind) =>
        set((s) => {
          if (!s.project) return {};
          const newBlock = buildNewBlock(kind);
          return { project: updateModuleInProject(s.project, moduleId, (mod) => ({ ...mod, blocks: [...mod.blocks, newBlock] })) };
        }),

      removeBlock: (moduleId, blockId) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateModuleInProject(s.project, moduleId, (mod) => ({ ...mod, blocks: mod.blocks.filter((b) => b.id !== blockId) })) };
        }),

      moveBlock: (moduleId, blockId, direction) =>
        set((s) => {
          if (!s.project) return {};
          return {
            project: updateModuleInProject(s.project, moduleId, (mod) => {
              const idx = mod.blocks.findIndex((b) => b.id === blockId);
              const swapWith = direction === "up" ? idx + 1 : idx - 1;
              if (idx === -1 || swapWith < 0 || swapWith >= mod.blocks.length) return mod;
              const blocks = [...mod.blocks];
              [blocks[idx], blocks[swapWith]] = [blocks[swapWith], blocks[idx]];
              return { ...mod, blocks };
            }),
          };
        }),

      updateBlockHeight: (moduleId, blockId, heightCm) =>
        set((s) => {
          if (!s.project) return {};
          return {
            project: updateModuleInProject(s.project, moduleId, (mod) => ({
              ...mod,
              blocks: mod.blocks.map((b) => (b.id === blockId ? { ...b, heightCm } : b)),
            })),
          };
        }),

      updateBlockConfig: (moduleId, blockId, patch) =>
        set((s) => {
          if (!s.project) return {};
          return {
            project: updateModuleInProject(s.project, moduleId, (mod) => ({
              ...mod,
              blocks: mod.blocks.map((b) => (b.id === blockId ? ({ ...b, config: { ...b.config, ...patch } } as ClosetBlock) : b)),
            })),
          };
        }),
    }),
    {
      name: "closet-draft-v1",
      partialize: (state) => ({ project: state.project }),
      storage: createDebouncedLocalStorage(PERSIST_DEBOUNCE_MS),
    }
  )
);
