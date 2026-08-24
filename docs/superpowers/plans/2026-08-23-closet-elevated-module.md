# Closet designer: elevated modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a conjunto's module (with full drawer/door/niche/hangrod block support) sit elevated on top of a contiguous run of other modules in the same conjunto, so pieces like two side-by-side drawer units sharing one wider niche on top can be modeled in the closet designer.

**Architecture:** A module becomes "elevated" by setting an optional `coversModuleIds: string[]` field (a contiguous run of sibling "ground" module ids) — no new entity type. A pure layout function (`layoutElevatedModule`, mirroring the existing `layoutTopShelf`) derives its X span, width, and base Y height from the covered ground modules on every read; nothing about its geometry is hand-edited or cached. Every place that today treats `conjunto.modules` as one flat left-to-right row (packing, width totals, 3D rendering, dimension labels) splits into "ground modules only" for that row, plus a second pass that positions each elevated module from the first pass's result.

**Tech Stack:** Next.js App Router, Zustand (`persist` middleware), react-three-fiber/drei, TypeScript, Vitest (service-layer tests only — this repo's `vitest.config.ts` deliberately restricts test discovery to `services/**` and `lib/**`, no jsdom/component tests; see Task 1).

**Spec:** `docs/superpowers/specs/2026-08-23-closet-elevated-module-design.md`

## Global Constraints

- An elevated module can only cover **ground** modules (modules with no `coversModuleIds` of their own) — no multi-level stacking.
- `coversModuleIds` must be a **contiguous** run within the conjunto's ground modules (left-to-right order).
- An elevated module's `width` and position are **always derived** from `layoutElevatedModule` — never hand-edited by the user, and the renderer/editor must read the live derived value rather than trusting whatever is stored in `module.width` after creation.
- Deleting a ground module that's covered by an elevated module is **rejected outright** (no cascade-delete, no silent reconciliation) — the caller must remove the elevated module first.
- Purely additive to the persisted schema (`coversModuleIds` optional) — no migration for existing saved closets.
- Automated tests only for pure, framework-free logic under `frontend/services/` (this repo's existing, deliberate convention — see `frontend/vitest.config.ts`'s own comment). Store/UI/3D-rendering changes are verified by `npx tsc --noEmit` plus manual browser verification, matching how every other closet/kitchen builder feature in this repo has been verified.

---

### Task 1: Data model + layout helpers (`frontend/types/closet.ts`, `frontend/services/closetData.ts`)

**Files:**
- Modify: `frontend/types/closet.ts:37-44` (add `coversModuleIds` to `ClosetModule`)
- Modify: `frontend/services/closetData.ts:102-197` (add helpers, fix `conjuntoWidthCm`)
- Test: `frontend/services/closetData.test.ts` (new file)

**Interfaces:**
- Produces: `isElevatedModule(module: ClosetModule): boolean`; `groundModulesOf(conjunto: ClosetConjunto): ClosetModule[]`; `layoutElevatedModule(coversModuleIds: string[], groundModules: ClosetModule[]): ElevatedModuleLayout | null` where `ElevatedModuleLayout = { xStartCm: number; xEndCm: number; yBaseCm: number }`; `buildNewElevatedModule(coversModuleIds: string[], widthCm: number, depthCm: number): ClosetModule`. `conjuntoWidthCm` keeps its existing signature but its behavior changes (ground-only).

- [ ] **Step 1: Add the field to the type**

In `frontend/types/closet.ts`, change the `ClosetModule` interface (lines 37-44):

```ts
export interface ClosetModule {
  id: string;
  label: string;
  width: number; // cm, fixed for a ground module; DERIVED for an elevated
                 // one (see layoutElevatedModule) — never trust this field
                 // for an elevated module's current width, always recompute
  depth: number;
  // height is NEVER stored — always sum(blocks[i].heightCm), see layoutModuleBlocks
  blocks: ClosetBlock[]; // bottom-to-top order
  coversModuleIds?: string[]; // present only on an ELEVATED module — a
                              // contiguous run of sibling GROUND module ids
                              // (a module whose own coversModuleIds is set
                              // may never appear in another's list — no
                              // multi-level stacking)
}
```

- [ ] **Step 2: Write the failing tests for the new closetData.ts helpers**

Create `frontend/services/closetData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildNewElevatedModule, conjuntoWidthCm, groundModulesOf, isElevatedModule, layoutElevatedModule,
} from "@/services/closetData";
import type { ClosetBlock, ClosetConjunto, ClosetModule } from "@/types/closet";

function openBlock(id: string, heightCm: number): ClosetBlock {
  return { id, kind: "open", heightCm, config: {} };
}

function module(over: Partial<ClosetModule> & Pick<ClosetModule, "id">): ClosetModule {
  return { label: "Módulo", width: 60, depth: 60, blocks: [], ...over };
}

function conjunto(modules: ClosetModule[]): ClosetConjunto {
  return { id: "c1", label: "Conjunto", x: 0, z: 0, rotation: 0, modules };
}

describe("isElevatedModule / groundModulesOf", () => {
  it("treats a module with coversModuleIds as elevated, everything else as ground", () => {
    const a = module({ id: "a" });
    const b = module({ id: "b", coversModuleIds: ["a"] });
    expect(isElevatedModule(a)).toBe(false);
    expect(isElevatedModule(b)).toBe(true);
    expect(groundModulesOf(conjunto([a, b])).map((m) => m.id)).toEqual(["a"]);
  });

  it("treats an empty coversModuleIds array as NOT elevated", () => {
    const a = module({ id: "a", coversModuleIds: [] });
    expect(isElevatedModule(a)).toBe(false);
  });
});

describe("conjuntoWidthCm", () => {
  it("sums ground module widths normally when nothing is elevated", () => {
    const a = module({ id: "a", width: 60 });
    const b = module({ id: "b", width: 90 });
    expect(conjuntoWidthCm(conjunto([a, b]))).toBe(150);
  });

  it("does not double-count an elevated module's width on top of the ground modules it covers", () => {
    const a = module({ id: "a", width: 60 });
    const b = module({ id: "b", width: 60 });
    const elevated = buildNewElevatedModule(["a", "b"], 120, 60);
    expect(conjuntoWidthCm(conjunto([a, b, elevated]))).toBe(120); // NOT 240
  });
});

describe("layoutElevatedModule", () => {
  it("spans the combined width of the covered modules and sits at their max height", () => {
    const a = module({ id: "a", width: 60, blocks: [openBlock("ba", 80)] });
    const b = module({ id: "b", width: 60, blocks: [openBlock("bb", 100)] });
    expect(layoutElevatedModule(["a", "b"], [a, b])).toEqual({ xStartCm: 0, xEndCm: 120, yBaseCm: 100 });
  });

  it("spans a single covered module, positioned at its own slot", () => {
    const a = module({ id: "a", width: 60, blocks: [openBlock("ba", 40)] });
    const b = module({ id: "b", width: 60 });
    expect(layoutElevatedModule(["b"], [a, b])).toEqual({ xStartCm: 60, xEndCm: 120, yBaseCm: 0 });
  });

  it("returns null when none of the covered ids exist among the ground modules", () => {
    const a = module({ id: "a", width: 60 });
    expect(layoutElevatedModule(["missing"], [a])).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run services/closetData.test.ts`
Expected: FAIL — `isElevatedModule`, `groundModulesOf`, `layoutElevatedModule`, `buildNewElevatedModule` are not exported yet.

- [ ] **Step 4: Implement the helpers in closetData.ts**

In `frontend/services/closetData.ts`, add right before `conjuntoWidthCm` (currently line 118):

```ts
export function isElevatedModule(module: ClosetModule): boolean {
  return !!module.coversModuleIds && module.coversModuleIds.length > 0;
}

export function groundModulesOf(conjunto: ClosetConjunto): ClosetModule[] {
  return conjunto.modules.filter((m) => !isElevatedModule(m));
}
```

Then fix `conjuntoWidthCm` (currently lines 118-121) to pack ground modules only:

```ts
export function conjuntoWidthCm(conjunto: ClosetConjunto): number {
  const packed = stackAlongAxis(groundModulesOf(conjunto).map((m) => ({ sizeCm: m.width })));
  return packed.length ? packed[packed.length - 1].endCm : 0;
}
```

Then add, right after `layoutTopShelf` (currently ends at line 197):

```ts
// ─── Elevated modules (a real module sitting on top of a contiguous run of
// ground modules, instead of packed next to them) ───────────────────────────
export interface ElevatedModuleLayout { xStartCm: number; xEndCm: number; yBaseCm: number }

export function layoutElevatedModule(coversModuleIds: string[], groundModules: ClosetModule[]): ElevatedModuleLayout | null {
  const packed = stackAlongAxis(groundModules.map((m) => ({ sizeCm: m.width, module: m })));
  const covered = packed.filter((p) => coversModuleIds.includes(p.item.module.id));
  if (covered.length === 0) return null;
  return {
    xStartCm: Math.min(...covered.map((p) => p.startCm)),
    xEndCm: Math.max(...covered.map((p) => p.endCm)),
    yBaseCm: Math.max(...covered.map((p) => moduleTotalHeightCm(p.item.module.blocks))),
  };
}

export function buildNewElevatedModule(coversModuleIds: string[], widthCm: number, depthCm: number): ClosetModule {
  return { id: newId("modulo"), label: "Módulo elevado", width: widthCm, depth: depthCm, blocks: [], coversModuleIds };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run services/closetData.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add types/closet.ts services/closetData.ts services/closetData.test.ts
git commit -m "feat(closet): add elevated-module layout helpers"
```

---

### Task 2: Store wiring (`frontend/store/useClosetStore.ts`)

**Files:**
- Modify: `frontend/store/useClosetStore.ts:11-14` (import additions), `:88-89` (interface), `:155-157` (add `get`), new `addElevatedModule` action right after `addModule` (currently ending `:225`), `:227-244` (`removeModule` guard), `:314-329` (`updateModuleWidth` ceiling fix)

**Interfaces:**
- Consumes (from Task 1): `groundModulesOf`, `layoutElevatedModule`, `buildNewElevatedModule` from `@/services/closetData`.
- Produces: `addElevatedModule: (coversModuleIds: string[], depthCm: number) => boolean` (`true` = created, `false` = rejected because one of `coversModuleIds` is already covered by another elevated module — the spec's "no overlapping spans" rule); `removeModule`'s signature changes from `(moduleId: string) => void` to `(moduleId: string) => boolean` (`true` = removed, `false` = rejected because the module is covered by an elevated sibling).

- [ ] **Step 1: Update imports and the store interface**

In `frontend/store/useClosetStore.ts`, change the `closetData` import (lines 11-14) to:

```ts
import {
  buildNewArea, buildNewBlock, buildNewClosetModule, buildNewConjunto, buildNewElevatedModule,
  buildNewTopShelf, conjuntoWidthCm, groundModulesOf, layoutElevatedModule, reconcileTopShelfCoverage,
} from "@/services/closetData";
```

Change `removeModule`'s and add `addElevatedModule`'s interface entries (around line 88-89):

```ts
  addModule: (widthCm: number, depthCm: number) => void;
  addElevatedModule: (coversModuleIds: string[], depthCm: number) => boolean;
  removeModule: (moduleId: string) => boolean;
```

- [ ] **Step 2: Give the store access to `get`**

Change line 157 from:

```ts
    (set) => ({
```

to:

```ts
    (set, get) => ({
```

- [ ] **Step 3: Rewrite `removeModule` to reject covered ground modules**

Replace the existing `removeModule` (currently lines 227-244):

```ts
      removeModule: (moduleId) => {
        const s = get();
        if (!s.project) return false;
        const owningConjunto = s.project.areas
          .flatMap((area) => area.conjuntos)
          .find((conjunto) => conjunto.modules.some((m) => m.id === moduleId));
        if (!owningConjunto) return false;
        const isCovered = owningConjunto.modules.some((m) => m.coversModuleIds?.includes(moduleId));
        if (isCovered) return false;
        set({
          project: updateConjuntoInProject(s.project, owningConjunto.id, (conjunto) => {
            const modules = conjunto.modules.filter((m) => m.id !== moduleId);
            const topShelf = conjunto.topShelf
              ? reconcileTopShelfCoverage(conjunto.topShelf, modules.map((m) => m.id)) ?? undefined
              : undefined;
            return { ...conjunto, modules, topShelf };
          }),
          selectedModuleId: s.selectedModuleId === moduleId ? null : s.selectedModuleId,
        });
        return true;
      },
```

- [ ] **Step 4: Fix `updateModuleWidth`'s ceiling to ignore elevated siblings**

In the existing `updateModuleWidth` (currently lines 314-329), change:

```ts
            const otherModulesWidthCm = owningConjunto.modules
              .filter((m) => m.id !== moduleId)
              .reduce((sum, m) => sum + m.width, 0);
```

to:

```ts
            const otherModulesWidthCm = groundModulesOf(owningConjunto)
              .filter((m) => m.id !== moduleId)
              .reduce((sum, m) => sum + m.width, 0);
```

- [ ] **Step 5: Add the `addElevatedModule` action**

Add it right after `addModule` (currently ends at line 225), before `removeModule`. It rejects (returns `false`, no state change) if any of `coversModuleIds` is already covered by another elevated module in the conjunto — the spec's "a ground module can be covered by at most one elevated module" rule, which nothing else in this codebase enforces (the UI's desde/hasta range picker guarantees *contiguity* by construction, same as `ClosetTopShelfEditor`, but doesn't by itself prevent two separate elevated modules from being created over the same range):

```ts
      addElevatedModule: (coversModuleIds, depthCm) => {
        const s = get();
        if (!s.project) return false;
        const targetConjuntoId = s.selectedConjuntoId ?? s.project.areas[0]?.conjuntos[0]?.id;
        if (!targetConjuntoId) return false;
        const targetConjunto = s.project.areas.flatMap((a) => a.conjuntos).find((c) => c.id === targetConjuntoId);
        if (!targetConjunto) return false;
        const alreadyCovered = targetConjunto.modules.some((m) => m.coversModuleIds?.some((id) => coversModuleIds.includes(id)));
        if (alreadyCovered) return false;
        const layout = layoutElevatedModule(coversModuleIds, groundModulesOf(targetConjunto));
        if (!layout) return false;
        const newModule = buildNewElevatedModule(coversModuleIds, layout.xEndCm - layout.xStartCm, depthCm);
        set({
          project: updateConjuntoInProject(s.project, targetConjuntoId, (conjunto) => ({
            ...conjunto,
            modules: [...conjunto.modules, newModule],
          })),
          selectedModuleId: newModule.id,
        });
        return true;
      },
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (No automated test here — this file lives under `store/`, outside this repo's deliberately narrow `vitest.config.ts` include list; full behavioral verification happens manually in Task 4 once the UI can drive it.)

- [ ] **Step 7: Commit**

```bash
cd frontend
git add store/useClosetStore.ts
git commit -m "feat(closet): add addElevatedModule action, block removing covered modules"
```

---

### Task 3: 3D rendering (`frontend/components/3d/ClosetBlockMeshes.tsx`, `frontend/components/3d/ClosetAssemblyScene.tsx`)

**Files:**
- Modify: `frontend/components/3d/ClosetBlockMeshes.tsx:124-145`
- Modify: `frontend/components/3d/ClosetAssemblyScene.tsx:10-14` (imports), `:296-306` (`ConjuntoLayer`), `:456-462` (`RoomConjuntoLayer`), `:480-488` (`NicheDimensionOverlay`)

**Interfaces:**
- Consumes (from Task 1): `groundModulesOf`, `layoutElevatedModule` from `@/services/closetData`.
- Produces: `ClosetModuleMesh` gains an optional `y` prop (default `0`) — no other component in this codebase calls `ClosetModuleMesh` outside this file, so this is not a breaking change to any other caller.

- [ ] **Step 1: Add the `y` prop to `ClosetModuleMesh`**

In `frontend/components/3d/ClosetBlockMeshes.tsx`, change (lines 124, 132):

```ts
export function ClosetModuleMesh({ module, x, y = 0, z, rotationDeg = 0 }: { module: ClosetModule; x: number; y?: number; z: number; rotationDeg?: number }) {
```

and:

```tsx
    <group position={[x, y, z]} rotation-y={(rotationDeg * Math.PI) / 180}>
```

- [ ] **Step 2: Import the new helpers in ClosetAssemblyScene.tsx**

Change the `closetData` import (lines 10-14) to:

```ts
import {
  stackAlongAxis, conjuntoWidthCm, conjuntoRange, findNearestFreeConjuntoX, layoutTopShelf, layoutElevatedModule,
  conjuntoDepthCm, conjuntoBox, conjuntoAlongWallCm, nearestWallForConjunto, findNearestFreeWallPosition, wallLocalToWorldCm,
  groundModulesOf, moduleLetter,
} from "@/services/closetData";
```

- [ ] **Step 3: Render elevated modules in the niche layer (`ConjuntoLayer`)**

In `ClosetAssemblyScene.tsx`, replace (currently lines 296-306):

```tsx
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
```

with:

```tsx
        const xCm = dragPreview?.id === conjunto.id ? dragPreview.xCm : conjunto.x;
        const groundModules = groundModulesOf(conjunto);
        const packed = stackAlongAxis(groundModules.map((m) => ({ sizeCm: m.width, module: m })));
        const elevatedModules = conjunto.modules.filter((m) => m.coversModuleIds?.length);
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => (
              <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100 + (startCm + item.module.width / 2) / 100} z={item.module.depth / 200} />
            ))}
            {elevatedModules.map((module) => {
              const layout = layoutElevatedModule(module.coversModuleIds ?? [], groundModules);
              if (!layout) return null;
              return (
                <ClosetModuleMesh
                  key={module.id}
                  module={{ ...module, width: layout.xEndCm - layout.xStartCm }}
                  x={xCm / 100 + (layout.xStartCm + layout.xEndCm) / 200}
                  y={layout.yBaseCm / 100}
                  z={module.depth / 200}
                />
              );
            })}
            <TopShelfMesh conjunto={conjunto} xCm={xCm} />
          </group>
        );
```

- [ ] **Step 4: Render elevated modules in the room layer (`RoomConjuntoLayer`)**

Replace (currently lines 456-462):

```tsx
        const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => {
              const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, startCm + item.module.width / 2, item.module.depth / 2, roomWidthCm, roomDepthCm);
              return <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100} z={zCm / 100} rotationDeg={rotation} />;
            })}
            <RoomTopShelfMesh conjunto={conjunto} alongWallCm={alongWallCm} rotation={rotation} roomWidthCm={roomWidthCm} roomDepthCm={roomDepthCm} />
          </group>
        );
```

with:

```tsx
        const groundModules = groundModulesOf(conjunto);
        const packed = stackAlongAxis(groundModules.map((m) => ({ sizeCm: m.width, module: m })));
        const elevatedModules = conjunto.modules.filter((m) => m.coversModuleIds?.length);
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => {
              const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, startCm + item.module.width / 2, item.module.depth / 2, roomWidthCm, roomDepthCm);
              return <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100} z={zCm / 100} rotationDeg={rotation} />;
            })}
            {elevatedModules.map((module) => {
              const layout = layoutElevatedModule(module.coversModuleIds ?? [], groundModules);
              if (!layout) return null;
              const centerPackCm = (layout.xStartCm + layout.xEndCm) / 2;
              const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, centerPackCm, module.depth / 2, roomWidthCm, roomDepthCm);
              return (
                <ClosetModuleMesh
                  key={module.id}
                  module={{ ...module, width: layout.xEndCm - layout.xStartCm }}
                  x={xCm / 100}
                  y={layout.yBaseCm / 100}
                  z={zCm / 100}
                  rotationDeg={rotation}
                />
              );
            })}
            <RoomTopShelfMesh conjunto={conjunto} alongWallCm={alongWallCm} rotation={rotation} roomWidthCm={roomWidthCm} roomDepthCm={roomDepthCm} />
          </group>
        );
```

- [ ] **Step 5: Add elevated-module labels to `NicheDimensionOverlay`**

Replace (currently lines 480-488):

```tsx
  const moduleLabels = area.conjuntos
    .flatMap((conjunto) => {
      const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
      return packed.map(({ item, startCm }) => ({
        id: item.module.id,
        xM: conjunto.x / 100 + (startCm + item.module.width / 2) / 100,
      }));
    })
    .sort((a, b) => a.xM - b.xM);
```

with:

```tsx
  const moduleLabels = area.conjuntos
    .flatMap((conjunto) => {
      const groundModules = groundModulesOf(conjunto);
      const packed = stackAlongAxis(groundModules.map((m) => ({ sizeCm: m.width, module: m })));
      const groundLabels = packed.map(({ item, startCm }) => ({
        id: item.module.id,
        xM: conjunto.x / 100 + (startCm + item.module.width / 2) / 100,
      }));
      const elevatedLabels = conjunto.modules
        .filter((m) => m.coversModuleIds?.length)
        .map((module) => {
          const layout = layoutElevatedModule(module.coversModuleIds ?? [], groundModules);
          return layout ? { id: module.id, xM: conjunto.x / 100 + (layout.xStartCm + layout.xEndCm) / 200 } : null;
        })
        .filter((l): l is { id: string; xM: number } => l !== null);
      return [...groundLabels, ...elevatedLabels];
    })
    .sort((a, b) => a.xM - b.xM);
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual regression check (no elevated modules exist yet)**

Run the dev server (`npm run dev` from `frontend/`), open the closet builder, build a niche with 2-3 ordinary modules (no elevated ones can be created yet — that's Task 4). Confirm they still render exactly as before: packed left-to-right at floor level, correct dimension labels. This proves the ground/elevated split didn't change behavior for existing closets.

- [ ] **Step 8: Commit**

```bash
cd frontend
git add components/3d/ClosetBlockMeshes.tsx components/3d/ClosetAssemblyScene.tsx
git commit -m "feat(closet): render elevated modules above their covered modules"
```

---

### Task 4: UI — create and edit an elevated module (`frontend/components/closet/`)

**Files:**
- Create: `frontend/components/closet/ClosetElevatedModuleEditor.tsx`
- Modify: `frontend/components/closet/ClosetBuilder.tsx:1-188`
- Modify: `frontend/components/closet/ClosetModuleStackEditor.tsx:1-11,169,204-220`

**Interfaces:**
- Consumes (from Task 1): `groundModulesOf`, `isElevatedModule`, `layoutElevatedModule` from `@/services/closetData`. (from Task 2): `useClosetStore`'s `addElevatedModule`, `removeModule` (now returns `boolean`).
- Produces: `ClosetElevatedModuleEditor({ conjunto: ClosetConjunto })` — a self-contained panel component; `ClosetModuleStackEditor` gains a required `conjunto: ClosetConjunto` prop.

- [ ] **Step 1: Create the elevated-module editor panel**

Create `frontend/components/closet/ClosetElevatedModuleEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useClosetStore } from "@/store/useClosetStore";
import { groundModulesOf } from "@/services/closetData";
import type { ClosetConjunto } from "@/types/closet";

const DEFAULT_ELEVATED_MODULE_DEPTH_CM = 60;

// Mirrors ClosetTopShelfEditor's "desde"/"hasta" range picker — any pair of
// indices over the ground-only list is necessarily a contiguous, valid span.
// Unlike ClosetTopShelfEditor (which edits one persistent topShelf), this
// panel just fires a one-shot "create" action, so the range is local UI
// state rather than derived from an existing selection.
export function ClosetElevatedModuleEditor({ conjunto }: { conjunto: ClosetConjunto }) {
  const addElevatedModule = useClosetStore((s) => s.addElevatedModule);
  const groundModules = groundModulesOf(conjunto);
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(Math.max(0, groundModules.length - 1));

  if (groundModules.length === 0) {
    return (
      <div className="border-b border-ivory/8 p-3">
        <p className="text-xs font-semibold text-ivory">Módulo elevado</p>
        <p className="mt-1 text-[10px] text-warmgray">Agrega al menos un módulo primero.</p>
      </div>
    );
  }

  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const covered = groundModules.slice(lo, hi + 1);
  const depthCm = Math.max(DEFAULT_ELEVATED_MODULE_DEPTH_CM, ...covered.map((m) => m.depth));

  return (
    <div className="border-b border-ivory/8 p-3">
      <p className="text-xs font-semibold text-ivory">Módulo elevado</p>
      <p className="mt-1 text-[10px] text-warmgray">
        Crea un módulo que se apoya encima de los módulos seleccionados, en vez de agregarse al final de la fila.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Desde
          <select
            value={fromIdx}
            onChange={(e) => setFromIdx(Number(e.target.value))}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {groundModules.map((m, i) => (
              <option key={m.id} value={i}>{`${m.label} ${i + 1}`}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Hasta
          <select
            value={toIdx}
            onChange={(e) => setToIdx(Number(e.target.value))}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {groundModules.map((m, i) => (
              <option key={m.id} value={i}>{`${m.label} ${i + 1}`}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        onClick={() => {
          const created = addElevatedModule(covered.map((m) => m.id), depthCm);
          if (!created) toast.error("Alguno de estos módulos ya está cubierto por otro módulo elevado.");
        }}
        className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-amber-400"
      >
        Elevar sobre estos módulos
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Show a read-only, live-derived width for an elevated module**

In `frontend/components/closet/ClosetModuleStackEditor.tsx`, change the imports (lines 9-10) to add the new helpers and the `ClosetConjunto` type:

```ts
import { CLOSET_BLOCK_CATALOG, groundModulesOf, isElevatedModule, layoutElevatedModule, layoutModuleBlocks, validateModuleHeight } from "@/services/closetData";
import type { ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule } from "@/types/closet";
```

Change the component signature (currently line 169):

```tsx
export function ClosetModuleStackEditor({ module, maxHeightCm, conjunto }: { module: ClosetModule; maxHeightCm: number; conjunto: ClosetConjunto }) {
```

Inside the function body, right after `const updateModuleWidth = ...` (currently line 172), add:

```ts
  const elevated = isElevatedModule(module);
  const elevatedLayout = elevated ? layoutElevatedModule(module.coversModuleIds ?? [], groundModulesOf(conjunto)) : null;
  const displayWidthCm = elevatedLayout ? elevatedLayout.xEndCm - elevatedLayout.xStartCm : module.width;
```

Replace the width field (currently lines 212-220):

```tsx
      <label className="flex items-center gap-1.5 text-[10px] text-warmgray">
        Ancho del módulo (cm)
        <NumericField
          value={module.width} min={20}
          onCommit={(n) => updateModuleWidth(module.id, n)}
          className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
          ariaLabel="Ancho del módulo en centímetros"
        />
      </label>
```

with:

```tsx
      {elevated ? (
        <p className="flex items-center gap-1.5 text-[10px] text-warmgray">
          Ancho del módulo (cm): <span className="font-semibold text-ivory">{displayWidthCm}</span> — derivado de los módulos cubiertos
        </p>
      ) : (
        <label className="flex items-center gap-1.5 text-[10px] text-warmgray">
          Ancho del módulo (cm)
          <NumericField
            value={module.width} min={20}
            onCommit={(n) => updateModuleWidth(module.id, n)}
            className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
            ariaLabel="Ancho del módulo en centímetros"
          />
        </label>
      )}
```

- [ ] **Step 3: Wire the new editor and prop into ClosetBuilder.tsx**

In `frontend/components/closet/ClosetBuilder.tsx`, add imports (near the existing component imports at lines 8-9):

```ts
import { toast } from "sonner";
import { ClosetElevatedModuleEditor } from "./ClosetElevatedModuleEditor";
```

and add `isElevatedModule` to the existing `closetData` import (currently line 11):

```ts
import { isElevatedModule, moduleLetter } from "@/services/closetData";
```

Pass `conjunto` to `ClosetModuleStackEditor` (currently line 167):

```tsx
<ClosetModuleStackEditor module={selectedModule} maxHeightCm={maxHeightCm} conjunto={selectedConjunto} />
```

Make "Eliminar módulo" surface the rejection (currently lines 169-175):

```tsx
                  <div className="border-b border-ivory/8 p-3">
                    <button
                      onClick={() => {
                        const removed = removeModule(selectedModule.id);
                        if (!removed) toast.error("Este módulo está cubierto por un módulo elevado — quítalo primero.");
                      }}
                      className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                    >
                      Eliminar módulo
                    </button>
                  </div>
```

Add the elevated-module editor panel right after `ClosetTopShelfEditor` (currently line 179):

```tsx
              <ClosetTopShelfEditor conjunto={selectedConjunto} />
              <ClosetElevatedModuleEditor conjunto={selectedConjunto} />
```

Mark elevated modules in the module tab list (currently lines 142-154):

```tsx
                    {selectedConjunto.modules.map((m, i) => (
                      <button
                        key={m.id}
                        onClick={() => selectModule(m.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          m.id === selectedModuleId
                            ? "bg-ivory text-ink"
                            : "bg-ivory/8 text-warmgray hover:text-ivory"
                        }`}
                      >
                        {isElevatedModule(m) ? "↑ " : ""}Módulo {moduleLetter(i)}
                      </button>
                    ))}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification in the browser**

Run the dev server (`npm run dev` from `frontend/`), open the closet builder:

1. Create a niche, add two modules (default 60×60cm each).
2. On each, add a "Cajones" block so they look like drawer units.
3. In "Módulo elevado", leave Desde/Hasta covering both, click "Elevar sobre estos módulos".
4. Confirm: a third module tab appears marked "↑", the 3D scene shows a new module sitting flush on top of the two drawer units spanning their combined width (120cm), and its block editor shows "Ancho del módulo (cm): 120 — derivado...".
5. Add an "Hueco abierto" block to the new elevated module — confirm it renders as an open niche on top, matching the reference photo's shape.
6. Try "Eliminar módulo" on one of the two covered drawer units — confirm it's rejected with the toast message and the module is NOT removed.
7. Click "Elevar sobre estos módulos" again with the same Desde/Hasta range — confirm it's rejected with the "ya está cubierto" toast and no second elevated module is created.
8. Change one drawer unit's width (e.g. 60 → 80cm) — confirm the elevated niche's width/position updates on the next render to match.
9. Remove the elevated module first, then confirm the drawer unit can now be deleted normally.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add components/closet/ClosetElevatedModuleEditor.tsx components/closet/ClosetBuilder.tsx components/closet/ClosetModuleStackEditor.tsx
git commit -m "feat(closet): add UI to create and edit elevated modules"
```
