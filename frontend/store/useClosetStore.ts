"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type {
  ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule, ClosetProject,
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
  // Flips false -> true exactly once, via persist's onRehydrateStorage
  // callback below, once rehydration has genuinely applied (whether it
  // found a real draft or confirmed there was nothing to restore). Lets
  // consumers (see ClosetBuilder) distinguish "haven't checked storage yet"
  // from "checked storage, there really was nothing" — without this, a
  // consumer's own effect can't tell the two apart and may race ahead of
  // rehydration, overwriting a real draft with a fresh empty one.
  _hasHydrated: boolean;
  // Real, notifying store action — onRehydrateStorage's callback below calls
  // this instead of mutating `_hasHydrated` on the state object directly.
  // Zustand only notifies subscribed hooks (useSyncExternalStore) from
  // inside its own set(); a bare `state._hasHydrated = true` mutation after
  // hydrate()'s set() has already returned is invisible to React unless
  // something else happens to force a re-render afterward.
  setHasHydrated: () => void;

  initNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
  addModule: (widthCm: number, depthCm: number) => void;
  removeModule: (moduleId: string) => void;
  selectModule: (moduleId: string | null) => void;
  addBlock: (moduleId: string, kind: ClosetBlockKind) => void;
  removeBlock: (moduleId: string, blockId: string) => void;
  moveBlock: (moduleId: string, blockId: string, direction: "up" | "down") => void;
  updateBlockHeight: (moduleId: string, blockId: string, heightCm: number) => void;
  updateBlockConfig: (moduleId: string, blockId: string, patch: ClosetBlockConfigPatch) => void;
  updateModuleWidth: (moduleId: string, widthCm: number) => void;
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

// Same shared-lookup rationale as updateModuleInProject, one level up: every
// conjunto-mutating action (adding/removing a module from a conjunto's list)
// goes through this instead of re-walking areas[]/conjuntos[] inline.
function updateConjuntoInProject(project: ClosetProject, conjuntoId: string, updater: (conjunto: ClosetConjunto) => ClosetConjunto): ClosetProject {
  return {
    ...project,
    areas: project.areas.map((area) => ({
      ...area,
      conjuntos: area.conjuntos.map((conjunto) => (conjunto.id === conjuntoId ? updater(conjunto) : conjunto)),
    })),
  };
}

export const useClosetStore = create<ClosetStore>()(
  persist(
    (set) => ({
      project: null,
      selectedModuleId: null,
      _hasHydrated: false,
      setHasHydrated: () => set({ _hasHydrated: true }),

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
          // Phase 1 always has exactly one conjunto (see plan's Global
          // Constraints) — grab its real id rather than hardcoding index 0
          // inline, so the traversal itself lives only in updateConjuntoInProject.
          const targetConjuntoId = s.project.areas[0]?.conjuntos[0]?.id;
          if (!targetConjuntoId) return {};
          const newModule = buildNewClosetModule(widthCm, depthCm);
          return {
            project: updateConjuntoInProject(s.project, targetConjuntoId, (conjunto) => ({
              ...conjunto,
              modules: [...conjunto.modules, newModule],
            })),
            selectedModuleId: newModule.id,
          };
        }),

      removeModule: (moduleId) =>
        set((s) => {
          if (!s.project) return {};
          const owningConjunto = s.project.areas
            .flatMap((area) => area.conjuntos)
            .find((conjunto) => conjunto.modules.some((m) => m.id === moduleId));
          if (!owningConjunto) return {};
          return {
            project: updateConjuntoInProject(s.project, owningConjunto.id, (conjunto) => ({
              ...conjunto,
              modules: conjunto.modules.filter((m) => m.id !== moduleId),
            })),
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

      // A module's width is independent per module — a hangrod module often
      // needs to be wider than a drawer module next to it in the same
      // conjunto (stackAlongAxis packs whatever width each module reports,
      // so this alone is enough to make rows of mixed-width modules work).
      updateModuleWidth: (moduleId, widthCm) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateModuleInProject(s.project, moduleId, (mod) => ({ ...mod, width: widthCm })) };
        }),
    }),
    {
      name: "closet-draft-v1",
      partialize: (state) => ({ project: state.project }),
      storage: createDebouncedLocalStorage(PERSIST_DEBOUNCE_MS),
      // Documented zustand pattern for "rehydration has genuinely applied":
      // called once at store setup; the returned callback fires once
      // hydration finishes (whether it found a real draft or confirmed
      // there was nothing to restore). Calls the real setHasHydrated()
      // action (a genuine set()) rather than mutating state in place, so
      // subscribed hooks are actually notified — see setHasHydrated's own
      // comment for why the direct-mutation variant is unreliable.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated();
      },
    }
  )
);
