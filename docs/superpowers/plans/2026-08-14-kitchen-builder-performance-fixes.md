# Kitchen Builder Performance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four confirmed performance bottlenecks in the kitchen builder's drag/render path (per-module re-render during drag, unmemoized quote engine, unmemoized scene + unstable callback props, undebounced localStorage writes) without changing any visible behavior.

**Architecture:** Four independent, structural fixes, each closing a missing memoization boundary the 2026-08-14 performance audit identified — no new abstractions, no behavior changes, no artificial throttling of anything that isn't already redundant work.

**Tech Stack:** Next.js 16 (App Router), Zustand 5, react-three-fiber, TypeScript. No frontend test runner exists in this repo — verification is `npx tsc --noEmit` (run from `frontend/`) plus a manual smoke check in the running dev server, matching this project's established precedent.

## Global Constraints

- Root-cause structural fixes only. Never add delays, hide errors, reduce functionality, artificially cap the scene, or throttle something without first proving why it needs to run less often. (Source: user's explicit constraint in the approved design.)
- Do not touch anything the audit found already correct: `computeCountertopRunSpans`'s existing `useMemo`, the wood-texture cache, the `THREE.EdgesGeometry` memoization, `findOverlap`/`slideToClosestFree` already being drop-only, or the per-tick `snapToNeighbor`/`snapAlignAcrossBands` math.
- Fix 3's selector/memoization scope is limited to `KitchenBuilder.tsx` and `KitchenAssemblyScene.tsx` only. Do not add Zustand selectors to any of the other ~8 components the audit flagged (`KitchenSummary.tsx`'s own selector scope, `ModuleInspector.tsx`, `ModuleCard.tsx`, `ModuleEditor.tsx`, `GlobalMaterialsModal.tsx`, `GlobalHeightsModal.tsx`, `KitchenProjectForm.tsx`, `RoomOpeningsEditor.tsx`, `ModuleSelector.tsx`) — out of scope for this plan.
- Do not touch the dimension-label overlay's per-frame cost, undo/redo, or camera persistence — separate roadmap items, out of scope here.
- Fix 1's `React.memo` comparator is a custom function, not the default shallow-equal. It compares only: `mod` (reference equality), whether this module is the live drag target (and if so the drag preview's own x/z/rotation/mountHeightCm), `wireframe`, `showLabels`, `showDimensions`, `isHovered`, `isSelected`, `draggable`, and the move-armed slice (`moveMode?.id === mod.id`, and if so `moveMode.fixed`). It deliberately does NOT compare `effective`, `drag`, `onSelect`, or any callback prop by reference.
- Fix 4's debounce delay is 500ms, implemented as a custom Zustand `PersistStorage`, not a scattered `setTimeout` at call sites.
- All 4 tasks are independent of each other (different fixes, no shared interfaces) and can be implemented and reviewed in any order, but touch two files (`KitchenAssemblyScene.tsx` in Tasks 1 and 3) — do them sequentially, never in parallel, to avoid merge conflicts.

---

### Task 1: Per-module mesh memoization in the 3D scene

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx`

**Interfaces:**
- Consumes: `ModuleMesh`, `ModuleLabel`, `ModuleDimensionsLabel`, `ModuleHighlight`, `ModuleFabCluster` (all already defined in this file, lines 1202–1868), `DragHandleProps` (line 505), `DragPreview` (line 453), `isDraggableModule` (line 1118), `applyWallOffset` (line 317), `moduleTopY`, `blindCornerFootprintWidth` — all already defined/imported in this file, unchanged.
- Produces: `ModuleSceneItem` (a `memo`-wrapped component) — used only within this file, by `AssemblyContent`'s render. No other task depends on it.

This is the primary freeze fix: `AssemblyContent`'s `handleMove` calls `setDragPreview` on every `pointermove` during a drag, which re-renders `AssemblyContent` and re-executes `modules.map(...)` — currently building `<ModuleMesh>`/`<ModuleLabel>`/etc. directly inline, so literally every module's full mesh tree re-renders on every pointer tick, not just the one being dragged.

- [ ] **Step 1: Add `memo` to the existing React import**

In `frontend/components/3d/KitchenAssemblyScene.tsx`, line 5 currently reads:

```ts
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from "react";
```

Change it to:

```ts
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from "react";
```

- [ ] **Step 2: Insert the `ModuleSceneItem` component**

Immediately after `ModuleHighlight`'s closing brace (currently line 1868, right before the `// An opening's dimensions converted to meters...` comment for `WallOpeningM`), insert:

```tsx
// ─── Memoized per-module scene node ────────────────────────────────────────
// Wraps one module's full render output (mesh + label + dimensions overlay +
// hover highlight + FAB cluster) behind React.memo with a custom comparator.
// AssemblyContent re-renders up to ~60x/sec while a module is being dragged
// (setDragPreview on every pointermove) — without this boundary, every OTHER
// module's mesh tree (CabinetMesh -> DoorPanel/Shelves/drawers/fillers) was
// re-created and reconciled on every single tick even though it provably
// didn't change. The comparator intentionally does NOT compare `effective`,
// `drag`, or any callback prop by reference — those are freshly built by the
// parent on every render regardless, but they're pure functions of the
// values that ARE compared below (mod, dragPreview, moveMode, etc.), so a
// changed reference there never means the module's actual rendered output
// changed.
interface ModuleSceneItemProps {
  mod: KitchenModule;
  effective: KitchenModule;
  wireframe: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  isHovered: boolean;
  isSelected: boolean;
  draggable: boolean;
  drag: DragHandleProps | undefined;
  onSelect: () => void;
  dragPreview: DragPreview | null;
  moveMode: { id: string; fixed: boolean } | null;
  onModuleActivate?: (id: string | null) => void;
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
  onModuleRemove?: (id: string) => void;
  onSelectModule: (id: string | null) => void;
  setMoveMode: (updater: (cur: { id: string; fixed: boolean } | null) => { id: string; fixed: boolean } | null) => void;
}

function ModuleSceneItemImpl({
  mod, effective, wireframe, showLabels, showDimensions, isHovered, isSelected, draggable, drag, onSelect,
  moveMode, onModuleActivate, onModuleMove, onModuleRemove, onSelectModule, setMoveMode,
}: ModuleSceneItemProps) {
  return (
    <group
      onDoubleClick={(e) => {
        e.stopPropagation();
        onSelect();
        onModuleActivate?.(mod.id);
      }}
    >
      <ModuleMesh mod={effective} wireframe={wireframe} drag={drag} onSelect={onSelect} />
      {showLabels && !isSelected && <ModuleLabel mod={effective} />}
      {showDimensions && <ModuleDimensionsLabel mod={effective} />}
      {isHovered && <ModuleHighlight mod={effective} />}
      {isSelected && onModuleActivate && (
        <ModuleFabCluster
          mod={effective}
          onEdit={() => onModuleActivate(mod.id)}
          moveMode={moveMode?.id === mod.id ? (moveMode.fixed ? "fija" : "libre") : "off"}
          onCycleMove={() => setMoveMode((cur) => {
            if (cur?.id !== mod.id) return { id: mod.id, fixed: false };
            if (!cur.fixed) return { id: mod.id, fixed: true };
            return null;
          })}
          canMove={draggable}
          onRotate={onModuleMove && !mod.options.locked ? () => onModuleMove(mod.id, mod.x, mod.z, ((mod.rotation + 90) % 360) as KitchenModule["rotation"]) : undefined}
          onDelete={onModuleRemove && !mod.options.locked ? () => { onModuleRemove(mod.id); onSelectModule(null); setMoveMode((cur) => (cur?.id === mod.id ? null : cur)); } : undefined}
        />
      )}
    </group>
  );
}

function moduleSceneItemPropsEqual(prev: ModuleSceneItemProps, next: ModuleSceneItemProps): boolean {
  if (prev.mod !== next.mod) return false;
  if (prev.wireframe !== next.wireframe) return false;
  if (prev.showLabels !== next.showLabels) return false;
  if (prev.showDimensions !== next.showDimensions) return false;
  if (prev.isHovered !== next.isHovered) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.draggable !== next.draggable) return false;

  const prevIsDragTarget = prev.dragPreview?.id === prev.mod.id;
  const nextIsDragTarget = next.dragPreview?.id === next.mod.id;
  if (prevIsDragTarget !== nextIsDragTarget) return false;
  if (nextIsDragTarget) {
    const p = prev.dragPreview!;
    const n = next.dragPreview!;
    if (p.x !== n.x || p.z !== n.z || p.rotation !== n.rotation || p.mountHeightCm !== n.mountHeightCm) return false;
  }

  const prevMoveArmed = prev.moveMode?.id === prev.mod.id;
  const nextMoveArmed = next.moveMode?.id === next.mod.id;
  if (prevMoveArmed !== nextMoveArmed) return false;
  if (nextMoveArmed && prev.moveMode!.fixed !== next.moveMode!.fixed) return false;

  return true;
}

const ModuleSceneItem = memo(ModuleSceneItemImpl, moduleSceneItemPropsEqual);
```

- [ ] **Step 3: Replace the inline per-module JSX in `AssemblyContent`'s render with `ModuleSceneItem`**

In the same file, `AssemblyContent`'s `modules.map((mod) => { ... })` block currently ends with (originally around lines 2555–2585):

```tsx
        const selectThis = () => onSelectModule(mod.id);
        return (
          <group
            key={mod.id}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSelectModule(mod.id);
              onModuleActivate?.(mod.id);
            }}
          >
            <ModuleMesh mod={effective} wireframe={wireframe} drag={drag} onSelect={selectThis} />
            {showLabels && !(selectedId === mod.id) && <ModuleLabel mod={effective} />}
            {showDimensions && <ModuleDimensionsLabel mod={effective} />}
            {hoveredId === mod.id && <ModuleHighlight mod={effective} />}
            {selectedId === mod.id && onModuleActivate && (
              <ModuleFabCluster
                mod={effective}
                onEdit={() => onModuleActivate(mod.id)}
                moveMode={moveMode?.id === mod.id ? (moveMode.fixed ? "fija" : "libre") : "off"}
                onCycleMove={() => setMoveMode((cur) => {
                  if (cur?.id !== mod.id) return { id: mod.id, fixed: false };
                  if (!cur.fixed) return { id: mod.id, fixed: true };
                  return null;
                })}
                canMove={draggable}
                onRotate={onModuleMove && !mod.options.locked ? () => onModuleMove(mod.id, mod.x, mod.z, ((mod.rotation + 90) % 360) as KitchenModule["rotation"]) : undefined}
                onDelete={onModuleRemove && !mod.options.locked ? () => { onModuleRemove(mod.id); onSelectModule(null); setMoveMode((cur) => (cur?.id === mod.id ? null : cur)); } : undefined}
              />
            )}
          </group>
        );
      })}
```

Replace that whole block (from `const selectThis = ...` through the closing `})}`) with:

```tsx
        const selectThis = () => onSelectModule(mod.id);
        return (
          <ModuleSceneItem
            key={mod.id}
            mod={mod}
            effective={effective}
            wireframe={wireframe}
            showLabels={showLabels}
            showDimensions={showDimensions}
            isHovered={hoveredId === mod.id}
            isSelected={selectedId === mod.id}
            draggable={draggable}
            drag={drag}
            onSelect={selectThis}
            dragPreview={dragPreview}
            moveMode={moveMode}
            onModuleActivate={onModuleActivate}
            onModuleMove={onModuleMove}
            onModuleRemove={onModuleRemove}
            onSelectModule={onSelectModule}
            setMoveMode={setMoveMode}
          />
        );
      })}
```

Everything above `const selectThis = ...` in that same map callback (the `visible`/`draggable`/`drag`/`effective`/`dimLabelData.push(...)` computation) stays exactly as-is — it still needs to run for every module on every render (`dimLabelData` needs every module's current position for its collision-avoidance overlay, and `applyWallOffset` is already cheap and reference-stable for the common case). Only the returned JSX changes.

- [ ] **Step 4: Type-check**

Run (from `frontend/`):

```bash
npx tsc --noEmit
```

Expected: no new errors. (Pre-existing unrelated errors, if any, are not this task's concern — confirm by checking they're identical to a `tsc --noEmit` run on the pre-Task-1 commit if any appear.)

- [ ] **Step 5: Manual smoke check**

With the dev server running (`npm run dev` in `frontend/`, or the already-running instance on this project), open a kitchen project with a realistic module count (15+):
1. Drag a module across the room. It should move smoothly with no visible stutter.
2. While dragging, confirm every other module stays visually still (no flicker/jump) and correctly positioned.
3. Release the drag — confirm the module lands in the right spot and the countertop/labels update correctly.
4. Hover a different (non-dragged) module — confirm the yellow highlight still appears/disappears correctly.
5. Click to select a module — confirm the FAB cluster (move/rotate/lock/delete buttons) appears and each button still works.
6. Toggle "Mostrar etiquetas" and "Mostrar medidas" — confirm labels and dimension overlays still render for all modules.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/3d/KitchenAssemblyScene.tsx
git commit -m "perf: memoize per-module scene rendering to stop full re-render during drag"
```

---

### Task 2: Memoize the quote engine's call site

**Files:**
- Modify: `frontend/components/kitchen/KitchenSummary.tsx`

**Interfaces:**
- Consumes: `useKitchenStore`'s `draft` and `getMaterials()` (`getMaterials: () => calculateKitchenMaterials(get().draft.modules)`, unchanged this task — Task 4 in this plan does not touch it).
- Produces: nothing consumed by other tasks.

`getMaterials()` runs a real multi-pass 2D bin-packing optimization over every panel of every module. It's currently called directly in `KitchenSummary.tsx`'s render body with no memoization, so any of that component's own local UI state changes (accordion expand/collapse, hover, PDF export) re-run the full optimization from scratch.

- [ ] **Step 1: Add `useMemo` to the React import**

In `frontend/components/kitchen/KitchenSummary.tsx`, line 3 currently reads:

```ts
import { Fragment, useEffect, useRef, useState } from "react";
```

Change it to:

```ts
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Memoize the `getMaterials()` call**

Lines 27–28 currently read:

```ts
  const { draft, getMaterials } = useKitchenStore();
  const { lines, summary } = getMaterials();
```

Change the second line to:

```ts
  const { draft, getMaterials } = useKitchenStore();
  const { lines, summary } = useMemo(() => getMaterials(), [draft.modules]);
```

`draft.modules` is the same reference-stable array the rest of the codebase already relies on (Zustand's `modules.map(m => m.id === id ? {...} : m)` update pattern keeps the array reference itself changing only when a module actually changes), so this recomputes only when a module is actually added/edited/removed/moved — not on `KitchenSummary`'s own local UI state changes.

- [ ] **Step 3: Type-check**

Run (from `frontend/`):

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual smoke check**

Open a kitchen project's "Resumen" tab:
1. Confirm the materials list and totals render correctly (same as before this change).
2. Expand/collapse a few accordion rows — confirm no visible lag and the numbers stay correct.
3. Go back to the 3D tab, add or move a module, return to "Resumen" — confirm the totals reflect the change (proves the memo isn't stale).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/kitchen/KitchenSummary.tsx
git commit -m "perf: memoize quote engine call in KitchenSummary so UI-only state changes don't recompute it"
```

---

### Task 3: Memoize the scene component and stabilize its callback props

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx`

**Interfaces:**
- Consumes: `memo` from `"react"` (already imported into `KitchenAssemblyScene.tsx` by Task 1 — do not re-add the import). `updateModulePosition`, `nudgeModule`, `setEditingModule`, `updateOpening` from `useKitchenStore()` (exact signatures below).
- Produces: nothing consumed by other tasks.

Even with Task 1's fix, any `KitchenBuilder` re-render (e.g. typing in a text field) still recreates fresh callback closures every time, which would defeat a shallow-equal `React.memo` on `KitchenAssemblyScene`. This task removes the unnecessary closures and adds the memo boundary.

- [ ] **Step 1: Wrap `KitchenAssemblyScene` in `React.memo`**

In `frontend/components/3d/KitchenAssemblyScene.tsx`, the component is declared (currently line 2624) as:

```tsx
export function KitchenAssemblyScene({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onModuleToggleLock, onOpeningMove, onUndo, undoCount = 0, readOnly = false,
}: KitchenAssemblySceneProps) {
```

Remove `export` and rename the function to `KitchenAssemblySceneImpl`:

```tsx
function KitchenAssemblySceneImpl({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onModuleToggleLock, onOpeningMove, onUndo, undoCount = 0, readOnly = false,
}: KitchenAssemblySceneProps) {
```

The function's body is unchanged. Its closing brace is the very last line of the file (currently line 2922, a bare `}`). Immediately after that closing brace, add:

```tsx

export const KitchenAssemblyScene = memo(KitchenAssemblySceneImpl);
```

Default shallow comparison is sufficient here — `KitchenAssemblySceneProps`'s fields are either primitives (`roomWidth`, `roomDepth`, `ceilingHeight`, `undoCount`, `readOnly`), reference-stable arrays (`modules`, `openings`), or callbacks (stabilized in Step 2 below), so no custom comparator is needed.

- [ ] **Step 2: Pass store actions directly instead of wrapping them in `KitchenBuilder.tsx`**

In `frontend/components/kitchen/KitchenBuilder.tsx`, lines 376–390 currently read:

```tsx
            <KitchenAssemblyScene
              modules={draft.modules}
              roomWidth={draft.roomWidth}
              roomDepth={draft.roomDepth}
              ceilingHeight={draft.ceilingHeight}
              openings={draft.openings}
              onModuleMove={(id, x, z, rotation, mountHeightCm, islandMode) => updateModulePosition(id, x, z, rotation, mountHeightCm, islandMode)}
              onModuleActivate={(id) => setEditingModule(id)}
              onModuleNudge={(id, dx, dz, dMountHeight) => nudgeModule(id, dx, dz, dMountHeight)}
              onModuleRemove={removeModule}
              onModuleToggleLock={toggleModuleLock}
              onOpeningMove={(id, offset) => updateOpening(id, { offset })}
              onUndo={undoLastMove}
              undoCount={moveHistory.length}
            />
```

`updateModulePosition`, `setEditingModule`, and `nudgeModule` already have signatures identical to the wrapper arrows around them (`updateModulePosition: (id, x, z, rotation?, mountHeightCm?, islandMode?) => void`, `setEditingModule: (id: string | null) => void`, `nudgeModule: (id, dx, dz, dMountHeight) => void` — all defined in `frontend/store/useKitchenStore.ts`), so the wrapping is a pure no-op that only exists to allocate a new function reference on every render. `onOpeningMove` is different: it transforms `(id, offset)` into `(id, { offset })`, so it genuinely needs to stay a wrapper — stabilized with `useCallback` instead.

Change the block to:

```tsx
            <KitchenAssemblyScene
              modules={draft.modules}
              roomWidth={draft.roomWidth}
              roomDepth={draft.roomDepth}
              ceilingHeight={draft.ceilingHeight}
              openings={draft.openings}
              onModuleMove={updateModulePosition}
              onModuleActivate={setEditingModule}
              onModuleNudge={nudgeModule}
              onModuleRemove={removeModule}
              onModuleToggleLock={toggleModuleLock}
              onOpeningMove={handleOpeningMove}
              onUndo={undoLastMove}
              undoCount={moveHistory.length}
            />
```

- [ ] **Step 3: Add the `useCallback`-wrapped `handleOpeningMove`**

Still in `frontend/components/kitchen/KitchenBuilder.tsx`, line 3 currently reads:

```ts
import { useEffect, useRef, useState } from "react";
```

Change it to:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

Then, in the component body, right after the `useKitchenStore()` destructure (currently lines 44–47):

```tsx
  const {
    draft, projectId, activeTab, showSelector, setActiveTab, resetDraft, loadSampleKitchen, loadProject, updateModulePosition, nudgeModule,
    openSelector, setEditingModule, moveHistory, undoLastMove, updateOpening, removeModule, toggleModuleLock,
  } = useKitchenStore();
```

add:

```tsx
  const handleOpeningMove = useCallback((id: string, offset: number) => updateOpening(id, { offset }), [updateOpening]);
```

- [ ] **Step 4: Type-check**

Run (from `frontend/`):

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Manual smoke check**

1. Open the builder, confirm the 3D scene still renders and all existing interactions from Task 1's smoke check still work (drag, hover, select, FAB cluster).
2. Move a window/door opening along a wall (drag its marker) — confirm it still moves and persists correctly (exercises `onOpeningMove`/`handleOpeningMove`).
3. Type in the project name / client fields (in the header or a modal) — confirm the 3D scene does not visibly re-render/flicker while typing (this is the actual regression Task 3 fixes).
4. Rotate and delete a module via the FAB cluster — confirm both still work (exercises the direct `onModuleMove`/`removeModule` passthrough).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/3d/KitchenAssemblyScene.tsx frontend/components/kitchen/KitchenBuilder.tsx
git commit -m "perf: memoize KitchenAssemblyScene and stabilize its callback props"
```

---

### Task 4: Debounce localStorage persistence

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `KitchenDraft` (already imported in this file). `PersistStorage`, `StorageValue` types from `"zustand/middleware"`.
- Produces: nothing consumed by other tasks.

Zustand's `persist` middleware currently writes the entire draft to `localStorage` via `JSON.stringify` on every single `set()` call, including one per keystroke in text fields (client name, notes, etc. in `KitchenProjectForm.tsx`, via `updateProject(...)`). This task replaces the default storage with a custom one that debounces the actual write by 500ms, coalescing bursts into a single write shortly after the user stops. In-memory state (what the UI reads and reacts to) is untouched and updates instantly — only the disk write is delayed.

- [ ] **Step 1: Import the storage types**

In `frontend/store/useKitchenStore.ts`, line 4 currently reads:

```ts
import { persist } from "zustand/middleware";
```

Change it to:

```ts
import { persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";
```

- [ ] **Step 2: Add the debounced storage factory**

Add this near the top of the file, after the existing imports (after the `import type { ... } from "@/types/kitchen";` block, before the `GLOBAL_MATERIAL_FIELDS` constant):

```ts
type PersistedKitchenState = { draft: KitchenDraft; projectId: number | null };

const PERSIST_DEBOUNCE_MS = 500;

// Zustand's persist middleware writes on every single set() by default —
// for this store that means the whole draft (every module's dimensions and
// options) is JSON.stringify'd and written to localStorage on every
// keystroke in a text field. This defers the actual write until the caller
// has been quiet for PERSIST_DEBOUNCE_MS, coalescing a burst of edits into
// one write. In-memory state is untouched — only the disk write is delayed.
function createDebouncedLocalStorage(delayMs: number): PersistStorage<PersistedKitchenState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<PersistedKitchenState>) : null;
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
```

- [ ] **Step 3: Wire it into the `persist` options**

The `persist(...)` options object currently reads (lines 583–589):

```ts
    {
      // Bumped from "kitchen-draft-v2": added the `openings` array (windows &
      // doors) to the draft shape, so old localStorage drafts are intentionally
      // orphaned instead of migrated (see v1→v2 bump above for precedent).
      name: "kitchen-draft-v3",
      partialize: (state) => ({ draft: state.draft, projectId: state.projectId }),
    }
```

Add a `storage` field:

```ts
    {
      // Bumped from "kitchen-draft-v2": added the `openings` array (windows &
      // doors) to the draft shape, so old localStorage drafts are intentionally
      // orphaned instead of migrated (see v1→v2 bump above for precedent).
      name: "kitchen-draft-v3",
      partialize: (state) => ({ draft: state.draft, projectId: state.projectId }),
      storage: createDebouncedLocalStorage(PERSIST_DEBOUNCE_MS),
    }
```

- [ ] **Step 4: Type-check**

Run (from `frontend/`):

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Manual smoke check**

1. Open a kitchen project, type continuously in the client-name field for a couple seconds, then stop. Open the browser's DevTools → Application → Local Storage, and confirm the `kitchen-draft-v3` entry updates shortly (~500ms) after you stop typing, not on every keystroke.
2. Refresh the page — confirm the typed value is still there (proves the debounced write did land).
3. Move a module in the 3D scene, refresh — confirm the new position persisted too.
4. Start a fresh browser profile or clear the key and reload the builder from scratch — confirm it still loads a valid empty/sample draft (proves `getItem` still works with no existing key).

- [ ] **Step 6: Commit**

```bash
git add frontend/store/useKitchenStore.ts
git commit -m "perf: debounce localStorage persistence writes"
```
