# Closet Designer Phase 2 (Multiple Conjuntos + Top Shelf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a niche área hold multiple independently-placed conjuntos (each still an auto-packed row of modules) with real drag-to-reposition and collision avoidance, plus a top shelf that spans a contiguous run of one conjunto's modules.

**Architecture:** A conjunto's only real degree of freedom in a niche (one wall, no walk-around) is its X offset along that wall — drag is a 1-DOF adaptation of the floor-plane-raycast technique `KitchenAssemblyScene.tsx` uses for its modules, with a 1-D AABB-overlap/nearest-free-X resolver mirroring (not reusing — that code is tightly coupled to `KitchenModule`) kitchen's `findNearestFreePosition` ring-search pattern. The top shelf's contiguous-coverage rule is enforced by construction in the UI (a "desde/hasta" module-range picker can only ever select a contiguous run) and reconciled defensively in the store whenever a covered module is removed.

**Tech Stack:** Next.js 16, React Three Fiber / `@react-three/drei`, Zustand 5, TypeScript. No frontend test runner exists in this repo. Pure logic (Task 1) is verified with real executable assertions via `npx tsx`. Everything else is verified with `npx tsc --noEmit` plus a manual smoke check.

**Spec:** `docs/superpowers/specs/2026-08-14-closet-designer-design.md` (§6, §10 — phase 2 scope)

## Global Constraints

- Still fully independent from kitchen — no new imports from `store/useKitchenStore.ts`, `types/kitchen.ts`, or `services/kitchenData.ts` in this plan.
- Still niche-only (`spaceType: "room"` support is phase 3, out of scope here). A conjunto's `z`/`rotation` fields exist on the type already but are not mutated by anything in this plan — only `x` becomes user-controlled.
- `ClosetTopShelf` stays scoped to one conjunto's own modules (per the approved design) — do not move it to the área level or let it span multiple conjuntos.
- A conjunto's modules are still auto-packed via `stackAlongAxis` (unchanged from phase 1) — only the conjunto's own position within the área becomes freely placeable, not the modules within it.
- Every new module-mutating or conjunto-mutating store action continues routing through `updateModuleInProject`/`updateConjuntoInProject` (or a new equivalent `updateAreaInProject` for area-level list changes) — no inline `areas.map(...).conjuntos.map(...)` traversals added elsewhere in the store.

---

### Task 1: Conjunto spatial helpers + top shelf logic

**Files:**
- Modify: `frontend/services/closetData.ts`

**Interfaces:**
- Consumes: `ClosetConjunto`, `ClosetTopShelf` (from `frontend/types/closet.ts`, already exist), `stackAlongAxis`, `moduleTotalHeightCm` (already in this file).
- Produces: `ConjuntoRange`, `conjuntoWidthCm(conjunto): number`, `conjuntoRange(conjunto): ConjuntoRange`, `conjuntosOverlap(a, b): boolean`, `findNearestFreeConjuntoX(targetXCm, widthCm, areaWidthCm, others): number | null`, `buildNewTopShelf(coversModuleIds): ClosetTopShelf`, `reconcileTopShelfCoverage(topShelf, moduleIdsInOrder): ClosetTopShelf | null`, `TopShelfLayout`, `layoutTopShelf(topShelf, conjunto): TopShelfLayout | null`. Tasks 2 and 3 consume all of these.

- [ ] **Step 1: Add `ClosetTopShelf` to the type import**

Line 1-4 currently reads:
```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
```
Replace with:
```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, ClosetTopShelf, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
```

- [ ] **Step 2: Append the conjunto placement and top shelf logic**

At the end of `frontend/services/closetData.ts` (after the existing `buildNewArea` function), append:

```ts

// ─── Conjunto placement (1D — a niche área only ever has one wall, so a
// conjunto's only real degree of freedom is its X offset along it) ─────────
export interface ConjuntoRange { startCm: number; endCm: number }

export function conjuntoWidthCm(conjunto: ClosetConjunto): number {
  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width })));
  return packed.length ? packed[packed.length - 1].endCm : 0;
}

export function conjuntoRange(conjunto: ClosetConjunto): ConjuntoRange {
  const widthCm = conjuntoWidthCm(conjunto);
  return { startCm: conjunto.x, endCm: conjunto.x + widthCm };
}

// Just enough tolerance to absorb floating-point noise, same rationale as
// kitchen's OVERLAP_TOLERANCE_M.
const CONJUNTO_OVERLAP_TOLERANCE_CM = 0.3;

export function conjuntosOverlap(a: ConjuntoRange, b: ConjuntoRange): boolean {
  return a.startCm < b.endCm - CONJUNTO_OVERLAP_TOLERANCE_CM && a.endCm > b.startCm + CONJUNTO_OVERLAP_TOLERANCE_CM;
}

// A drag release is "place it here" — searches outward in both directions
// (1cm steps) from the target for the nearest X where the conjunto's own
// width doesn't overlap any other conjunto's range, clamped to stay fully
// inside the área. Mirrors kitchen's findNearestFreePosition ring-search,
// simplified from a 2D ring to a 1D line since a conjunto only has one axis
// of freedom. Returns null only if truly nothing in [0, areaWidthCm] fits
// (the conjunto is wider than the área itself).
export function findNearestFreeConjuntoX(
  targetXCm: number, widthCm: number, areaWidthCm: number, others: ConjuntoRange[],
): number | null {
  const maxX = areaWidthCm - widthCm;
  if (maxX < 0) return null;
  const clamp = (x: number) => Math.min(Math.max(x, 0), maxX);
  const overlapsAny = (x: number) => others.some((o) => conjuntosOverlap({ startCm: x, endCm: x + widthCm }, o));

  const clamped = clamp(targetXCm);
  if (!overlapsAny(clamped)) return clamped;

  const stepCm = 1;
  for (let offset = stepCm; offset <= areaWidthCm; offset += stepCm) {
    for (const dir of [1, -1] as const) {
      const candidate = clamp(targetXCm + dir * offset);
      if (!overlapsAny(candidate)) return candidate;
    }
  }
  return null;
}

// ─── Repisa superior (spans a contiguous run of one conjunto's modules) ────
export function buildNewTopShelf(coversModuleIds: string[]): ClosetTopShelf {
  return { id: newId("repisa"), coversModuleIds, thickness: 2, material: "Melamina blanca 15mm" };
}

// If a covered module is removed, the shelf's coverage shrinks to whatever
// contiguous sub-run of its ORIGINAL coverage still exists in the module's
// new order; if none of the covered ids remain, the shelf is dropped. The
// "survivors are no longer contiguous" case (some other module now sits
// between two covered ones) can't currently happen through the app — modules
// only ever get appended or removed, never reordered/inserted mid-list, so
// removing one always closes the gap cleanly — but the check stays in place
// as the correct, defensive behavior for if/when module reordering is added.
export function reconcileTopShelfCoverage(topShelf: ClosetTopShelf, moduleIdsInOrder: string[]): ClosetTopShelf | null {
  const stillPresent = topShelf.coversModuleIds.filter((id) => moduleIdsInOrder.includes(id));
  if (stillPresent.length === 0) return null;
  const indices = stillPresent.map((id) => moduleIdsInOrder.indexOf(id)).sort((a, b) => a - b);
  const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
  if (!isContiguous) return null;
  return { ...topShelf, coversModuleIds: indices.map((idx) => moduleIdsInOrder[idx]) };
}

export interface TopShelfLayout { xStartCm: number; xEndCm: number; yTopCm: number }

export function layoutTopShelf(topShelf: ClosetTopShelf, conjunto: ClosetConjunto): TopShelfLayout | null {
  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
  const covered = packed.filter((p) => topShelf.coversModuleIds.includes(p.item.module.id));
  if (covered.length === 0) return null;
  return {
    xStartCm: Math.min(...covered.map((p) => p.startCm)),
    xEndCm: Math.max(...covered.map((p) => p.endCm)),
    yTopCm: Math.max(...covered.map((p) => moduleTotalHeightCm(p.item.module.blocks))),
  };
}
```

- [ ] **Step 3: Write and run an executable verification script**

Create `frontend/scripts/verify-closet-conjunto.ts`:

```ts
import {
  conjuntoWidthCm, conjuntoRange, conjuntosOverlap, findNearestFreeConjuntoX,
  buildNewTopShelf, reconcileTopShelfCoverage, layoutTopShelf,
  buildNewConjunto, buildNewClosetModule,
} from "../services/closetData";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok: ${msg}`);
}

// conjuntoWidthCm / conjuntoRange
const conjunto = buildNewConjunto(50, 0);
const m1 = buildNewClosetModule(60, 60);
const m2 = buildNewClosetModule(100, 60);
conjunto.modules = [m1, m2];
assert(conjuntoWidthCm(conjunto) === 160, "conjunto width is the sum of its modules' widths (60+100)");
const range = conjuntoRange(conjunto);
assert(range.startCm === 50 && range.endCm === 210, "conjunto range is [x, x+width] = [50, 210]");

// conjuntosOverlap
assert(conjuntosOverlap({ startCm: 0, endCm: 100 }, { startCm: 50, endCm: 150 }) === true, "overlapping ranges are detected");
assert(conjuntosOverlap({ startCm: 0, endCm: 100 }, { startCm: 100, endCm: 200 }) === false, "touching-but-not-overlapping ranges are not an overlap");
assert(conjuntosOverlap({ startCm: 0, endCm: 100 }, { startCm: 200, endCm: 300 }) === false, "far-apart ranges don't overlap");

// findNearestFreeConjuntoX
assert(findNearestFreeConjuntoX(50, 60, 300, []) === 50, "no obstacles: target position is used as-is");
const blocked = findNearestFreeConjuntoX(50, 60, 300, [{ startCm: 0, endCm: 100 }]);
assert(blocked !== null && blocked >= 100, `blocked position resolves clear of the obstacle, got ${blocked}`);
assert(findNearestFreeConjuntoX(1000, 60, 300, []) === 240, "target beyond the área clamps to the max valid X (300-60=240)");
assert(findNearestFreeConjuntoX(0, 400, 300, []) === null, "a conjunto wider than the área itself has no valid position");

// top shelf
const shelf = buildNewTopShelf([m1.id, m2.id]);
assert(shelf.coversModuleIds.length === 2, "new shelf covers exactly the given module ids");
const layout = layoutTopShelf(shelf, conjunto);
assert(layout !== null && layout.xStartCm === 0 && layout.xEndCm === 160, `shelf spans the full packed width of its covered modules, got ${JSON.stringify(layout)}`);

// reconcileTopShelfCoverage
const m3 = buildNewClosetModule(50, 60);
const threeShelf = buildNewTopShelf([m1.id, m2.id, m3.id]);
const afterRemovingMiddle = reconcileTopShelfCoverage(threeShelf, [m1.id, m3.id]); // m2 removed
assert(afterRemovingMiddle !== null && afterRemovingMiddle.coversModuleIds.length === 2, "removing a covered module shrinks coverage to the survivors, still contiguous once the gap closes");
const afterRemovingEnd = reconcileTopShelfCoverage(threeShelf, [m1.id, m2.id]); // m3 removed
assert(afterRemovingEnd !== null && afterRemovingEnd.coversModuleIds.length === 2, "removing an end covered module shrinks coverage to the remaining run");
assert(reconcileTopShelfCoverage(threeShelf, []) === null, "removing every covered module drops the shelf");
// The "non-contiguous survivors" branch can't happen via today's
// append/remove-only actions — exercised directly against the pure
// function, simulating a hypothetical future reorder that splits coverage.
const nonContiguous = reconcileTopShelfCoverage(buildNewTopShelf([m1.id, m3.id]), [m1.id, "some_other_module", m3.id]);
assert(nonContiguous === null, "if survivors end up split by another module in between, the shelf is dropped rather than guessed");

console.log("All conjunto/top-shelf checks passed.");
```

Run (from `frontend/`):
```bash
npx tsx scripts/verify-closet-conjunto.ts
```
Expected: every line prints `ok: ...`, ending with `All conjunto/top-shelf checks passed.` and exit code 0. If any assertion throws, fix `closetData.ts` (not the script) and re-run.

- [ ] **Step 4: Delete the throwaway script**

```bash
rm frontend/scripts/verify-closet-conjunto.ts
```

- [ ] **Step 5: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/closetData.ts
git commit -m "feat(closet): conjunto placement math and top-shelf coverage logic"
```

---

### Task 2: Store — multiple conjuntos + top shelf actions

**Files:**
- Modify: `frontend/store/useClosetStore.ts`

**Interfaces:**
- Consumes: `conjuntoWidthCm`, `buildNewTopShelf`, `reconcileTopShelfCoverage` (Task 1).
- Produces: new state field `selectedConjuntoId: string | null`; new actions `addConjunto(): void`, `removeConjunto(conjuntoId): void`, `selectConjunto(conjuntoId): void`, `updateConjuntoX(conjuntoId, xCm): void`, `setTopShelf(conjuntoId, coversModuleIds): void`, `removeTopShelf(conjuntoId): void`; modifies existing `initNiche`, `addModule`, `removeModule`. Tasks 3 and 4 consume all of these.

- [ ] **Step 1: Add `ClosetArea` to the type import and the two new closetData imports**

Lines 6-10 currently read:
```ts
import type {
  ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule, ClosetProject,
  DoorBlockConfig, DrawerBlockConfig, HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
import { buildNewArea, buildNewBlock, buildNewClosetModule, buildNewConjunto } from "@/services/closetData";
```
Replace with:
```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule, ClosetProject,
  DoorBlockConfig, DrawerBlockConfig, HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
import {
  buildNewArea, buildNewBlock, buildNewClosetModule, buildNewConjunto,
  buildNewTopShelf, conjuntoWidthCm, reconcileTopShelfCoverage,
} from "@/services/closetData";
```

- [ ] **Step 2: Add `selectedConjuntoId` and the new action signatures to the interface**

Lines 51-53 currently read:
```ts
interface ClosetStore {
  project: ClosetProject | null;
  selectedModuleId: string | null;
```
Replace with:
```ts
interface ClosetStore {
  project: ClosetProject | null;
  selectedModuleId: string | null;
  // Which conjunto's modules/editor the UI is currently showing. Switching
  // conjuntos always clears selectedModuleId too (see selectConjunto) — a
  // module selected in a different conjunto has no meaning once the visible
  // module list belongs to a new one.
  selectedConjuntoId: string | null;
```

Lines 78-79 currently read:
```ts
  updateBlockConfig: (moduleId: string, blockId: string, patch: ClosetBlockConfigPatch) => void;
  updateModuleWidth: (moduleId: string, widthCm: number) => void;
}
```
Replace with:
```ts
  updateBlockConfig: (moduleId: string, blockId: string, patch: ClosetBlockConfigPatch) => void;
  updateModuleWidth: (moduleId: string, widthCm: number) => void;

  addConjunto: () => void;
  removeConjunto: (conjuntoId: string) => void;
  selectConjunto: (conjuntoId: string | null) => void;
  updateConjuntoX: (conjuntoId: string, xCm: number) => void;
  setTopShelf: (conjuntoId: string, coversModuleIds: string[]) => void;
  removeTopShelf: (conjuntoId: string) => void;
}
```

- [ ] **Step 3: Add the `updateAreaInProject` shared-traversal helper**

Immediately after the existing `updateConjuntoInProject` function (which ends right before `export const useClosetStore = create<ClosetStore>()(`), insert:

```ts

// Same shared-lookup rationale as updateModuleInProject/updateConjuntoInProject,
// one level up again: adding/removing a conjunto itself (not a module within
// one) changes the área's own conjuntos array, so it goes through this
// instead of a third inline areas.map(...) traversal.
function updateAreaInProject(project: ClosetProject, areaId: string, updater: (area: ClosetArea) => ClosetArea): ClosetProject {
  return { ...project, areas: project.areas.map((area) => (area.id === areaId ? updater(area) : area)) };
}
```

- [ ] **Step 4: Update `initNiche` to select the auto-created conjunto**

Lines (in the current file, inside the store body) read:
```ts
      initNiche: (widthCm, heightCm, depthCm) => {
        const area = buildNewArea("Closet", "niche", { width: widthCm, height: heightCm, depth: depthCm });
        area.conjuntos = [buildNewConjunto(0, 0)];
        set({
          project: { id: null, clientName: "", projectName: "Closet nuevo", notes: "", areas: [area] },
          selectedModuleId: null,
        });
      },
```
Replace with:
```ts
      initNiche: (widthCm, heightCm, depthCm) => {
        const area = buildNewArea("Closet", "niche", { width: widthCm, height: heightCm, depth: depthCm });
        const firstConjunto = buildNewConjunto(0, 0);
        area.conjuntos = [firstConjunto];
        set({
          project: { id: null, clientName: "", projectName: "Closet nuevo", notes: "", areas: [area] },
          selectedModuleId: null,
          selectedConjuntoId: firstConjunto.id,
        });
      },
```

- [ ] **Step 5: Update `addModule` to target the selected conjunto, not always `conjuntos[0]`**

Currently reads:
```ts
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
```
Replace with:
```ts
      addModule: (widthCm, depthCm) =>
        set((s) => {
          if (!s.project) return {};
          // Phase 2: multiple conjuntos may exist — a new module always goes
          // into whichever one is currently selected, falling back to the
          // first conjunto if somehow none is selected yet.
          const targetConjuntoId = s.selectedConjuntoId ?? s.project.areas[0]?.conjuntos[0]?.id;
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
```

- [ ] **Step 6: Update `removeModule` to reconcile the owning conjunto's top shelf**

Currently reads:
```ts
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
```
Replace with:
```ts
      removeModule: (moduleId) =>
        set((s) => {
          if (!s.project) return {};
          const owningConjunto = s.project.areas
            .flatMap((area) => area.conjuntos)
            .find((conjunto) => conjunto.modules.some((m) => m.id === moduleId));
          if (!owningConjunto) return {};
          return {
            project: updateConjuntoInProject(s.project, owningConjunto.id, (conjunto) => {
              const modules = conjunto.modules.filter((m) => m.id !== moduleId);
              const topShelf = conjunto.topShelf
                ? reconcileTopShelfCoverage(conjunto.topShelf, modules.map((m) => m.id)) ?? undefined
                : undefined;
              return { ...conjunto, modules, topShelf };
            }),
            selectedModuleId: s.selectedModuleId === moduleId ? null : s.selectedModuleId,
          };
        }),
```

- [ ] **Step 7: Add `selectedConjuntoId: null` to the initial state**

Currently reads:
```ts
      project: null,
      selectedModuleId: null,
      _hasHydrated: false,
      setHasHydrated: () => set({ _hasHydrated: true }),
```
Replace with:
```ts
      project: null,
      selectedModuleId: null,
      selectedConjuntoId: null,
      _hasHydrated: false,
      setHasHydrated: () => set({ _hasHydrated: true }),
```

- [ ] **Step 8: Add the six new actions**

Immediately after the existing `updateModuleWidth` action (the last action before the closing `}),` of the store body, right before the `{ name: "closet-draft-v1", ...` persist config object), insert:

```ts

      addConjunto: () =>
        set((s) => {
          if (!s.project) return {};
          const area = s.project.areas[0];
          if (!area) return {};
          const rightmostEndCm = area.conjuntos.reduce((max, c) => Math.max(max, c.x + conjuntoWidthCm(c)), 0);
          const newConjunto = buildNewConjunto(area.conjuntos.length ? rightmostEndCm + 10 : 0, 0);
          return {
            project: updateAreaInProject(s.project, area.id, (a) => ({ ...a, conjuntos: [...a.conjuntos, newConjunto] })),
            selectedConjuntoId: newConjunto.id,
            selectedModuleId: null,
          };
        }),

      removeConjunto: (conjuntoId) =>
        set((s) => {
          if (!s.project) return {};
          const area = s.project.areas[0];
          if (!area) return {};
          const remaining = area.conjuntos.filter((c) => c.id !== conjuntoId);
          const wasSelected = s.selectedConjuntoId === conjuntoId;
          return {
            project: updateAreaInProject(s.project, area.id, (a) => ({ ...a, conjuntos: remaining })),
            selectedConjuntoId: wasSelected ? (remaining[0]?.id ?? null) : s.selectedConjuntoId,
            selectedModuleId: wasSelected ? null : s.selectedModuleId,
          };
        }),

      selectConjunto: (conjuntoId) => set({ selectedConjuntoId: conjuntoId, selectedModuleId: null }),

      updateConjuntoX: (conjuntoId, xCm) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateConjuntoInProject(s.project, conjuntoId, (c) => ({ ...c, x: xCm })) };
        }),

      setTopShelf: (conjuntoId, coversModuleIds) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateConjuntoInProject(s.project, conjuntoId, (c) => ({ ...c, topShelf: buildNewTopShelf(coversModuleIds) })) };
        }),

      removeTopShelf: (conjuntoId) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateConjuntoInProject(s.project, conjuntoId, (c) => ({ ...c, topShelf: undefined })) };
        }),
```

- [ ] **Step 9: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/store/useClosetStore.ts
git commit -m "feat(closet): store actions for multiple conjuntos and top shelves"
```

---

### Task 3: Scene — multiple conjuntos, drag, top shelf mesh

**Files:**
- Modify: `frontend/components/3d/ClosetAssemblyScene.tsx`

**Interfaces:**
- Consumes: `Box` (from `./ModulePreview3D`, already exported in phase 1 Task 1), `ClosetModuleMesh` (from `./ClosetBlockMeshes`), `stackAlongAxis`, `conjuntoWidthCm`, `conjuntoRange`, `findNearestFreeConjuntoX`, `layoutTopShelf` (Task 1).
- Produces: `ClosetAssemblyScene({ project, onConjuntoMove }: { project: ClosetProject; onConjuntoMove: (conjuntoId: string, xCm: number) => void }): JSX.Element`. Task 4 consumes this (new `onConjuntoMove` prop).

- [ ] **Step 1: Replace the whole file**

`frontend/components/3d/ClosetAssemblyScene.tsx` currently ends with a single-conjunto, non-draggable implementation. Replace the entire file content with:

```tsx
"use client";

import { useRef, useState, type RefObject } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box } from "./ModulePreview3D";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import { stackAlongAxis, conjuntoWidthCm, conjuntoRange, findNearestFreeConjuntoX, layoutTopShelf } from "@/services/closetData";
import { isNicheSpace, type ClosetConjunto, type ClosetProject } from "@/types/closet";

const SHELF_THICKNESS_M = 0.02;
const SHELF_COLOR = "#d4c5b0";

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

function TopShelfMesh({ conjunto, xCm }: { conjunto: ClosetConjunto; xCm: number }) {
  if (!conjunto.topShelf) return null;
  const layout = layoutTopShelf(conjunto.topShelf, conjunto);
  if (!layout) return null;
  const widthM = (layout.xEndCm - layout.xStartCm) / 100;
  const depthM = Math.max(...conjunto.modules.map((m) => m.depth), 0) / 100;
  if (widthM <= 0 || depthM <= 0) return null;
  return (
    <Box
      pos={[xCm / 100 + (layout.xStartCm + layout.xEndCm) / 200, layout.yTopCm / 100 + SHELF_THICKNESS_M / 2, depthM / 2]}
      size={[widthM, SHELF_THICKNESS_M, depthM]}
      color={SHELF_COLOR}
    />
  );
}

// Drag lives inside the Canvas (needs useThree for camera/gl to raycast the
// floor plane) — a conjunto only ever needs its X coordinate in a niche (one
// wall, no room to move front-to-back or rotate), so this is a 1-DOF version
// of the floor-raycast drag technique KitchenAssemblyScene.tsx uses for its
// modules, simplified accordingly. See findNearestFreeConjuntoX for how a
// drop that would overlap another conjunto resolves to the nearest free spot
// instead of snapping back to where the drag started.
function useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
}) {
  const { camera, gl } = useThree();
  const [dragPreview, setDragPreview] = useState<{ id: string; xCm: number } | null>(null);
  const dragRef = useRef<{ conjuntoId: string; pointerId: number; grabOffsetCm: number } | null>(null);

  const getFloorXCm = (clientX: number, clientY: number): number | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point.x * 100 : null;
  };

  const startDrag = (conjunto: ClosetConjunto, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pointerId = e.nativeEvent.pointerId;
    const floorXCm = getFloorXCm(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (floorXCm === null) return;
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* already captured */ }
    // Offset between the pointer's floor X and the conjunto's own x at grab
    // time — keeps the same grab point under the cursor throughout the drag
    // instead of snapping the conjunto's left edge to wherever the pointer is.
    dragRef.current = { conjuntoId: conjunto.id, pointerId, grabOffsetCm: floorXCm - conjunto.x };
    setDragPreview({ id: conjunto.id, xCm: conjunto.x });

    const resolveXCm = (clientX: number, clientY: number): number | null => {
      const state = dragRef.current;
      if (!state) return null;
      const floorX = getFloorXCm(clientX, clientY);
      return floorX === null ? null : floorX - state.grabOffsetCm;
    };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY);
      if (targetXCm !== null) setDragPreview({ id: state.conjuntoId, xCm: targetXCm });
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (controlsRef.current) controlsRef.current.enabled = true;
      dragRef.current = null;
      setDragPreview(null);
    };

    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY) ?? conjunto.x;
      const widthCm = conjuntoWidthCm(conjunto);
      const others = conjuntos.filter((c) => c.id !== state.conjuntoId).map((c) => conjuntoRange(c));
      const resolvedXCm = findNearestFreeConjuntoX(targetXCm, widthCm, areaWidthCm, others);
      if (resolvedXCm !== null) onConjuntoMove(state.conjuntoId, resolvedXCm);
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function ConjuntoLayer({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
}) {
  const { dragPreview, startDrag } = useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove });

  return (
    <>
      {conjuntos.map((conjunto) => {
        const xCm = dragPreview?.id === conjunto.id ? dragPreview.xCm : conjunto.x;
        const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => (
              <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100 + (startCm + item.module.width / 2) / 100} z={item.module.depth / 200} />
            ))}
            <TopShelfMesh conjunto={conjunto} xCm={xCm} />
          </group>
        );
      })}
    </>
  );
}

export function ClosetAssemblyScene({ project, onConjuntoMove }: {
  project: ClosetProject;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
}) {
  const area = project.areas[0];
  const controlsRef = useRef<OrbitControlsImpl>(null);
  if (!area || !isNicheSpace(area.space)) return null;

  const { width, height, depth } = area.space;
  const widthM = width / 100;
  const heightM = height / 100;
  const depthM = depth / 100;
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
        <ConjuntoLayer conjuntos={area.conjuntos} areaWidthCm={width} controlsRef={controlsRef} onConjuntoMove={onConjuntoMove} />
        <OrbitControls ref={controlsRef} target={[widthM / 2, heightM / 2, 0]} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
```

Note the removed `rowOffsetM` auto-centering from phase 1: with conjunto position now real, user-controlled data, a freshly-created conjunto renders at its stored `x` (0 by default, i.e. flush against the left edge) rather than being visually centered regardless of stored position — centering only made sense when position was pure presentation, not stored state.

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: an error in `frontend/components/closet/ClosetBuilder.tsx` only, since it still calls `<ClosetAssemblyScene project={project} />` without the new required `onConjuntoMove` prop — fixed in Task 4. No errors in `ClosetAssemblyScene.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/3d/ClosetAssemblyScene.tsx
git commit -m "feat(closet): render multiple draggable conjuntos and the top shelf mesh"
```

---

### Task 4: Builder UI — conjuntos list, top shelf editor, wiring

**Files:**
- Modify: `frontend/components/closet/ClosetBuilder.tsx`
- Create: `frontend/components/closet/ClosetTopShelfEditor.tsx`

**Interfaces:**
- Consumes: `selectedConjuntoId`, `addConjunto`, `removeConjunto`, `selectConjunto`, `updateConjuntoX`, `setTopShelf`, `removeTopShelf` (Task 2); the new `ClosetAssemblyScene` signature (Task 3).
- Produces: `ClosetTopShelfEditor({ conjunto }: { conjunto: ClosetConjunto }): JSX.Element`, and the fully wired `/closet` end-to-end experience for phase 2.

- [ ] **Step 1: Create the top shelf editor**

Create `frontend/components/closet/ClosetTopShelfEditor.tsx`:

```tsx
"use client";

import { useClosetStore } from "@/store/useClosetStore";
import type { ClosetConjunto } from "@/types/closet";

// The repisa superior covers a CONTIGUOUS run of the conjunto's modules
// (left-to-right, matching their stacking order — see stackAlongAxis).
// Rather than free-form multi-select (which could produce a non-contiguous
// or gapped selection the data model forbids), this offers "desde"/"hasta"
// dropdowns over the module list — any pair of indices necessarily picks a
// contiguous run, so there's nothing left to validate.
export function ClosetTopShelfEditor({ conjunto }: { conjunto: ClosetConjunto }) {
  const setTopShelf = useClosetStore((s) => s.setTopShelf);
  const removeTopShelf = useClosetStore((s) => s.removeTopShelf);

  const modules = conjunto.modules;
  const covered = conjunto.topShelf?.coversModuleIds ?? [];
  const startIdx = covered.length ? modules.findIndex((m) => m.id === covered[0]) : 0;
  const endIdx = covered.length ? modules.findIndex((m) => m.id === covered[covered.length - 1]) : modules.length - 1;

  if (modules.length === 0) {
    return (
      <div className="border-b border-ivory/8 p-3">
        <p className="text-xs font-semibold text-ivory">Repisa superior</p>
        <p className="mt-1 text-[10px] text-warmgray">Agrega al menos un módulo primero.</p>
      </div>
    );
  }

  const handleRangeChange = (fromIdx: number, toIdx: number) => {
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    setTopShelf(conjunto.id, modules.slice(lo, hi + 1).map((m) => m.id));
  };

  return (
    <div className="border-b border-ivory/8 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ivory">Repisa superior</p>
        {conjunto.topShelf && (
          <button onClick={() => removeTopShelf(conjunto.id)} className="text-[10px] text-terracotta hover:underline">
            Quitar
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Desde
          <select
            value={startIdx}
            onChange={(e) => handleRangeChange(Number(e.target.value), endIdx)}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {modules.map((m, i) => (
              <option key={m.id} value={i}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Hasta
          <select
            value={endIdx}
            onChange={(e) => handleRangeChange(startIdx, Number(e.target.value))}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {modules.map((m, i) => (
              <option key={m.id} value={i}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the builder**

Replace the entire content of `frontend/components/closet/ClosetBuilder.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { ClosetAssemblyScene } from "@/components/3d/ClosetAssemblyScene";
import { ClosetModuleStackEditor } from "./ClosetModuleStackEditor";
import { ClosetTopShelfEditor } from "./ClosetTopShelfEditor";
import { NumericField } from "./NumericField";
import { isNicheSpace } from "@/types/closet";

const DEFAULT_MODULE_WIDTH_CM = 60;
const DEFAULT_MODULE_DEPTH_CM = 60;

export function ClosetBuilder() {
  const hasHydrated = useClosetStore((s) => s._hasHydrated);
  const project = useClosetStore((s) => s.project);
  const selectedConjuntoId = useClosetStore((s) => s.selectedConjuntoId);
  const selectedModuleId = useClosetStore((s) => s.selectedModuleId);
  const initNiche = useClosetStore((s) => s.initNiche);
  const addModule = useClosetStore((s) => s.addModule);
  const removeModule = useClosetStore((s) => s.removeModule);
  const selectModule = useClosetStore((s) => s.selectModule);
  const addConjunto = useClosetStore((s) => s.addConjunto);
  const removeConjunto = useClosetStore((s) => s.removeConjunto);
  const selectConjunto = useClosetStore((s) => s.selectConjunto);
  const updateConjuntoX = useClosetStore((s) => s.updateConjuntoX);
  // Width is set once here at creation time (also editable later per-module
  // in ClosetModuleStackEditor) — a hangrod module often needs to be wider
  // than a drawer module next to it, so a single fixed default isn't enough.
  const [newModuleWidthCm, setNewModuleWidthCm] = useState(DEFAULT_MODULE_WIDTH_CM);

  // First-ever visit (nothing in localStorage yet) starts from a reasonable
  // default niche so the scene isn't empty on load. Gated on hasHydrated so
  // this can never fire before persist's rehydration has genuinely applied
  // (or genuinely confirmed there's nothing to restore) — otherwise a real
  // draft can be silently overwritten by a fresh empty niche on refresh.
  useEffect(() => {
    if (hasHydrated && !project) initNiche(300, 240, 60);
  }, [hasHydrated, project, initNiche]);

  // Not yet hydrated: render nothing rather than treating "haven't checked
  // storage yet" the same as "genuinely empty" (which would otherwise flash
  // briefly before the real draft applies).
  if (!hasHydrated) return null;
  if (!project) return null;
  const area = project.areas[0];
  if (!area || !isNicheSpace(area.space)) return null;
  const { height: areaHeightCm } = area.space;

  const selectedConjunto = area.conjuntos.find((c) => c.id === selectedConjuntoId) ?? area.conjuntos[0] ?? null;
  const selectedModule = selectedConjunto?.modules.find((m) => m.id === selectedModuleId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold">{project.projectName}</h1>
        <button
          onClick={() => addConjunto()}
          className="rounded-lg border border-ivory/15 px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-ivory/8"
        >
          + Agregar conjunto
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ClosetAssemblyScene project={project} onConjuntoMove={updateConjuntoX} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ivory/8">
          <div className="border-b border-ivory/8 p-3">
            <p className="text-xs font-semibold text-ivory">Conjuntos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {area.conjuntos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConjunto(c.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${c.id === selectedConjuntoId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {selectedConjunto ? (
            <>
              <div className="border-b border-ivory/8 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ivory">Módulos</p>
                  <button
                    onClick={() => removeConjunto(selectedConjunto.id)}
                    className="text-[10px] text-terracotta hover:underline"
                  >
                    Eliminar conjunto
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedConjunto.modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectModule(m.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${m.id === selectedModuleId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-warmgray">
                    Ancho (cm)
                    <NumericField
                      value={newModuleWidthCm} min={20}
                      onCommit={setNewModuleWidthCm}
                      className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
                      ariaLabel="Ancho del nuevo módulo en centímetros"
                    />
                  </label>
                  <button
                    onClick={() => addModule(newModuleWidthCm, DEFAULT_MODULE_DEPTH_CM)}
                    className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass-soft"
                  >
                    + Agregar módulo
                  </button>
                </div>
              </div>

              {selectedModule && (
                <>
                  <ClosetModuleStackEditor module={selectedModule} maxHeightCm={areaHeightCm} />
                  <div className="border-b border-ivory/8 p-3">
                    <button
                      onClick={() => removeModule(selectedModule.id)}
                      className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                    >
                      Eliminar módulo
                    </button>
                  </div>
                </>
              )}

              <ClosetTopShelfEditor conjunto={selectedConjunto} />
            </>
          ) : (
            <p className="p-3 text-xs text-warmgray">Agrega un conjunto para empezar.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

With the dev server running (`npx next dev -p 3123` from `frontend/`, or reuse one already running), open `/closet` (clear the `closet-draft-v1` localStorage key first, or use a private window, for a clean first-visit test):

1. Confirm a single "Conjunto" chip appears already selected, with an empty "Módulos" list under it.
2. Add two modules to this conjunto, give one a "Cajones" block — confirm both auto-pack side by side as before (phase 1 behavior unchanged).
3. Click "+ Agregar conjunto" — confirm a second "Conjunto" chip appears, auto-selected, with its own empty "Módulos" list (the first conjunto's modules must NOT appear here).
4. Add a module to this second conjunto — confirm it renders in the 3D view offset to the right of the first conjunto (not overlapping it), and that switching back to the first conjunto's chip shows only its own modules again.
5. Drag the second conjunto (click and drag anywhere on its modules in the 3D view) toward the first conjunto — confirm it stops short of overlapping (collision) rather than passing through it, and confirm OrbitControls is disabled during the drag (the camera doesn't rotate while you're dragging) and re-enabled after release.
6. Drag the second conjunto to the far right edge of the niche and release — confirm it clamps fully inside the niche's width rather than hanging off the edge.
7. Refresh the page — confirm both conjuntos, their modules, and their positions are all restored exactly.
8. On the first conjunto (with 2+ modules), open "Repisa superior", pick "Desde" the first module and "Hasta" the second — confirm a shelf appears spanning both modules at the height of the taller one's top, with no gap/overlap with the module carcasses below.
9. Remove the second (rightmost) module the shelf covers — confirm the shelf either shrinks to cover just the remaining module, or (if you removed the only other one) disappears — never left floating over empty space or a stale range.
10. Click "Eliminar conjunto" on the second conjunto — confirm it disappears from both the chip list and the 3D view, and the first conjunto becomes/stays selected.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/closet/ClosetBuilder.tsx frontend/components/closet/ClosetTopShelfEditor.tsx
git commit -m "feat(closet): conjuntos list, top-shelf editor, and phase 2 wiring"
```
