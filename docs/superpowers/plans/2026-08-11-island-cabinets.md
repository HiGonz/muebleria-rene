# Island Cabinets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let existing lower/tower/corner cabinets be dragged away from every wall and function as real freestanding island pieces — free rotation, a configurable open/closed back face, and edge-to-edge joining — replacing the `isla_central` placeholder.

**Architecture:** A single derived-and-persisted boolean (`options.islandMode`) computed from drag position with hysteresis, following the exact pattern the codebase already uses for `nearestWallRotation` (compute live during drag, persist the result, never recompute at render time). Everything downstream — inspector field visibility, back-face rendering, countertop back overhang — reads that one stored flag. No new subsystem for joining (existing `snapToNeighbor`) or countertop-run costing (existing `addCountertop` grouping) — both already work by position/geometry alone, not wall-relative assumptions.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + react-three-fiber/three.js + Zustand, in `frontend/`. No frontend unit-test runner exists in this repo (only Playwright e2e, `frontend/e2e/`); the established precedent for frontend-only plans in this codebase (see `docs/superpowers/plans/2026-07-30-kitchen-client-sharing.md`) is `npx tsc --noEmit` as the automated gate per task, plus an explicit manual dev-server verification step where the change is visual/interactive. This plan follows that same pattern.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-island-cabinets-design.md` — read it before starting; this plan implements it section by section.
- Island-mode thresholds: enter at >0.85m from every wall, release at <0.55m (hysteresis).
- Eligible categories for island mode: `lower`, `tower`, `corner` only — not `upper`, `appliance`, `countertop`, `accessory`.
- New `ModuleOptions` fields (`islandMode`, `backDoors`, `backShelves`) are all optional (`?:`) — no backend migration, no change to `DEFAULT_OPTIONS`.
- `cubierta`, `barra_desayunadora`, `peninsula`, `cubierta_tarja`, `cubierta_parrilla` (the other `countertop`-category types) are untouched by this plan — only `isla_central` is removed.
- All commands below run from `frontend/` unless stated otherwise.

---

## File Structure

- `frontend/types/kitchen.ts` — data model: `BackPanelMode` gains `"puertas"`/`"alacena"`; `ModuleOptions` gains `islandMode?`, `backDoors?`, `backShelves?`; `CountertopModuleType` drops `"isla_central"`.
- `frontend/components/3d/KitchenAssemblyScene.tsx` — `isFreestandingPosition` helper + wiring into the two drag call sites; `onModuleMove` prop signature grows an `islandMode?` param; `isla_central` removed from two `isIsland`-style checks.
- `frontend/store/useKitchenStore.ts` — `updateModulePosition` grows an `islandMode?` param, merged into the module's options same as `mountHeightCm` is today.
- `frontend/components/kitchen/KitchenBuilder.tsx` — one-line passthrough update for the new `onModuleMove` param.
- `frontend/components/3d/ModulePreview3D.tsx` — `getBackDoors` helper (mirrors `getEffectiveDoors`' auto-layout math, keyed off `backDoors`); `CabinetMesh` back-face rendering split out of the existing flat-panel block; `isla_central` removed from `CountertopPreviewMesh`'s `isIsland` check.
- `frontend/services/kitchenData.ts` — `resolveBackDoors` helper (mirrors its own `resolveDoors`, this file's separate BOM-focused copy — see Task 5); back-panel cut-list branch stops silently costing a phantom interior board for `"puertas"`/`"alacena"`; back-door exterior-board pieces + hinge hardware and back-shelf interior-board pieces added alongside the existing front ones; `isla_central` catalog entry removed; `buildSampleKitchenIsla` swaps its `isla_central` placeholder for two real lower cabinets in island mode.
- `frontend/components/kitchen/ModuleInspector.tsx` — `BACK_PANEL_OPTIONS` gains two entries; the back-panel `Section`'s gate widens from two hardcoded types to `islandMode`; new count inputs for `backDoors`/`backShelves`.
- `frontend/public/module-thumbnails/isla_central.png` — deleted.

---

### Task 1: Data model — `BackPanelMode`, `ModuleOptions`, catalog type union

**Files:**
- Modify: `frontend/types/kitchen.ts:89` (remove `isla_central` from `CountertopModuleType`), `:189` (`BackPanelMode`), `:253-412` (`ModuleOptions` — add three fields)

**Interfaces:**
- Produces: `BackPanelMode = "interior" | "exterior" | "lambrin" | "espejo" | "puertas" | "alacena"`; `ModuleOptions.islandMode?: boolean`; `ModuleOptions.backDoors?: number`; `ModuleOptions.backShelves?: number`.

- [ ] **Step 1: Extend `BackPanelMode`**

In `frontend/types/kitchen.ts`, find:

```ts
export type BackPanelMode = "interior" | "exterior" | "lambrin" | "espejo";
```

Replace with:

```ts
export type BackPanelMode = "interior" | "exterior" | "lambrin" | "espejo" | "puertas" | "alacena";
```

- [ ] **Step 2: Add the three new `ModuleOptions` fields**

In the same file, find the end of the `ModuleOptions` interface:

```ts
  // Zócalo accessory only — MDF cut to size, or aluminum strip (3m stock pieces).
  zocaloMaterial?: ZocaloMaterial;
}
```

Replace with:

```ts
  // Zócalo accessory only — MDF cut to size, or aluminum strip (3m stock pieces).
  zocaloMaterial?: ZocaloMaterial;
  // Freestanding "island" cabinet — computed automatically from drag position
  // (see isFreestandingPosition in KitchenAssemblyScene.tsx) with hysteresis
  // so it doesn't flicker right at the boundary, then persisted here the same
  // way `rotation` itself is: computed live during drag, written once at
  // drop, never recomputed at render time. Only lower/tower/corner cabinets
  // are eligible. Gates: skipping nearestWallRotation, showing the back-face
  // fields in the inspector, and the back-face rendering below.
  islandMode?: boolean;
  // Island cabinets only — count of doors on the BACK face (the side facing
  // the room, not a wall), independent of the front `doors` count. Only
  // meaningful when backPanelMaterial is "puertas". Simple count + the
  // module's own doorStyle/exteriorMaterial/hardwareFinish — no per-door
  // hinge/glass/accessory customization on the back (see design spec).
  backDoors?: number;
  // Island cabinets only — count of open shelves reachable from the BACK
  // face when backPanelMaterial is "alacena" (the back panel is simply
  // omitted in that mode, exposing the module's own shared shelf cavity —
  // see CabinetMesh). Only meaningful when backPanelMaterial is "alacena".
  backShelves?: number;
}
```

- [ ] **Step 3: Remove `isla_central` from `CountertopModuleType`**

Find:

```ts
export type CountertopModuleType =
  | "cubierta"
  | "barra_desayunadora"
  | "isla_central"
  | "peninsula"
  | "cubierta_tarja"
  | "cubierta_parrilla";
```

Replace with:

```ts
export type CountertopModuleType =
  | "cubierta"
  | "barra_desayunadora"
  | "peninsula"
  | "cubierta_tarja"
  | "cubierta_parrilla";
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: FAILS — `services/kitchenData.ts` and `components/3d/*.tsx` still reference `"isla_central"` as a `KitchenModuleType`, which no longer exists. This is expected; those references are removed in Task 6. Confirm the errors are only `isla_central`-related (no unrelated breakage from the `ModuleOptions`/`BackPanelMode` additions, which are purely additive).

- [ ] **Step 5: Commit**

```bash
git add types/kitchen.ts
git commit -m "$(cat <<'EOF'
Add island-mode and back-face fields to the kitchen module data model

Extends BackPanelMode with "puertas"/"alacena" and adds islandMode/
backDoors/backShelves to ModuleOptions. isla_central is also dropped from
CountertopModuleType here; its remaining references are cleaned up in a
later task, so tsc is expected to fail until then.
EOF
)"
```

---

### Task 2: Island-position detection + rotation gating + persistence

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx:1137-1152` (add helper after `nearestWallRotation`), `:2143`, `:2375-2376`, `:2410`, `:2422`, `:2425`, `:2534` (wiring)
- Modify: `frontend/store/useKitchenStore.ts:101`, `:238-261` (`updateModulePosition`)
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx:382` (passthrough)

**Interfaces:**
- Consumes: `ModuleOptions.islandMode?: boolean` (Task 1).
- Produces: `isFreestandingPosition(x: number, z: number, roomWidthM: number, roomDepthM: number, wasIsland: boolean): boolean`, exported from `KitchenAssemblyScene.tsx`. `onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void`. `updateModulePosition(id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean): void`.

- [ ] **Step 1: Add `isFreestandingPosition` and the eligible-categories set**

In `frontend/components/3d/KitchenAssemblyScene.tsx`, immediately after the closing brace of `nearestWallRotation` (after line 1152), insert:

```ts
// A floor cabinet counts as a freestanding "island" once it's clearly away
// from every wall — hysteresis (enter/release pair, same shape as
// WALL_ROTATION_STICKY_MARGIN_M and the height-snap margins above) so the
// state doesn't flicker right at the boundary. Only lower/tower/corner
// cabinets are eligible; upper/appliance/countertop/accessory modules are
// never islands regardless of position.
const ISLAND_ENTER_DISTANCE_M = 0.85;
const ISLAND_RELEASE_DISTANCE_M = 0.55;
const ISLAND_ELIGIBLE_CATEGORIES = new Set<KitchenModule["category"]>(["lower", "tower", "corner"]);

export function isFreestandingPosition(
  x: number, z: number, roomWidthM: number, roomDepthM: number, wasIsland: boolean,
): boolean {
  const distanceToNearestWall = Math.min(x, roomWidthM - x, z, roomDepthM - z);
  return wasIsland
    ? distanceToNearestWall >= ISLAND_RELEASE_DISTANCE_M
    : distanceToNearestWall > ISLAND_ENTER_DISTANCE_M;
}
```

- [ ] **Step 2: Wire into `handleMove` (live rotation gate during drag)**

Find (inside `handleDragStart`'s `handleMove`):

```ts
      const rotation = moveMode.fixed ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
      liveRotation = rotation;
      if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
```

Replace with:

```ts
      const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
      const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, mod.options.islandMode ?? false);
      const rotation = moveMode.fixed || islandMode ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
      liveRotation = rotation;
      if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
```

- [ ] **Step 3: Wire into `handleUp` (commit + persist)**

Find (inside `handleDragStart`'s `handleUp`):

```ts
          const rotation = moveMode.fixed ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
          // Re-flushes against whichever wall `rotation` ended up facing —
          // matters when the drag crossed a corner and switched walls.
          if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
          ({ x, z } = snapAlignAcrossBands(mod, x, z, rotation, modules));
          const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
          const blocker = findOverlap(mod, x, z, rotation, modules);
          if (blocker) {
            // Doesn't snap all the way back to where the drag started —
            // slides as far toward the drop point as it can and stops right
            // at the obstacle, see slideToClosestFree.
            const landed = slideToClosestFree(mod, state.startX, state.startZ, x, z, rotation, modules);
            onModuleMove?.(state.id, landed.x * 100, landed.z * 100, rotation, mountHeightCm);
            toast(`Se detuvo junto a "${blocker.label}"`, { description: "No se pudo mover más sin empalmarse.", duration: 1800 });
          } else {
            onModuleMove?.(state.id, x * 100, z * 100, rotation, mountHeightCm);
          }
```

Replace with:

```ts
          const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
          const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, mod.options.islandMode ?? false);
          const rotation = moveMode.fixed || islandMode ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
          // Re-flushes against whichever wall `rotation` ended up facing —
          // matters when the drag crossed a corner and switched walls.
          if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
          ({ x, z } = snapAlignAcrossBands(mod, x, z, rotation, modules));
          const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
          const blocker = findOverlap(mod, x, z, rotation, modules);
          if (blocker) {
            // Doesn't snap all the way back to where the drag started —
            // slides as far toward the drop point as it can and stops right
            // at the obstacle, see slideToClosestFree.
            const landed = slideToClosestFree(mod, state.startX, state.startZ, x, z, rotation, modules);
            onModuleMove?.(state.id, landed.x * 100, landed.z * 100, rotation, mountHeightCm, islandMode);
            toast(`Se detuvo junto a "${blocker.label}"`, { description: "No se pudo mover más sin empalmarse.", duration: 1800 });
          } else {
            onModuleMove?.(state.id, x * 100, z * 100, rotation, mountHeightCm, islandMode);
          }
```

- [ ] **Step 4: Extend the `onModuleMove` prop type (both declarations)**

There are two identical declarations — the inner scene component and the outer wrapper. In `frontend/components/3d/KitchenAssemblyScene.tsx`, find (appears at both line 2143 and line 2534):

```ts
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number) => void;
```

Replace **both occurrences** with:

```ts
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
```

- [ ] **Step 5: Extend `updateModulePosition` in the store**

In `frontend/store/useKitchenStore.ts`, find:

```ts
  updateModulePosition: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number) => void;
```

Replace with:

```ts
  updateModulePosition: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
```

Then find the implementation:

```ts
      updateModulePosition: (id, x, z, rotation, mountHeightCm) =>
        set((s) => {
          const current = s.draft.modules.find((m) => m.id === id);
          if (current?.options.locked) return {};
          // Record where it was dragged FROM (not to) — undo restores this.
          // Only the most recent few are kept; older entries just fall off.
          const history = current && (current.x !== x || current.z !== z)
            ? [...s.moveHistory, { moduleId: id, x: current.x, z: current.z, rotation: current.rotation }].slice(-MOVE_HISTORY_LIMIT)
            : s.moveHistory;
          return {
            moveHistory: history,
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) =>
                m.id === id
                  ? {
                      ...m, x, z, rotation: rotation ?? m.rotation,
                      options: mountHeightCm !== undefined ? { ...m.options, mountHeight: mountHeightCm } : m.options,
                    }
                  : m
              ),
            },
          };
        }),
```

Replace with:

```ts
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
```

- [ ] **Step 6: Update the `KitchenBuilder.tsx` passthrough**

In `frontend/components/kitchen/KitchenBuilder.tsx`, find:

```tsx
              onModuleMove={(id, x, z, rotation, mountHeightCm) => updateModulePosition(id, x, z, rotation, mountHeightCm)}
```

Replace with:

```tsx
              onModuleMove={(id, x, z, rotation, mountHeightCm, islandMode) => updateModulePosition(id, x, z, rotation, mountHeightCm, islandMode)}
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: same `isla_central`-only failures as Task 1 (still not yet cleaned up — that's Task 6). No new errors from this task's changes.

- [ ] **Step 8: Manual verification**

Run: `cd frontend && npx next dev -p 3123` (leave running)

In the browser: open the kitchen builder, load or start a kitchen with room ≥ 4m × 4m, add a `Gabinete bajo con puertas` (or any lower cabinet) from the catalog — it drops at room center. Arm "Mover" and drag it slowly from a spot near a wall toward the room's center.

Expected: while near a wall, it keeps auto-rotating to face away from the nearest wall (unchanged existing behavior). Once dragged more than ~0.85m from every wall, it stops rotating and holds whatever rotation it had at that moment, even as you keep dragging it further into the open floor. Drag it back toward a wall — it resumes auto-facing once within ~0.55m of a wall. Use the rotate button (bent-arrow icon) while it's out in the open — it should still rotate freely on click (this doesn't go through the drag path, so island mode doesn't block it).

- [ ] **Step 9: Commit**

```bash
git add components/3d/KitchenAssemblyScene.tsx store/useKitchenStore.ts components/kitchen/KitchenBuilder.tsx
git commit -m "$(cat <<'EOF'
Detect and persist island mode from drag position

Floor cabinets dragged more than 0.85m from every wall stop auto-rotating
toward the nearest wall (hysteresis release at 0.55m) and get
options.islandMode persisted at drop, following the same
compute-live/persist-once pattern nearestWallRotation itself already uses.
EOF
)"
```

---

### Task 3: Back-face rendering (doors / open shelves) in `CabinetMesh`

**Files:**
- Modify: `frontend/components/3d/ModulePreview3D.tsx:98-134` (add `getBackDoors` near `getEffectiveDoors`), `:1913-1921` (split the back-panel block), `:1962-1978` (add back-face JSX)

**Interfaces:**
- Consumes: `ModuleOptions.backDoors?`, `ModuleOptions.backShelves?`, `BackPanelMode` (Task 1); `DoorPanel`, `Shelves`, `DoorDef` (all pre-existing in this file).
- Produces: `getBackDoors(mod: KitchenModule): DoorDef[]`, exported alongside `getEffectiveDoors`.

- [ ] **Step 1: Add `getBackDoors`**

In `frontend/components/3d/ModulePreview3D.tsx`, immediately after the closing brace of `getEffectiveDoors` (after line 134), insert:

```ts
// Back face (island cabinets only) — mirrors getEffectiveDoors' auto-layout
// math, keyed off backDoors instead of doors. No detailed per-door layout
// support for the back face (no useDetailedLayout equivalent) — see design
// spec: back-face customization is deliberately simpler than the front.
export function getBackDoors(mod: KitchenModule): DoorDef[] {
  const count = mod.options.backDoors || 0;
  if (!count) return [];
  const isUpper = mod.category === "upper" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas";
  const toeKick = !isUpper && mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const topMargin = isUpper ? 0 : TOP_FACE_MARGIN_CM;
  const usableH = Math.max(mod.dimensions.height - toeKick - ctThick - topMargin, 0);
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-back-dr${i}`,
    label: `Puerta trasera ${i + 1}`,
    widthPct: doorW,
    offsetPct: i * doorW,
    fromBottomCm: 0,
    heightCm: usableH,
    hingeLeft: i % 2 === 0,
    doorStyle: mod.options.doorStyle,
  }));
}
```

- [ ] **Step 2: Split the flat back-panel block so "puertas"/"alacena" skip it**

In `CabinetMesh`, find:

```ts
  const backMode = module.options.backPanelMaterial ?? "interior";
  const hasCustomBack = module.type !== "bajo_tarja" && backMode !== "interior";
```

Replace with:

```ts
  const backMode = module.options.backPanelMaterial ?? "interior";
  const hasCustomBack = module.type !== "bajo_tarja" && backMode !== "interior";
  // "puertas"/"alacena" render real doors/open shelving instead of a flat
  // finish panel (see the back-face JSX below) — this narrows hasCustomBack
  // down to the cases that still want the flat Box.
  const hasFlatCustomBack = hasCustomBack && backMode !== "puertas" && backMode !== "alacena";
  const backDoors = getBackDoors(module);
```

- [ ] **Step 3: Gate the existing flat-panel JSX on `hasFlatCustomBack`, add the new back-face JSX**

Find:

```tsx
      {hasCustomBack && (
        backMode === "lambrin" ? (
          <LambrinPanel pos={[0, H / 2, -D / 2 + T / 2]} faceW={W - T * 2} faceH={H - T * 2} horizontal outward={-1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        ) : backMode === "espejo" ? (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color="#dfe8ec" metalness={0.9} roughness={0.05} wireframe={wireframe} />
        ) : (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        )
      )}
```

Replace with:

```tsx
      {hasFlatCustomBack && (
        backMode === "lambrin" ? (
          <LambrinPanel pos={[0, H / 2, -D / 2 + T / 2]} faceW={W - T * 2} faceH={H - T * 2} horizontal outward={-1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        ) : backMode === "espejo" ? (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color="#dfe8ec" metalness={0.9} roughness={0.05} wireframe={wireframe} />
        ) : (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        )
      )}
      {/* Back doors — same DoorPanel component the front uses, wrapped in a
          180°-Y-rotated group: DoorPanel always builds itself against local
          +Z ("outward"), so the rotation alone turns that into world -Z
          (away from the room-facing front, out the back) without needing a
          mirrored variant of the component. The 180° flip also naturally
          reverses which world side each hinge lands on, which is exactly
          what a door mounted facing the opposite direction should do. */}
      {backMode === "puertas" && backDoors.length > 0 && (
        <group rotation={[0, Math.PI, 0]}>
          {backDoors.map((d) => (
            <DoorPanel
              key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
              hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
            />
          ))}
        </group>
      )}
      {/* Back "alacena" — the back panel is simply omitted (no Box above),
          exposing the module's own shared shelf cavity from behind. Shelves
          themselves are already rendered once below (module.options.shelves,
          the same board count regardless of which face is open) — this is a
          SEPARATE, independently-countable set for when the back specifically
          wants its own shelf count rather than sharing the front's. If both
          `shelves` and `backShelves` are set on the same module, both render
          in the same cavity — a real design would normally only use one or
          the other, so this is left as a v1 simplification rather than
          reconciling the two into a single divider grid. */}
      {backMode === "alacena" && (module.options.backShelves ?? 0) > 0 && (
        <Shelves W={W} H={H} D={D} count={module.options.backShelves ?? 0} toeKick={toeKick} ctThick={ctThick} color={color} wireframe={wireframe} />
      )}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: same `isla_central`-only failures carried over from Task 1 (unrelated to this task; cleaned up in Task 6). No new errors.

- [ ] **Step 5: Manual verification**

With the dev server running (`cd frontend && npx next dev -p 3123`), add a lower cabinet, drag it to the room's center (island mode engages — see Task 2's verification), open its inspector (gear icon) and — for this step only, temporarily confirm the mesh works before the inspector UI exists (Task 5 adds the picker) — use the browser console on the page to sanity-check by setting `backPanelMaterial: "puertas", backDoors: 2` directly isn't practical without the UI; instead, defer full manual verification of this task to Task 5's manual check, which exercises this same rendering code through the real inspector controls. Skip this step's dev-server check for now and rely on Step 4's type-check plus Task 5's manual verification.

- [ ] **Step 6: Commit**

```bash
git add components/3d/ModulePreview3D.tsx
git commit -m "$(cat <<'EOF'
Render real back-face doors and open shelves for island cabinets

CabinetMesh's back panel now branches on backPanelMaterial "puertas"
(mirrored DoorPanel instances via getBackDoors) or "alacena" (panel simply
omitted, exposing the shared shelf cavity), in addition to the existing
flat-finish options. Not yet reachable from the UI — inspector wiring is
the next task.
EOF
)"
```

---

### Task 4: Back-face costing/BOM — `calculateKitchenMaterials`

This codebase's cost/cut-list engine (`calculateKitchenMaterials` in `kitchenData.ts`) does **not** import `getEffectiveDoors`/`getBackDoors` from `ModulePreview3D.tsx` — it keeps its own parallel `resolveDoors`/`resolveDrawers` pair (see the "mirrors FaceEditor logic" comment above them), because it's a pure service with no dependency on the 3D/UI layer. Without this task, a module with `backDoors`/`backShelves` set would fall through the back-panel cost branch's final `else` and get billed for a plain hidden interior board it doesn't have, while its real back doors/shelves would never appear in the cut list or hardware cost at all — silently wrong quotes for a furniture shop's actual cutting list. This task closes that gap the same way Task 3 closed it for the 3D mesh.

**Files:**
- Modify: `frontend/services/kitchenData.ts:60-85` (add `resolveBackDoors` near `resolveDoors`), `:1741-1747` (back-panel cost branch), `:1770-1778` (front-door cost block — add the back-door equivalent after it), `:1749` (shelves line — add the back-shelves equivalent after it)

**Interfaces:**
- Consumes: `ModuleOptions.backDoors?`, `ModuleOptions.backShelves?`, `BackPanelMode` (Task 1).
- Produces: `resolveBackDoors(mod: KitchenModule): DoorDef[]` (module-private, mirrors `resolveDoors`).

- [ ] **Step 1: Add `resolveBackDoors`**

In `frontend/services/kitchenData.ts`, immediately after the closing brace of `resolveDoors` (after line 85, before `function resolveDrawers`), insert:

```ts
// Island cabinets only — back-face doors for the cost/cut-list engine,
// mirrors resolveDoors' shape but keyed off backDoors. No drawer-zone math
// (the back face never has drawers) and no per-door hinge/pull-out
// overrides — matches getBackDoors in ModulePreview3D.tsx, kept as a
// separate copy for the same reason resolveDoors itself is (this file has
// no dependency on the 3D/UI layer).
function resolveBackDoors(mod: KitchenModule): DoorDef[] {
  const { options: o, dimensions: d } = mod;
  const count = o.backDoors || 0;
  if (!count) return [];
  const toeKick = o.hasToeKick ? o.toeKickHeight : 0;
  const ctThick = o.includesCountertop ? o.countertopThickness : 0;
  const usableH = Math.max(d.height - toeKick - ctThick - TOP_FACE_MARGIN_CM, 0);
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-back-dr${i}`, label: `Puerta trasera ${i + 1}`,
    widthPct: doorW, offsetPct: i * doorW,
    fromBottomCm: 0, heightCm: usableH,
    hingeLeft: i % 2 === 0,
    doorStyle: o.doorStyle,
  }));
}
```

- [ ] **Step 2: Stop the back-panel branch from costing a phantom board for "puertas"/"alacena"**

Find:

```ts
        if (mod.type !== "bajo_tarja") {
          const backMode = o.backPanelMaterial ?? "interior";
          if (backMode === "lambrin") addLambrin(panelWidth / 100, d.height / 100);
          else if (backMode === "espejo") addEspejo(panelWidth / 100, d.height / 100);
          else if (backMode === "exterior") addPiece("Exterior", o.exteriorMaterial, panelWidth, d.height, "Respaldo (acabado)");
          else addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        }
```

Replace with:

```ts
        if (mod.type !== "bajo_tarja") {
          const backMode = o.backPanelMaterial ?? "interior";
          if (backMode === "lambrin") addLambrin(panelWidth / 100, d.height / 100);
          else if (backMode === "espejo") addEspejo(panelWidth / 100, d.height / 100);
          else if (backMode === "exterior") addPiece("Exterior", o.exteriorMaterial, panelWidth, d.height, "Respaldo (acabado)");
          else if (backMode === "interior") addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
          // "puertas"/"alacena" have no flat back panel at all — puertas is
          // costed via resolveBackDoors below (real door pieces + hinges),
          // alacena is simply open (its only cost is the backShelves pieces
          // below, alongside the front shelves line).
        }
```

- [ ] **Step 3: Cost the back doors, alongside the existing front-door block**

Find:

```ts
      const doors = mod.type === "aereo_hueco_inferior" ? [] : resolveDoors(mod);
      for (const door of doors) {
        addPiece("Exterior", o.exteriorMaterial, (door.widthPct / 100) * d.width, door.heightCm, "Puertas");
        if (door.pullOutAccessory) addPullOut(door.pullOutAccessory);
      }
      if (doors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
        addHardware("bisagra", "Bisagras", doors.length, "pares", hingeCost);
      }
```

Replace with:

```ts
      const doors = mod.type === "aereo_hueco_inferior" ? [] : resolveDoors(mod);
      for (const door of doors) {
        addPiece("Exterior", o.exteriorMaterial, (door.widthPct / 100) * d.width, door.heightCm, "Puertas");
        if (door.pullOutAccessory) addPullOut(door.pullOutAccessory);
      }
      if (doors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
        addHardware("bisagra", "Bisagras", doors.length, "pares", hingeCost);
      }
      // Back doors (island cabinets, backPanelMaterial "puertas") — same
      // exterior-board + hinge costing as the front, just keyed off
      // resolveBackDoors/backDoors instead.
      const backDoors = resolveBackDoors(mod);
      for (const door of backDoors) {
        addPiece("Exterior", o.exteriorMaterial, (door.widthPct / 100) * d.width, door.heightCm, "Puertas (traseras)");
      }
      if (backDoors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
        addHardware("bisagra", "Bisagras", backDoors.length, "pares", hingeCost);
      }
```

- [ ] **Step 4: Cost the back shelves, alongside the existing front-shelves line**

Find:

```ts
      for (let i = 0; i < o.shelves; i++) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Repisas");
```

Replace with:

```ts
      for (let i = 0; i < o.shelves; i++) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Repisas");
      for (let i = 0; i < (o.backShelves || 0); i++) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Repisas (traseras)");
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: same `isla_central`-only failures carried over from Task 1 (unrelated to this task; cleaned up in Task 6). No new errors.

- [ ] **Step 6: Manual verification**

With the dev server running, take the same island-mode lower cabinet from Task 3's verification (backPanelMaterial "puertas", backDoors 2 — or set it up fresh once Task 5's inspector fields exist, whichever comes first in your working order) and open the "Resumen"/materials view. Confirm: no "Respaldo" (plain back board) line appears for that module; two extra "Puertas (traseras)" exterior-board cut pieces appear; the hinge hardware count includes the back doors (front doors + back doors combined, or as separate lines — either way, not missing). Switch it to "Alacena abierta" with 2 back shelves — confirm two "Repisas (traseras)" interior-board pieces appear and no back-panel board line appears.

- [ ] **Step 7: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Cost back-face doors and shelves in the materials/cut-list engine

calculateKitchenMaterials had its own separate resolveDoors/resolveDrawers
pair (no dependency on the 3D layer) that knew nothing about
backDoors/backShelves — a back-face module would have silently billed a
phantom interior back board instead of its real back doors/shelves. Adds
resolveBackDoors and wires both new option fields into the existing
cut-list and hinge-hardware costing, mirroring the front's treatment.
EOF
)"
```

---

### Task 5: Inspector UI — back-face fields for island cabinets

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx:33-38` (`BACK_PANEL_OPTIONS`), `:457-475` (the "Panel trasero" `Section`)

**Interfaces:**
- Consumes: `opt.islandMode`, `opt.backPanelMaterial`, `opt.backDoors`, `opt.backShelves`, `opt.barOverhangCm` (Task 1); `Section`, `FieldGroup`, `SelectInput`, `NumInput` (pre-existing in this file).

- [ ] **Step 1: Extend `BACK_PANEL_OPTIONS`**

Find:

```ts
const BACK_PANEL_OPTIONS: { value: NonNullable<ModOptions["backPanelMaterial"]>; label: string }[] = [
  { value: "interior", label: "Interior (oculto contra el muro)" },
  { value: "exterior", label: "Exterior (acabado)" },
  { value: "lambrin", label: "Lambrín" },
  { value: "espejo", label: "Espejo" },
];
```

Replace with:

```ts
const BACK_PANEL_OPTIONS: { value: NonNullable<ModOptions["backPanelMaterial"]>; label: string }[] = [
  { value: "interior", label: "Interior (oculto contra el muro)" },
  { value: "exterior", label: "Exterior (acabado)" },
  { value: "lambrin", label: "Lambrín" },
  { value: "puertas", label: "Puertas" },
  { value: "alacena", label: "Alacena abierta" },
  { value: "espejo", label: "Espejo" },
];
```

- [ ] **Step 2: Widen the "Panel trasero" section's gate and add the new fields**

Find:

```tsx
            {(type === "desayunador" || type === "librero_giratorio_espejo") && (
              <Section label="Panel trasero">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Material">
                    <SelectInput value={opt.backPanelMaterial ?? "interior"} onChange={(v) => updateOpt("backPanelMaterial", v)} options={BACK_PANEL_OPTIONS} />
                  </FieldGroup>
                  {type === "desayunador" && (
                    <FieldGroup label="Vuelo extra de cubierta">
                      <NumInput value={opt.barOverhangCm ?? 30} onChange={(v) => updateOpt("barOverhangCm", v)} min={0} max={60} unit="cm" />
                    </FieldGroup>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-warmgray/70">
                  {type === "desayunador"
                    ? "El respaldo queda expuesto hacia el lado del banquillo (no contra un muro), por eso lleva un acabado en vez de tablero liso. La cubierta vuela este tanto extra sobre ese lado."
                    : "El respaldo lleva un espejo en vez de tablero — visible por el lado opuesto a los estantes."}
                </p>
              </Section>
            )}
```

Replace with:

```tsx
            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode) && (
              <Section label="Panel trasero">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Material">
                    <SelectInput
                      value={opt.backPanelMaterial ?? "interior"}
                      onChange={(v) => updateOpt("backPanelMaterial", v)}
                      options={type === "librero_giratorio_espejo" ? BACK_PANEL_OPTIONS : BACK_PANEL_OPTIONS.filter((o) => o.value !== "espejo")}
                    />
                  </FieldGroup>
                  {(type === "desayunador" || opt.islandMode) && (
                    <FieldGroup label="Vuelo extra de cubierta">
                      <NumInput value={opt.barOverhangCm ?? (type === "desayunador" ? 30 : 0)} onChange={(v) => updateOpt("barOverhangCm", v)} min={0} max={60} unit="cm" />
                    </FieldGroup>
                  )}
                  {opt.backPanelMaterial === "puertas" && (
                    <FieldGroup label="Núm. puertas traseras">
                      <NumInput value={opt.backDoors ?? 0} onChange={(v) => updateOpt("backDoors", v)} min={0} max={6} />
                    </FieldGroup>
                  )}
                  {opt.backPanelMaterial === "alacena" && (
                    <FieldGroup label="Entrepaños traseros">
                      <NumInput value={opt.backShelves ?? 0} onChange={(v) => updateOpt("backShelves", v)} min={0} max={10} />
                    </FieldGroup>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-warmgray/70">
                  {type === "desayunador"
                    ? "El respaldo queda expuesto hacia el lado del banquillo (no contra un muro), por eso lleva un acabado en vez de tablero liso. La cubierta vuela este tanto extra sobre ese lado."
                    : type === "librero_giratorio_espejo"
                    ? "El respaldo lleva un espejo en vez de tablero — visible por el lado opuesto a los estantes."
                    : "Este mueble está en modo isla (lejos de cualquier muro): el respaldo queda expuesto hacia el cuarto. Puedes dejarlo con un acabado plano, ponerle sus propias puertas, o abrirlo tipo alacena."}
                </p>
              </Section>
            )}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: same `isla_central`-only failures carried over (cleaned up next task). No new errors.

- [ ] **Step 4: Manual verification**

With the dev server running, drag a lower cabinet (e.g. "Gabinete bajo con puertas") to the room's open center until it's clearly away from every wall (island mode engages). Open its inspector — a new "Panel trasero" section should appear (it didn't before, for this module type). Set Material to "Puertas", set "Núm. puertas traseras" to 2 — the 3D preview (both the inline `ModulePreview3D` in the inspector and the module in the main scene) should show two doors on the side facing away from the front, openable via right-click/double-click same as front doors. Switch Material to "Alacena abierta", set "Entrepaños traseros" to 3 — the back should become an open cubby with 3 shelf boards visible from behind, no panel. Switch back to "Interior" — back should return to a plain hidden panel. Drag the same cabinet back near a wall (island mode releases) — the "Panel trasero" section should disappear from the inspector again.

- [ ] **Step 5: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Expose back-face controls in the inspector for island cabinets

The "Panel trasero" section now also shows for any module with
islandMode true (not just desayunador/librero_giratorio_espejo), with new
"Puertas"/"Alacena abierta" back-panel options and their door/shelf count
inputs.
EOF
)"
```

---

### Task 6: Remove the `isla_central` placeholder

**Files:**
- Modify: `frontend/services/kitchenData.ts:860-869` (delete catalog entry)
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx:642`, `:1796` (drop `isla_central` from the two `isIsland`/countertop-band checks)
- Modify: `frontend/components/3d/ModulePreview3D.tsx:2024` (same, in `CountertopPreviewMesh`)
- Delete: `frontend/public/module-thumbnails/isla_central.png`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — pure removal. `peninsula`/`barra_desayunadora` behavior must be byte-for-byte unchanged after this task.

- [ ] **Step 1: Delete the catalog entry**

In `frontend/services/kitchenData.ts`, find and delete this whole object (including its trailing comma) from the `MODULE_CATALOG` array:

```ts
  {
    type: "isla_central",
    category: "countertop",
    label: "Isla central",
    description: "Módulo central independiente con muebles a los cuatro lados",
    icon: "🏝️",
    defaultDimensions: { height: 90, width: 180, depth: 90 },
    defaultOptions: { drawers: 4, doors: 4, shelves: 1, countertopMaterial: "Cuarzo engineered", includesCountertop: true },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "shelves", "countertopMaterial", "edgeProfile", "boardMaterial", "color"],
  },
```

- [ ] **Step 2: Drop `isla_central` from `KitchenAssemblyScene.tsx`'s `CountertopMesh`**

Find:

```ts
  const isIsland = mod.type === "isla_central" || mod.type === "peninsula" || mod.type === "barra_desayunadora";
```

Replace with:

```ts
  const isIsland = mod.type === "peninsula" || mod.type === "barra_desayunadora";
```

- [ ] **Step 3: Drop `isla_central` from `KitchenAssemblyScene.tsx`'s `baseY`**

Find:

```ts
  if (mod.category === "countertop" && !["isla_central", "peninsula", "barra_desayunadora"].includes(mod.type)) return 0.87;
```

Replace with:

```ts
  if (mod.category === "countertop" && !["peninsula", "barra_desayunadora"].includes(mod.type)) return 0.87;
```

- [ ] **Step 4: Drop `isla_central` from `ModulePreview3D.tsx`'s `CountertopPreviewMesh`**

Find:

```ts
  const isIsland = module.type === "isla_central" || module.type === "peninsula" || module.type === "barra_desayunadora";
```

Replace with:

```ts
  const isIsland = module.type === "peninsula" || module.type === "barra_desayunadora";
```

Also update the comment header a few lines above it — find:

```ts
// ─── Countertop preview (cubierta, isla_central, peninsula, barra, cubierta_tarja) ─
```

Replace with:

```ts
// ─── Countertop preview (cubierta, peninsula, barra, cubierta_tarja) ─
```

- [ ] **Step 5: Delete the thumbnail file**

```bash
git rm frontend/public/module-thumbnails/isla_central.png
```

(This stages the deletion; the commit in Step 7 covers it along with the other changes.)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: PASSES — this was the last remaining `isla_central` reference (`buildSampleKitchenIsla`'s usage is handled in Task 7, which must land before this is fully clean; if Task 7 hasn't run yet, `kitchenData.ts`'s `add("isla_central", ...)` call in `buildSampleKitchenIsla` will still fail to type-check). Run Task 7 immediately after this one if doing them in the same session, or confirm the only remaining error is that single `add("isla_central", ...)` line before moving on.

- [ ] **Step 7: Commit**

```bash
git add services/kitchenData.ts components/3d/KitchenAssemblyScene.tsx components/3d/ModulePreview3D.tsx
git commit -m "$(cat <<'EOF'
Remove the isla_central catalog placeholder

Real lower/tower/corner cabinets in island mode now cover what this
bare box-plus-slab type was standing in for. peninsula/barra_desayunadora
(the other freestanding countertop types) are unaffected. The sample
kitchen that used isla_central is updated in the next task.
EOF
)"
```

---

### Task 7: Replace the sample "Isla" kitchen's placeholder with real island cabinets

**Files:**
- Modify: `frontend/services/kitchenData.ts:1272-1274` (`buildSampleKitchenIsla`)

**Interfaces:**
- Consumes: `ModuleOptions.islandMode`, `backPanelMaterial`, `backDoors` (Tasks 1-3); `makeModuleAdder`'s `add(type, x, z, patch)` (pre-existing).

- [ ] **Step 1: Replace the `isla_central` placeholder with two real lower cabinets**

In `frontend/services/kitchenData.ts`, inside `buildSampleKitchenIsla`, find:

```ts
  // Freestanding island — clear of both wall runs, roughly centered on the
  // open floor to the south-east of the L.
  add("isla_central", 360, 220);
```

Replace with:

```ts
  // Freestanding island — two real lower cabinets joined edge-to-edge,
  // clear of both wall runs, roughly centered on the open floor to the
  // south-east of the L (room is 580×380, so this sits ~2m+ from every
  // wall — well past the 0.85m island-mode threshold). rotation: 90 is
  // deliberately NOT the nearest-wall pick (that would be the south wall,
  // rotation 180) — demonstrates that a real drag-placed island holds
  // whatever rotation it's given instead of snapping to face a wall.
  // Doors on the front, a small open back (2 shelves, no panel) facing the
  // walkway on the other side — the same snapToNeighbor/addCountertop
  // machinery that joins wall-run cabinets joins these two into one
  // continuous countertop with no extra code (see design spec).
  add("gabinete_bajo_cajones", 315, 220, {
    rotation: 90,
    options: { islandMode: true, backPanelMaterial: "alacena", backShelves: 2 },
  });
  add("gabinete_bajo_puertas", 405, 220, {
    rotation: 90,
    options: { islandMode: true, backPanelMaterial: "alacena", backShelves: 2 },
  });
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: PASSES cleanly — this was the last outstanding `isla_central` reference.

- [ ] **Step 3: Manual verification (end-to-end feature check)**

With the dev server running, from the kitchen builder's project selector load the sample kitchen variant 2 ("Cocina de muestra — Isla") — check how the app exposes variant selection (likely a "Cocina de muestra" button/menu; use variant 2 specifically, e.g. via `loadSampleKitchen(2)` in the store, however the UI triggers it).

Expected, all in the 3D view:
- Two lower cabinets sit together in the open floor, away from every wall, forming one 180cm-wide island run with a single continuous countertop slab across both (not two separate slabs with a visible seam) — confirms `snapToNeighbor` + `addCountertop`'s run-merging already works for island placements with no code changes.
- Their rotation (90°) is held as placed — not auto-facing the nearest (south) wall.
- The side facing away from the room's main walkway shows open shelving (2 boards, no back panel) rather than a flat hidden panel — confirms the `backPanelMaterial: "alacena"` rendering path from Task 3.
- Open the "Resumen"/quote view (materials/cost breakdown) — the island's countertop should appear as its own line item (not silently merged into a wall run's pricing, and not double-counted), and the "alacena" shelf boards should show up in the interior-board cut list under each module's cuts.
- Drag one of the two island cabinets further away, then drag it back close enough to re-join its neighbor — it should re-snap flush (existing `snapToNeighbor` behavior, unaffected by island mode).

- [ ] **Step 4: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Replace the sample island kitchen's placeholder with real island cabinets

buildSampleKitchenIsla now demonstrates the island feature itself: two
real lower cabinets in island mode, joined into one countertop run, one
with an open "alacena" back — instead of the removed isla_central stand-in.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Island-position detection + hysteresis (Task 2) · back-face data model (Task 1) · inspector exposure (Task 5) · 3D rendering (Task 3) · joining/costing reuse (verified, not built, in Task 7 Step 3) · `isla_central` removal (Task 6) · sample-kitchen replacement (Task 7, beyond spec's literal scope but required — see below). All spec sections have a task.
- **Gap found during self-review, not in the spec at all:** the spec's "joining/costing reuse" section only checked `addCountertop`'s run-merging (which genuinely needed no changes). It didn't account for `kitchenData.ts` keeping its own separate `resolveDoors`/`resolveDrawers` pair for the cost/cut-list engine, independent of the 3D mesh's `getEffectiveDoors`. Without Task 4, `backDoors`/`backShelves` would render correctly in 3D (Task 3) but generate a wrong quote — a phantom back-panel board charged instead of the real back doors/shelves, and the back doors/shelves never costed at all. Added as its own task since a reviewer could reasonably approve the 3D rendering while this is still broken, or vice versa.
- **Deviation from the spec's literal field list, flagged here rather than silently:** the spec (Section 2) describes `backShelves` as a plain independent count. Task 3 implements "alacena" mode by omitting the back panel entirely so the module's *existing* shared shelf cavity becomes reachable from behind, with `backShelves` as an additional independently-countable set layered into the same cavity — because shelves are a structural property of one shared box, not per-face, a literal second independent count can visually double up with the front's `shelves` if a module sets both to non-zero. This is called out in code comments (Task 3, Step 3) and left as a v1 simplification rather than building a divider between two half-cavities, which the spec didn't ask for and would meaningfully expand scope.
- **Scope check:** Single cohesive plan, no sub-project split needed — every task depends on the data model from Task 1, and Task 7 exercises the whole stack end-to-end as its own verification.
- **Ambiguity check:** Task ordering is strict (1 → 2 → 3 → 4 → 5 → 6 → 7) because `tsc --noEmit` is expected to fail on `isla_central` references from Task 1 through Task 6 — this is called out explicitly in each task's type-check step so it isn't mistaken for a regression.
