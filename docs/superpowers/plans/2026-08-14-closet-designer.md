# Closet Designer (Phase 0 + Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the closet designer's foundation (independent types/store/pure logic) plus a working end-to-end niche-mode, single-conjunto 3D builder — a user can open `/closet`, add modules, stack drawers/open/doors/hangrod blocks into each one, and see it rendered correctly from the floor up.

**Architecture:** Fully independent data model (`types/closet.ts`, `store/useClosetStore.ts`, `services/closetData.ts`) — zero shared types/store with the kitchen system. Vertical block position and horizontal module position are both *derived*, never stored, via one small generic `stackAlongAxis` utility used on two axes. A handful of already-generic kitchen 3D primitives (`Carcass`, `Shelves`, `DoorPanel`, `DrawerFace`, `Box`, `ToeKick`, `SideFiller`, `TopFiller`, `HARDWARE_LOOKS`) are reused via a one-line `export` addition each — no logic changes to kitchen files.

**Tech Stack:** Next.js 16, React Three Fiber / `@react-three/drei`, Zustand 5, TypeScript. No frontend test runner exists in this repo. Pure, framework-free logic (Task 3) is verified with real executable assertions via `npx tsx` (available in this repo). Everything else is verified with `npx tsc --noEmit` (run from `frontend/`) plus a manual smoke check, matching this project's established precedent (see the undo/redo and camera-persistence plans).

**Spec:** `docs/superpowers/specs/2026-08-14-closet-designer-design.md`

## Global Constraints

- Independent from kitchen: no new code in this plan imports from `store/useKitchenStore.ts`, `types/kitchen.ts`, or `services/kitchenData.ts`, except the narrow, explicit type-only reuse in Task 5 (`DoorDef`/`DrawerDef`/`DoorStyle`/`DrawerSystem`/`HardwareFinish` — genuinely generic cabinetry vocabulary already flagged reusable in the spec).
- This plan covers **spec phases 0 and 1 only**: niche-type áreas, one conjunto, no top shelf, no backend persistence (draft lives in memory + debounced localStorage, same pattern kitchen uses). Multiple conjuntos, room-type áreas, and backend persistence are explicitly out of scope — do not add them.
- `ClosetBlock` is a true discriminated union (`kind` narrows `config`) — never collapse it into one flat options bag.
- `yBottomCm`/`yTopCm` for blocks, and `startCm`/`endCm` for modules, are **never stored** on the data model — always recomputed from `layoutModuleBlocks`/`stackAlongAxis` at read time.
- Room/scene units: cm in the data layer, meters in the 3D layer, converted at the component boundary (`/100`) — same convention as kitchen, confirmed in the spec's §3.

---

### Task 1: Export reusable kitchen primitives

**Files:**
- Modify: `frontend/components/3d/ModulePreview3D.tsx`

**Interfaces:**
- Produces: `Box`, `Carcass`, `Shelves`, `ToeKick`, `SideFiller`, `TopFiller`, `DrawerFace`, `DoorPanel`, `HARDWARE_LOOKS`, `T` now exported with their existing signatures unchanged. Task 5 imports all of these.

This task is mechanical — add the `export` keyword to the first line of each declaration below. No other change. Each is already a pure, self-contained function/constant with no `KitchenModule` coupling (verified by reading their full bodies before writing this plan).

- [ ] **Step 1: Export `T` (board thickness constant)**

Line 23 currently reads:
```ts
const T = 0.018;
```
Replace with:
```ts
export const T = 0.018;
```

- [ ] **Step 2: Export `HARDWARE_LOOKS`**

Line 177 currently reads:
```ts
const HARDWARE_LOOKS: Record<Exclude<HardwareFinish, "Sin jaladores">, { color: string; metalness: number; roughness: number }> = {
```
Replace with:
```ts
export const HARDWARE_LOOKS: Record<Exclude<HardwareFinish, "Sin jaladores">, { color: string; metalness: number; roughness: number }> = {
```

- [ ] **Step 3: Export `Box`**

Line 186 currently reads:
```ts
function Box({
```
Replace with:
```ts
export function Box({
```

- [ ] **Step 4: Export `Carcass`**

Line 226 currently reads:
```ts
function Carcass({ W, H, D, color, leftColor, rightColor, leftMap, rightMap, hasTop = true, hasBack = true, wireframe = false }: {
```
Replace with:
```ts
export function Carcass({ W, H, D, color, leftColor, rightColor, leftMap, rightMap, hasTop = true, hasBack = true, wireframe = false }: {
```

- [ ] **Step 5: Export `Shelves`**

Line 254 currently reads:
```ts
function Shelves({ W, H, D, count, toeKick, ctThick, color, wireframe = false, zoneHeightM }: {
```
Replace with:
```ts
export function Shelves({ W, H, D, count, toeKick, ctThick, color, wireframe = false, zoneHeightM }: {
```

- [ ] **Step 6: Export `ToeKick`**

Line 282 currently reads:
```ts
function ToeKick({ W, D, height, color, map, roughness, aluminum = false, wireframe = false }: {
```
Replace with:
```ts
export function ToeKick({ W, D, height, color, map, roughness, aluminum = false, wireframe = false }: {
```

- [ ] **Step 7: Export `SideFiller`**

Line 312 currently reads:
```ts
function SideFiller({ side, W, H, D, color, map, roughness, wireframe = false }: {
```
Replace with:
```ts
export function SideFiller({ side, W, H, D, color, map, roughness, wireframe = false }: {
```

- [ ] **Step 8: Export `TopFiller`**

Line 328 currently reads:
```ts
function TopFiller({ W, D, yCenter, marginH, color, map, roughness, wireframe = false }: {
```
Replace with:
```ts
export function TopFiller({ W, D, yCenter, marginH, color, map, roughness, wireframe = false }: {
```

- [ ] **Step 9: Export `DrawerFace`**

Line 755 currently reads:
```ts
function DrawerFace({
```
Replace with:
```ts
export function DrawerFace({
```

- [ ] **Step 10: Export `DoorPanel`**

Line 843 currently reads:
```ts
function DoorPanel({
```
Replace with:
```ts
export function DoorPanel({
```

- [ ] **Step 11: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors (adding `export` cannot introduce a type error — these were already valid, self-contained declarations).

- [ ] **Step 12: Commit**

```bash
git add frontend/components/3d/ModulePreview3D.tsx
git commit -m "feat(closet): export reusable board/door/drawer primitives for the closet designer"
```

---

### Task 2: Closet types

**Files:**
- Create: `frontend/types/closet.ts`

**Interfaces:**
- Produces: every type below. Task 3 (`services/closetData.ts`) and Task 4 (`store/useClosetStore.ts`) consume all of them.

- [ ] **Step 1: Write the types file**

Create `frontend/types/closet.ts`:

```ts
// Closet designer data model — fully independent from types/kitchen.ts.
// See docs/superpowers/specs/2026-08-14-closet-designer-design.md.

export type ClosetSpaceType = "niche" | "room";

// "niche": envelope against one wall, no walk-around — the scene frames
// the box. "room" (later phase): 4-wall walkable space. Both are cm.
export type ClosetSpace =
  | { width: number; height: number; depth: number }
  | { width: number; depth: number; ceilingHeight: number };

export function isNicheSpace(space: ClosetSpace): space is { width: number; height: number; depth: number } {
  return "height" in space;
}

export interface ClosetArea {
  id: string;
  label: string;
  spaceType: ClosetSpaceType;
  space: ClosetSpace;
  conjuntos: ClosetConjunto[];
}

export interface ClosetConjunto {
  id: string;
  label: string;
  x: number; z: number; rotation: 0 | 90 | 180 | 270; // cm/degrees — placement within the área
  modules: ClosetModule[]; // left-to-right order
  topShelf?: ClosetTopShelf;
}

export interface ClosetModule {
  id: string;
  label: string;
  width: number; // cm, fixed
  depth: number; // cm, fixed
  // height is NEVER stored — always sum(blocks[i].heightCm), see layoutModuleBlocks
  blocks: ClosetBlock[]; // bottom-to-top order
}

export type ClosetBlockKind = "drawers" | "open" | "doors" | "hangrod";

export interface DrawerBlockConfig {
  quantity: number;
  individualHeightCm?: number; // auto ((heightCm - gapCm*(quantity-1)) / quantity) if omitted
  gapCm: number;
}

// Nothing beyond the block's own heightCm — the hueco IS the space.
export interface OpenBlockConfig {}

export interface DoorBlockConfig {
  doorCount: number;
  doorWidths?: number[]; // auto-even split if omitted; length must equal doorCount when set
  hasLock: boolean;
  doorType: string; // free-form for now — no commercial door-type rules exist yet
}

export interface HangRodBlockConfig {
  rodHeightFromBottomCm: number;
  rodDepthCm: number;
  secondRod?: { heightFromBottomCm: number }; // future
}

export type ClosetBlock =
  | { id: string; kind: "drawers"; heightCm: number; config: DrawerBlockConfig }
  | { id: string; kind: "open"; heightCm: number; config: OpenBlockConfig }
  | { id: string; kind: "doors"; heightCm: number; config: DoorBlockConfig }
  | { id: string; kind: "hangrod"; heightCm: number; config: HangRodBlockConfig };

export interface ClosetTopShelf {
  id: string;
  coversModuleIds: string[]; // must be a contiguous run within the conjunto's modules
  thickness: number;
  material: string;
}

export interface ClosetProject {
  id: number | null;
  clientName: string;
  projectName: string;
  notes: string;
  areas: ClosetArea[];
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/types/closet.ts
git commit -m "feat(closet): add independent closet data model types"
```

---

### Task 3: Pure layout, packing, validation and catalog logic

**Files:**
- Create: `frontend/services/closetData.ts`

**Interfaces:**
- Consumes: every type from Task 2.
- Produces: `layoutModuleBlocks(blocks): BlockStackEntry[]`, `stackAlongAxis(items, gapCm?): AxisStackEntry<T>[]`, `validateModuleHeight(blocks, maxHeightCm): HeightValidation`, `CLOSET_BLOCK_CATALOG: ClosetBlockCatalogEntry[]`, `getClosetBlockCatalogEntry(kind): ClosetBlockCatalogEntry`, `buildNewBlock(kind): ClosetBlock`, `buildNewClosetModule(width, depth): ClosetModule`, `buildNewConjunto(x, z, rotation?): ClosetConjunto`, `buildNewArea(spaceType, space): ClosetArea`. Task 4 (store) and Task 6/7 (scene/editor) consume all of these.

- [ ] **Step 1: Write the implementation**

Create `frontend/services/closetData.ts`:

```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Vertical stacking (blocks within a module) ────────────────────────────
export interface BlockStackEntry { block: ClosetBlock; yBottomCm: number; yTopCm: number }

export function layoutModuleBlocks(blocks: ClosetBlock[]): BlockStackEntry[] {
  let y = 0;
  return blocks.map((block) => {
    const yBottomCm = y;
    y += block.heightCm;
    return { block, yBottomCm, yTopCm: y };
  });
}

export function moduleTotalHeightCm(blocks: ClosetBlock[]): number {
  const layout = layoutModuleBlocks(blocks);
  return layout.length ? layout[layout.length - 1].yTopCm : 0;
}

export interface HeightValidation { fits: boolean; totalCm: number; overflowCm: number }

export function validateModuleHeight(blocks: ClosetBlock[], maxHeightCm: number): HeightValidation {
  const totalCm = moduleTotalHeightCm(blocks);
  return { fits: totalCm <= maxHeightCm, totalCm, overflowCm: Math.max(0, totalCm - maxHeightCm) };
}

// ─── Horizontal packing (modules within a conjunto, or any sized items) ────
export interface AxisStackEntry<T> { item: T; startCm: number; endCm: number }

export function stackAlongAxis<T extends { sizeCm: number }>(items: T[], gapCm = 0): AxisStackEntry<T>[] {
  let pos = 0;
  return items.map((item) => {
    const startCm = pos;
    pos += item.sizeCm + gapCm;
    return { item, startCm, endCm: startCm + item.sizeCm };
  });
}

// ─── Block catalog ──────────────────────────────────────────────────────────
export interface ClosetBlockCatalogEntry {
  kind: ClosetBlockKind;
  label: string;
  description: string;
  defaultHeightCm: number;
  defaultConfig: DrawerBlockConfig | OpenBlockConfig | DoorBlockConfig | HangRodBlockConfig;
}

export const CLOSET_BLOCK_CATALOG: ClosetBlockCatalogEntry[] = [
  {
    kind: "drawers", label: "Cajones",
    description: "Uno o varios cajones apilados, con distribución vertical automática.",
    defaultHeightCm: 80,
    defaultConfig: { quantity: 5, gapCm: 1 } as DrawerBlockConfig,
  },
  {
    kind: "open", label: "Hueco abierto",
    description: "Espacio completamente abierto — perfumes, accesorios, decoración, zapatos.",
    defaultHeightCm: 40,
    defaultConfig: {} as OpenBlockConfig,
  },
  {
    kind: "doors", label: "Hueco con puertas",
    description: "Espacio cerrado con una o más puertas.",
    defaultHeightCm: 60,
    defaultConfig: { doorCount: 2, hasLock: false, doorType: "Lisa" } as DoorBlockConfig,
  },
  {
    kind: "hangrod", label: "Barra para ropa",
    description: "Barra horizontal para colgar ropa en ganchos.",
    defaultHeightCm: 100,
    defaultConfig: { rodHeightFromBottomCm: 90, rodDepthCm: 30 } as HangRodBlockConfig,
  },
];

export function getClosetBlockCatalogEntry(kind: ClosetBlockKind): ClosetBlockCatalogEntry {
  const entry = CLOSET_BLOCK_CATALOG.find((e) => e.kind === kind);
  if (!entry) throw new Error(`Unknown closet block kind: ${kind}`);
  return entry;
}

export function buildNewBlock(kind: ClosetBlockKind): ClosetBlock {
  const entry = getClosetBlockCatalogEntry(kind);
  const id = newId(kind);
  const heightCm = entry.defaultHeightCm;
  switch (kind) {
    case "drawers": return { id, kind, heightCm, config: entry.defaultConfig as DrawerBlockConfig };
    case "open": return { id, kind, heightCm, config: entry.defaultConfig as OpenBlockConfig };
    case "doors": return { id, kind, heightCm, config: entry.defaultConfig as DoorBlockConfig };
    case "hangrod": return { id, kind, heightCm, config: entry.defaultConfig as HangRodBlockConfig };
  }
}

// ─── Module / conjunto / area builders ──────────────────────────────────────
export function buildNewClosetModule(width: number, depth: number): ClosetModule {
  return { id: newId("modulo"), label: "Módulo", width, depth, blocks: [] };
}

export function buildNewConjunto(x: number, z: number, rotation: 0 | 90 | 180 | 270 = 0): ClosetConjunto {
  return { id: newId("conjunto"), label: "Conjunto", x, z, rotation, modules: [] };
}

export function buildNewArea(label: string, spaceType: ClosetSpaceType, space: ClosetSpace): ClosetArea {
  return { id: newId("area"), label, spaceType, space, conjuntos: [] };
}
```

- [ ] **Step 2: Write and run an executable verification script**

This repo has no frontend test runner, but `npx tsx` is available and these functions are pure/framework-free — verify them for real instead of by inspection alone. Create a throwaway script at `frontend/scripts/verify-closet-data.ts`:

```ts
import { layoutModuleBlocks, stackAlongAxis, validateModuleHeight, buildNewBlock, moduleTotalHeightCm } from "../services/closetData";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok: ${msg}`);
}

// layoutModuleBlocks stacks bottom-to-top with no gaps or overlaps
const a = buildNewBlock("drawers"); a.heightCm = 50;
const b = buildNewBlock("open"); b.heightCm = 80;
const c = buildNewBlock("doors"); c.heightCm = 100;
const layout = layoutModuleBlocks([a, b, c]);
assert(layout[0].yBottomCm === 0 && layout[0].yTopCm === 50, "block A occupies 0-50");
assert(layout[1].yBottomCm === 50 && layout[1].yTopCm === 130, "block B occupies 50-130");
assert(layout[2].yBottomCm === 130 && layout[2].yTopCm === 230, "block C occupies 130-230");
assert(moduleTotalHeightCm([a, b, c]) === 230, "total height is 230");

// Reordering recomputes everything above the change automatically
const reordered = layoutModuleBlocks([c, a, b]);
assert(reordered[0].yTopCm === 100 && reordered[1].yBottomCm === 100 && reordered[1].yTopCm === 150, "reordered stack recalculates positions");

// Empty stack
assert(layoutModuleBlocks([]).length === 0, "empty block list layouts to nothing");
assert(moduleTotalHeightCm([]) === 0, "empty block list has zero height");

// validateModuleHeight
const fits = validateModuleHeight([a, b, c], 240);
assert(fits.fits === true && fits.totalCm === 230 && fits.overflowCm === 0, "230cm fits in a 240cm space");
const overflow = validateModuleHeight([a, b, c], 200);
assert(overflow.fits === false && overflow.overflowCm === 30, "230cm overflows a 200cm space by 30cm");

// stackAlongAxis packs left-to-right with no gaps by default
const items = [{ sizeCm: 60 }, { sizeCm: 100 }, { sizeCm: 60 }];
const packed = stackAlongAxis(items);
assert(packed[0].startCm === 0 && packed[0].endCm === 60, "module 1 at 0-60");
assert(packed[1].startCm === 60 && packed[1].endCm === 160, "module 2 at 60-160 (no gap)");
assert(packed[2].startCm === 160 && packed[2].endCm === 220, "module 3 at 160-220");

// stackAlongAxis with a gap
const gapped = stackAlongAxis(items, 2);
assert(gapped[1].startCm === 62, "module 2 starts at 62 with a 2cm gap");
assert(gapped[2].startCm === 164, "module 3 starts at 164 with two 2cm gaps");

// buildNewBlock produces distinct ids and correct default heights
const d1 = buildNewBlock("hangrod");
const d2 = buildNewBlock("hangrod");
assert(d1.id !== d2.id, "buildNewBlock generates distinct ids");
assert(d1.heightCm === 100, "hangrod default height is 100cm");
assert(d1.config.rodHeightFromBottomCm === 90, "hangrod default rod height is 90cm");

console.log("All closet data checks passed.");
```

Run (from `frontend/`):
```bash
npx tsx scripts/verify-closet-data.ts
```
Expected: every line prints `ok: ...` and the script ends with `All closet data checks passed.` and exit code 0. If any assertion throws, fix `closetData.ts` (not the script) and re-run.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm frontend/scripts/verify-closet-data.ts
```

It served its purpose as a one-off verification; this repo has no test runner to register it with, so it doesn't belong in the tree long-term. (If you'd rather keep a permanent regression check, that's a reasonable deviation — ask before diverging from the plan.)

- [ ] **Step 4: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/services/closetData.ts
git commit -m "feat(closet): pure vertical/horizontal stacking, validation, and block catalog"
```

---

### Task 4: Closet Zustand store

**Files:**
- Create: `frontend/store/useClosetStore.ts`

**Interfaces:**
- Consumes: `ClosetProject`/`ClosetArea`/`ClosetConjunto`/`ClosetModule`/`ClosetBlock`/`ClosetBlockKind` (Task 2), `buildNewArea`/`buildNewConjunto`/`buildNewClosetModule`/`buildNewBlock` (Task 3).
- Produces: `useClosetStore()` hook exposing `project: ClosetProject | null`, `selectedModuleId: string | null`, `initNiche(widthCm, heightCm, depthCm): void`, `addModule(widthCm, depthCm): void`, `removeModule(moduleId): void`, `selectModule(moduleId: string | null): void`, `addBlock(moduleId, kind): void`, `removeBlock(moduleId, blockId): void`, `moveBlock(moduleId, blockId, direction: "up" | "down"): void`, `updateBlockHeight(moduleId, blockId, heightCm): void`, `updateBlockConfig(moduleId, blockId, patch: ClosetBlockConfigPatch): void` (a patch object covering every possible per-kind config field, made optional — see the type's own comment for why). Tasks 6, 7, and 8 consume all of these.

- [ ] **Step 1: Write the store**

Create `frontend/store/useClosetStore.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/store/useClosetStore.ts
git commit -m "feat(closet): add independent Zustand store for the closet draft"
```

---

### Task 5: Block mesh renderers

**Files:**
- Create: `frontend/components/3d/ClosetBlockMeshes.tsx`

**Interfaces:**
- Consumes: `Box`/`Carcass`/`ToeKick`/`SideFiller`/`TopFiller`/`DrawerFace`/`DoorPanel`/`HARDWARE_LOOKS`/`T` (Task 1, now exported from `ModulePreview3D.tsx`), `ClosetBlock`/`ClosetModule` (Task 2), `layoutModuleBlocks`/`moduleTotalHeightCm` (Task 3). Also imports `DoorDef`/`DrawerDef` types (type-only) from `@/types/kitchen` — the one deliberate, narrow exception to "no kitchen imports" the spec calls out (§1): these are the reused `DoorPanel`/`DrawerFace` components' own prop types, genuinely generic cabinetry rect shapes, imported for their *type* only (zero runtime dependency on kitchen code).
- Produces: `ClosetModuleMesh({ module, x, z }: { module: ClosetModule; x: number; z: number }): JSX.Element`. Task 6 consumes this.

- [ ] **Step 1: Write the block renderers and the module mesh**

Create `frontend/components/3d/ClosetBlockMeshes.tsx`:

```tsx
"use client";

import { Carcass, Box, DoorPanel, DrawerFace, T } from "./ModulePreview3D";
import type { ClosetBlock, ClosetModule } from "@/types/closet";
import type { DoorDef, DrawerDef } from "@/types/kitchen";
import { layoutModuleBlocks, moduleTotalHeightCm } from "@/services/closetData";

const BOARD_COLOR = "#d4c5b0";
const FRONT_COLOR = "#e8e0d4";

// One evenly-spaced DrawerDef per drawer in the block, spanning its own
// heightCm — mirrors the even-split idea kitchen uses for auto-laid-out
// drawers, simplified (no zone-height override, no door coexistence).
function drawerDefsFor(block: Extract<ClosetBlock, { kind: "drawers" }>): DrawerDef[] {
  const { quantity, gapCm, individualHeightCm } = block.config;
  const perDrawerCm = individualHeightCm ?? (block.heightCm - gapCm * Math.max(quantity - 1, 0)) / quantity;
  return Array.from({ length: quantity }, (_, i) => ({
    id: `${block.id}_d${i}`,
    label: `Cajón ${i + 1}`,
    heightCm: perDrawerCm,
    fromBottomCm: i * (perDrawerCm + gapCm),
    isGhost: false,
    widthPct: 100,
    offsetPct: 0,
    drawerSystem: "Soft-close",
  }));
}

// One DoorDef per door in the block, spanning the block's full height, evenly
// split across the width unless explicit doorWidths are given.
function doorDefsFor(block: Extract<ClosetBlock, { kind: "doors" }>): DoorDef[] {
  const { doorCount, doorWidths } = block.config;
  const widths = doorWidths && doorWidths.length === doorCount ? doorWidths : Array.from({ length: doorCount }, () => 100 / doorCount);
  let offsetPct = 0;
  return widths.map((widthPct, i) => {
    const def: DoorDef = {
      id: `${block.id}_door${i}`,
      label: `Puerta ${i + 1}`,
      widthPct,
      offsetPct,
      fromBottomCm: 0,
      heightCm: block.heightCm,
      hingeLeft: i % 2 === 0,
      doorStyle: "Lisa",
    };
    offsetPct += widthPct;
    return def;
  });
}

function HangRod({ block, W, D, bottomYM }: { block: Extract<ClosetBlock, { kind: "hangrod" }>; W: number; D: number; bottomYM: number }) {
  const rodY = bottomYM + block.config.rodHeightFromBottomCm / 100;
  const rodZ = D / 2 - block.config.rodDepthCm / 200;
  const rodLength = W - T * 4;
  return (
    <mesh position={[0, rodY, rodZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.012, 0.012, rodLength, 12]} />
      <meshStandardMaterial color="#b0b0b0" metalness={0.7} roughness={0.3} />
    </mesh>
  );
}

function BlockContent({ block, W, D, bottomYM }: { block: ClosetBlock; W: number; D: number; bottomYM: number }) {
  switch (block.kind) {
    case "drawers":
      return (
        <group position={[0, bottomYM, 0]}>
          {drawerDefsFor(block).map((d) => (
            <DrawerFace key={d.id} drawer={d} W={W} D={D} toeKick={0} color={FRONT_COLOR} hardware="Acero inoxidable" />
          ))}
        </group>
      );
    case "doors":
      return (
        <group position={[0, bottomYM, 0]}>
          {doorDefsFor(block).map((d) => (
            <DoorPanel key={d.id} door={d} W={W} D={D} toeKick={0} color={FRONT_COLOR} hardware="Acero inoxidable" />
          ))}
        </group>
      );
    case "hangrod":
      return <HangRod block={block} W={W} D={D} bottomYM={bottomYM} />;
    case "open":
      return null; // literally empty space — nothing to render beyond the shared carcass
  }
}

// One continuous Carcass spans the module's FULL derived height (so blocks
// never show a seam between them beyond the intentional divider), with a
// thin horizontal divider panel at every internal block boundary and each
// block's own front/fixture content layered on top.
export function ClosetModuleMesh({ module, x, z }: { module: ClosetModule; x: number; z: number }) {
  const W = module.width / 100;
  const D = module.depth / 100;
  const totalHeightCm = moduleTotalHeightCm(module.blocks);
  const H = Math.max(totalHeightCm / 100, 0.01);
  const layout = layoutModuleBlocks(module.blocks);

  return (
    <group position={[x, 0, z]}>
      <Carcass W={W} H={H} D={D} color={BOARD_COLOR} leftColor={BOARD_COLOR} rightColor={BOARD_COLOR} />
      {layout.slice(0, -1).map(({ block, yTopCm }) => (
        <Box key={`divider_${block.id}`} pos={[0, yTopCm / 100, 0]} size={[W - T * 2, T, D - T]} color={BOARD_COLOR} />
      ))}
      {layout.map(({ block, yBottomCm }) => (
        <BlockContent key={block.id} block={block} W={W} D={D} bottomYM={yBottomCm / 100} />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors. If `Box`'s `pos`/`size` prop names don't match (double-check against the exported signature from Task 1 — it takes `pos: [number,number,number]` and `size: [number,number,number]`), fix the call to match the real signature.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/3d/ClosetBlockMeshes.tsx
git commit -m "feat(closet): render closet modules as one continuous carcass with per-block fronts"
```

---

### Task 6: Closet 3D scene (niche mode)

**Files:**
- Create: `frontend/components/3d/ClosetAssemblyScene.tsx`

**Interfaces:**
- Consumes: `ClosetModuleMesh` (Task 5), `stackAlongAxis` (Task 3), `ClosetProject`/`isNicheSpace` (Task 2).
- Produces: `ClosetAssemblyScene({ project }: { project: ClosetProject }): JSX.Element`. Task 8 consumes this.

- [ ] **Step 1: Write the scene**

Create `frontend/components/3d/ClosetAssemblyScene.tsx`:

```tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import { stackAlongAxis } from "@/services/closetData";
import { isNicheSpace, type ClosetProject } from "@/types/closet";

// A niche has no walls to walk around — a plain backdrop panel behind the
// modules plus a floor patch is enough to read as "this is a wall alcove",
// unlike kitchen's real 4-wall RoomBoundary. Room-type áreas (a real
// walkable space) are a later phase, not built here.
function NicheBackdrop({ widthM, heightM, depthM }: { widthM: number; heightM: number; depthM: number }) {
  return (
    <group>
      <mesh position={[widthM / 2, heightM / 2, -0.02]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, heightM + 0.4]} />
        <meshStandardMaterial color="#e5e1d8" />
      </mesh>
      <mesh position={[widthM / 2, -0.005, depthM / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, depthM + 0.4]} />
        <meshStandardMaterial color="#cfcabf" />
      </mesh>
    </group>
  );
}

export function ClosetAssemblyScene({ project }: { project: ClosetProject }) {
  const area = project.areas[0];
  const conjunto = area?.conjuntos[0];
  if (!area || !conjunto || !isNicheSpace(area.space)) return null;

  const { width, height, depth } = area.space;
  const widthM = width / 100;
  const heightM = height / 100;
  const depthM = depth / 100;

  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
  const totalPackedWidthM = packed.length ? packed[packed.length - 1].endCm / 100 : 0;
  // Center the packed row of modules within the niche's own width.
  const rowOffsetM = Math.max((widthM - totalPackedWidthM) / 2, 0);

  const dist = Math.max(widthM, heightM, depthM) * 2.2 + 0.6;

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      <Canvas shadows camera={{ position: [widthM / 2, heightM / 2.5, dist], fov: 45 }}>
        <color attach="background" args={["#1c1c28"]} />
        <ambientLight intensity={1} />
        <directionalLight position={[widthM + 2, heightM + 3, depthM + 3]} intensity={1.2} castShadow />
        <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />
        <NicheBackdrop widthM={widthM} heightM={heightM} depthM={depthM} />
        <Grid position={[widthM / 2, -0.004, depthM / 2]} args={[widthM + 1, depthM + 1]} cellColor="#3a3a48" sectionColor="#4a4a58" fadeDistance={10} />
        {packed.map(({ item, startCm }) => (
          <ClosetModuleMesh key={item.module.id} module={item.module} x={rowOffsetM + startCm / 100} z={0} />
        ))}
        <OrbitControls target={[widthM / 2, heightM / 2, 0]} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/3d/ClosetAssemblyScene.tsx
git commit -m "feat(closet): niche-mode 3D scene with auto-packed modules"
```

---

### Task 7: Block-stack editor UI

**Files:**
- Create: `frontend/components/closet/ClosetModuleStackEditor.tsx`

**Interfaces:**
- Consumes: `useClosetStore` (Task 4), `CLOSET_BLOCK_CATALOG`/`getClosetBlockCatalogEntry`/`layoutModuleBlocks`/`validateModuleHeight` (Task 3), `ClosetBlock`/`ClosetModule` (Task 2).
- Produces: `ClosetModuleStackEditor({ module, maxHeightCm }: { module: ClosetModule; maxHeightCm: number }): JSX.Element`. Task 8 consumes this.

Each block kind has its own configurable fields (§2 of the original request:
drawer count/gap, door count/lock, rod height) — this editor must expose
them, not just the shared `heightCm`, via `updateBlockConfig`.

- [ ] **Step 1: Write the editor**

Create `frontend/components/closet/ClosetModuleStackEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { CLOSET_BLOCK_CATALOG, layoutModuleBlocks, validateModuleHeight } from "@/services/closetData";
import type { ClosetBlock, ClosetBlockKind, ClosetModule } from "@/types/closet";

// Each block kind's own configurable fields, beyond the shared heightCm —
// this is what makes "cada bloque tiene su propia configuración" (the
// original request's §2) real instead of just a height slider. Narrows on
// block.kind so each branch only touches the fields that actually exist on
// that kind's config.
function BlockConfigFields({ moduleId, block }: { moduleId: string; block: ClosetBlock }) {
  const updateBlockConfig = useClosetStore((s) => s.updateBlockConfig);

  if (block.kind === "drawers") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Cajones
          <input
            type="number" min={1} value={block.config.quantity}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { quantity: Math.max(1, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Separación (cm)
          <input
            type="number" min={0} value={block.config.gapCm}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { gapCm: Math.max(0, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
      </div>
    );
  }
  if (block.kind === "doors") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Puertas
          <input
            type="number" min={1} value={block.config.doorCount}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { doorCount: Math.max(1, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          <input
            type="checkbox" checked={block.config.hasLock}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { hasLock: e.target.checked })}
          />
          Con llave
        </label>
      </div>
    );
  }
  if (block.kind === "hangrod") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Altura de barra (cm desde el bloque)
          <input
            type="number" min={0} value={block.config.rodHeightFromBottomCm}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { rodHeightFromBottomCm: Math.max(0, Number(e.target.value)) })}
            className="w-12 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
      </div>
    );
  }
  return null; // "open" has no config fields beyond heightCm
}

export function ClosetModuleStackEditor({ module, maxHeightCm }: { module: ClosetModule; maxHeightCm: number }) {
  const addBlock = useClosetStore((s) => s.addBlock);
  const removeBlock = useClosetStore((s) => s.removeBlock);
  const moveBlock = useClosetStore((s) => s.moveBlock);
  const updateBlockHeight = useClosetStore((s) => s.updateBlockHeight);
  const [showPicker, setShowPicker] = useState(false);

  const validation = validateModuleHeight(module.blocks, maxHeightCm);
  const layout = layoutModuleBlocks(module.blocks);
  // Blocks are stored bottom-to-top (matches the 3D stacking direction);
  // shown top-to-bottom here to match how a real closet elevation reads.
  const topToBottom = [...layout].reverse();

  const handleAdd = (kind: ClosetBlockKind) => {
    addBlock(module.id, kind);
    setShowPicker(false);
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ivory">{module.label}</h3>
        <span className={`text-xs ${validation.fits ? "text-warmgray" : "text-terracotta"}`}>
          {validation.totalCm}cm{validation.fits ? "" : ` — excede por ${validation.overflowCm}cm`}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {topToBottom.map(({ block, yBottomCm, yTopCm }) => {
          const entry = CLOSET_BLOCK_CATALOG.find((e) => e.kind === block.kind)!;
          return (
            <div key={block.id} className="flex flex-col gap-1.5 rounded-lg border border-ivory/10 bg-ivory/4 px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-ivory">{entry.label}</p>
                  <p className="text-[10px] text-warmgray">{yBottomCm}cm – {yTopCm}cm</p>
                </div>
                <input
                  type="number"
                  value={block.heightCm}
                  min={1}
                  onChange={(e) => updateBlockHeight(module.id, block.id, Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
                  aria-label={`Altura de ${entry.label}`}
                />
                <button onClick={() => moveBlock(module.id, block.id, "up")} title="Subir" className="text-warmgray hover:text-ivory">↑</button>
                <button onClick={() => moveBlock(module.id, block.id, "down")} title="Bajar" className="text-warmgray hover:text-ivory">↓</button>
                <button onClick={() => removeBlock(module.id, block.id)} title="Eliminar" className="text-warmgray hover:text-terracotta">✕</button>
              </div>
              <BlockConfigFields moduleId={module.id} block={block} />
            </div>
          );
        })}
      </div>

      {showPicker ? (
        <div role="menu" aria-label="Elegir tipo de bloque" className="flex flex-col gap-1 rounded-lg border border-ivory/12 bg-ink/95 p-1">
          {CLOSET_BLOCK_CATALOG.map((entry) => (
            <button
              key={entry.kind}
              role="menuitem"
              onClick={() => handleAdd(entry.kind)}
              className="flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ivory/8"
            >
              <span className="text-xs font-medium text-ivory">{entry.label}</span>
              <span className="text-[10px] text-warmgray">{entry.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="rounded-lg border border-dashed border-ivory/20 px-3 py-2 text-xs text-warmgray transition-colors hover:border-ivory/40 hover:text-ivory"
        >
          + Agregar bloque
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/closet/ClosetModuleStackEditor.tsx
git commit -m "feat(closet): block-stack editor UI"
```

---

### Task 8: Builder page and route

**Files:**
- Create: `frontend/components/closet/ClosetBuilder.tsx`
- Create: `frontend/app/closet/page.tsx`

**Interfaces:**
- Consumes: `useClosetStore` (Task 4), `ClosetAssemblyScene` (Task 6), `ClosetModuleStackEditor` (Task 7), `moduleTotalHeightCm` (Task 3).
- Produces: the `/closet` route — this is the end-to-end deliverable this plan targets.

- [ ] **Step 1: Write the builder shell**

Create `frontend/components/closet/ClosetBuilder.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { ClosetAssemblyScene } from "@/components/3d/ClosetAssemblyScene";
import { ClosetModuleStackEditor } from "./ClosetModuleStackEditor";
import { isNicheSpace } from "@/types/closet";

const DEFAULT_MODULE_WIDTH_CM = 60;
const DEFAULT_MODULE_DEPTH_CM = 60;

export function ClosetBuilder() {
  const project = useClosetStore((s) => s.project);
  const selectedModuleId = useClosetStore((s) => s.selectedModuleId);
  const initNiche = useClosetStore((s) => s.initNiche);
  const addModule = useClosetStore((s) => s.addModule);
  const removeModule = useClosetStore((s) => s.removeModule);
  const selectModule = useClosetStore((s) => s.selectModule);

  // First-ever visit (nothing in localStorage yet) starts from a reasonable
  // default niche so the scene isn't empty on load.
  useEffect(() => {
    if (!project) initNiche(300, 240, 60);
  }, [project, initNiche]);

  if (!project) return null;
  const area = project.areas[0];
  const conjunto = area?.conjuntos[0];
  if (!area || !conjunto || !isNicheSpace(area.space)) return null;

  const selectedModule = conjunto.modules.find((m) => m.id === selectedModuleId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold">{project.projectName}</h1>
        <button
          onClick={() => addModule(DEFAULT_MODULE_WIDTH_CM, DEFAULT_MODULE_DEPTH_CM)}
          className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass-soft"
        >
          + Agregar módulo
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ClosetAssemblyScene project={project} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ivory/8">
          <div className="border-b border-ivory/8 p-3">
            <p className="text-xs font-semibold text-ivory">Módulos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conjunto.modules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectModule(m.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${m.id === selectedModuleId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {selectedModule ? (
            <>
              <ClosetModuleStackEditor module={selectedModule} maxHeightCm={area.space.height} />
              <div className="mt-auto border-t border-ivory/8 p-3">
                <button
                  onClick={() => removeModule(selectedModule.id)}
                  className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                >
                  Eliminar módulo
                </button>
              </div>
            </>
          ) : (
            <p className="p-3 text-xs text-warmgray">Selecciona un módulo para editar sus bloques.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the route**

Create `frontend/app/closet/page.tsx`:

```tsx
import { ClosetBuilder } from "@/components/closet/ClosetBuilder";

export const metadata = { title: "Constructor de Closet" };

export default function ClosetPage() {
  return <ClosetBuilder />;
}
```

- [ ] **Step 3: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

With the dev server running (`npx next dev -p 3123` from `frontend/`), open `/closet`:
1. Confirm a 300×240×60cm niche renders with an empty floor/backdrop.
2. Click "+ Agregar módulo" — confirm a 60×60cm module appears against the backdrop, selected automatically, with an empty block-stack editor in the sidebar.
3. In the editor, click "+ Agregar bloque" and add "Cajones" — confirm 5 drawer faces appear stacked from the floor up to 80cm, and the editor list shows it at the bottom (closest to the floor) since blocks display top-to-bottom but the newest is added at the top of the stack — actually confirm the FIRST block added sits at floor level (0–80cm) both in the 3D view and as the bottom-most row in the editor's list.
4. Add "Hueco abierto" — confirm it appears directly above the drawers (80–120cm) with no gap and no geometry overlap, and the editor list shows it above the cajones row.
5. Add "Barra para ropa" — confirm a horizontal rod appears above the open block, at 90cm from ITS OWN block's bottom (so world height = block's yBottomCm + 90cm).
6. Change the drawer block's height number input from 80 to 100 — confirm every block above it in the 3D view shifts up by 20cm immediately, and the editor's cm ranges update to match.
7. Click ↑/↓ on a block — confirm it swaps position with its neighbor and the 3D view updates positions accordingly, with no overlap.
8. Add enough block height to exceed 240cm total — confirm the header's cm readout turns to the "excede por Ncm" warning state.
9. Add a second module — confirm it's auto-packed immediately to the right of the first with no gap, and each module's block stack is independent (editing one doesn't affect the other).
10. On the "Cajones" block, change "Cajones" from 5 to 3 and "Separación" from 1 to 2 — confirm the 3D view now shows 3 evenly-spaced drawer faces instead of 5. On the "Hueco con puertas" block (add one if not already present), change "Puertas" and toggle "Con llave" — confirm the door count changes in the 3D view. On the "Barra para ropa" block, change its rod height — confirm the rod moves up/down within its own block's range.
11. Refresh the page — confirm the whole draft (both modules, all blocks, and their per-kind config) is restored from localStorage.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/closet/ClosetBuilder.tsx frontend/app/closet/page.tsx
git commit -m "feat(closet): builder page and /closet route"
```
