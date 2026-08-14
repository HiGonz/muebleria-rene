# Island Edge Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user manually force island behavior (free rotation, configurable back
face) on a lower/tower/corner cabinet even when it's close to a wall, via a per-module
inspector toggle — without touching how automatic position-based island detection works
when the toggle is off.

**Architecture:** One new optional field (`options.islandModeManual`) that the three
existing write-sites which already compute `islandMode` (drag move, drag drop, arrow-key
nudge) short-circuit on ahead of their existing distance check. A new store action
(`setIslandModeManual`) is the only way to flip it, so flipping it off can immediately
re-derive `islandMode` from the module's current position instead of just clearing a
flag. Every existing consumer of `options.islandMode` — the 3D mesh, the cost engine, the
inspector's "Panel trasero" gate — is untouched; none of them need to know this override
exists.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + react-three-fiber/three.js +
Zustand, in `frontend/`. No frontend unit-test runner exists in this repo (only Playwright
e2e, `frontend/e2e/`); per this repo's established precedent, verification is
`npx tsc --noEmit` plus manual/live-state verification (see the 2026-08-11 and
2026-08-12 island-cabinets work in `docs/superpowers/plans/2026-08-11-island-cabinets.md`
for the exact live-verification technique already proven in this session: reading
`useKitchenStore`'s draft via the mounted `<canvas>` element's React fiber, walking
`.alternate` for the current committed props).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-island-edge-toggle-design.md` — read it before
  starting; this plan implements it section by section.
- `options.islandMode` remains the only field every downstream consumer (CabinetMesh,
  `calculateKitchenMaterials`, the inspector's existing gates) reads. Nothing in this plan
  touches `ModulePreview3D.tsx` or the costing code in `kitchenData.ts`.
- Eligible categories: exactly `lower`/`tower`/`corner` — reuse the existing
  `ISLAND_ELIGIBLE_CATEGORIES` constant (`services/kitchenData.ts`), do not introduce a
  second one.
- There is no drag-time way to turn the override off — inspector-only, matching how
  "Dirección fija" itself is inspector/toolbar-only, not a drag gesture.
- All commands below run from `frontend/` unless stated otherwise.

---

## File Structure

- `frontend/types/kitchen.ts` — `ModuleOptions` gains `islandModeManual?: boolean`.
- `frontend/store/useKitchenStore.ts` — new `setIslandModeManual` action; `nudgeModule`
  gains the manual-override short-circuit.
- `frontend/components/3d/KitchenAssemblyScene.tsx` — `handleMove` and `handleUp` (inside
  `handleDragStart`) gain the same short-circuit.
- `frontend/components/kitchen/ModuleInspector.tsx` — new "Forzar modo isla" toggle,
  positioned above the existing "Panel trasero" section; one wording fix in that section's
  help text (see Task 3).

---

### Task 1: Data model — `islandModeManual` field

**Files:**
- Modify: `frontend/types/kitchen.ts:405-431` (`ModuleOptions`, end of interface)

**Interfaces:**
- Produces: `ModuleOptions.islandModeManual?: boolean`.

- [ ] **Step 1: Add the field**

In `frontend/types/kitchen.ts`, find the end of the `ModuleOptions` interface:

```ts
  // Island cabinets only — count of open shelves reachable from the BACK
  // face when backPanelMaterial is "alacena" (the back panel is simply
  // omitted in that mode, exposing the module's own shared shelf cavity —
  // see CabinetMesh). Only meaningful when backPanelMaterial is "alacena".
  backShelves?: number;
}
```

Replace with:

```ts
  // Island cabinets only — count of open shelves reachable from the BACK
  // face when backPanelMaterial is "alacena" (the back panel is simply
  // omitted in that mode, exposing the module's own shared shelf cavity —
  // see CabinetMesh). Only meaningful when backPanelMaterial is "alacena".
  backShelves?: number;
  // User-forced island mode — bypasses isFreestandingPosition entirely while
  // true, so a module behaves like an island (free rotation, configurable
  // back face) even close to a wall. Purely additive: while false/undefined,
  // islandMode continues to follow automatic position detection exactly as
  // before this field existed. Set together with islandMode itself (see
  // setIslandModeManual in useKitchenStore.ts) so every existing consumer of
  // options.islandMode (CabinetMesh, calculateKitchenMaterials, the
  // inspector's "Panel trasero" gate) keeps reading a single,
  // already-correct boolean — none of them need to know this override
  // exists. Only meaningful for lower/tower/corner modules (see
  // ISLAND_ELIGIBLE_CATEGORIES).
  islandModeManual?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: PASSES cleanly — this is a purely additive optional field, nothing reads it
yet.

- [ ] **Step 3: Commit**

```bash
git add types/kitchen.ts
git commit -m "$(cat <<'EOF'
Add islandModeManual field to the kitchen module data model

Purely additive optional field — nothing reads it yet. Task 2 wires it
into the three places islandMode gets computed.
EOF
)"
```

---

### Task 2: Manual-override behavior — store action + drag/nudge short-circuits

**Files:**
- Modify: `frontend/store/useKitchenStore.ts:103` (interface), `:281-310` (`nudgeModule`,
  add `setIslandModeManual` action right after it)
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx:2428-2430` (`handleMove`),
  `:2466-2468` (`handleUp`)

**Interfaces:**
- Consumes: `ModuleOptions.islandModeManual` (Task 1); `ISLAND_ELIGIBLE_CATEGORIES`,
  `isFreestandingPosition` (both already imported in both files from
  `@/services/kitchenData`).
- Produces: `setIslandModeManual(id: string, forced: boolean): void`, a new action on
  `useKitchenStore`.

- [ ] **Step 1: Add `setIslandModeManual` to the store's interface**

In `frontend/store/useKitchenStore.ts`, find:

```ts
  nudgeModule: (id: string, dx: number, dz: number, dMountHeight: number) => void;
```

Replace with:

```ts
  nudgeModule: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  // The only way options.islandModeManual ever changes — see the
  // implementation below for why turning it off needs more than a plain
  // options patch.
  setIslandModeManual: (id: string, forced: boolean) => void;
```

- [ ] **Step 2: Implement the action**

In the same file, find the end of `nudgeModule`'s implementation:

```ts
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
```

Replace with (adding the new action between `nudgeModule` and `undoLastMove`):

```ts
          return {
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) =>
                m.id === id ? { ...m, x, z, options: { ...m.options, mountHeight, islandMode } } : m
              ),
            },
          };
        }),

      // The inspector's "Forzar modo isla" toggle. Setting `forced: true`
      // pins islandMode to true immediately — no need to drag the module
      // first for the "Panel trasero" section to appear. Setting
      // `forced: false` re-derives islandMode from the module's CURRENT
      // position via the same isFreestandingPosition check the drag/nudge
      // paths use, rather than just clearing it — a module that's already
      // far from every wall stays an island (as if it had just been dragged
      // there), one that's close to a wall reverts to normal. Fires the same
      // transition toast as the drag/nudge paths, only when islandMode's
      // value actually changes.
      setIslandModeManual: (id, forced) =>
        set((s) => {
          const mod = s.draft.modules.find((m) => m.id === id);
          if (!mod || mod.options.locked) return {};
          const islandMode = forced
            ? true
            : ISLAND_ELIGIBLE_CATEGORIES.has(mod.category)
              ? isFreestandingPosition(mod.x / 100, mod.z / 100, s.draft.roomWidth / 100, s.draft.roomDepth / 100, mod.options.islandMode ?? false)
              : (mod.options.islandMode ?? false);
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
                m.id === id ? { ...m, options: { ...m.options, islandModeManual: forced, islandMode } } : m
              ),
            },
          };
        }),

      undoLastMove: () =>
```

- [ ] **Step 3: Short-circuit `nudgeModule` on the manual override**

In the same file, find:

```ts
          const islandMode = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category)
            ? isFreestandingPosition(x / 100, z / 100, s.draft.roomWidth / 100, s.draft.roomDepth / 100, mod.options.islandMode ?? false)
            : mod.options.islandMode;
```

Replace with:

```ts
          const islandMode = mod.options.islandModeManual
            ? true
            : ISLAND_ELIGIBLE_CATEGORIES.has(mod.category)
              ? isFreestandingPosition(x / 100, z / 100, s.draft.roomWidth / 100, s.draft.roomDepth / 100, mod.options.islandMode ?? false)
              : mod.options.islandMode;
```

- [ ] **Step 4: Short-circuit `handleMove` in `KitchenAssemblyScene.tsx`**

In `frontend/components/3d/KitchenAssemblyScene.tsx`, find (inside `handleDragStart`'s
`handleMove`):

```ts
      const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
      const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
      liveIslandMode = islandMode;
      const rotation = moveMode.fixed ? mod.rotation : islandMode ? liveRotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
      liveRotation = rotation;
```

Replace with:

```ts
      const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
      const islandMode = mod.options.islandModeManual ? true : islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
      liveIslandMode = islandMode;
      const rotation = moveMode.fixed ? mod.rotation : islandMode ? liveRotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
      liveRotation = rotation;
```

- [ ] **Step 5: Short-circuit `handleUp`**

In the same file, find (inside `handleDragStart`'s `handleUp`):

```ts
          const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
          const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
          liveIslandMode = islandMode;
```

Replace with:

```ts
          const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
          const islandMode = mod.options.islandModeManual ? true : islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
          liveIslandMode = islandMode;
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: PASSES cleanly.

- [ ] **Step 7: Verify with a differential script**

This is pure logic with no UI dependency — verify it directly rather than only through
manual clicking, the same way earlier work in this session verified
`isFreestandingPosition`/`calculateKitchenMaterials` (see
`docs/superpowers/plans/2026-08-11-island-cabinets.md`'s Task 2 fix round for the
precedent). Write a throwaway (uncommitted) script that imports nothing — just
re-implements the exact three-branch expression from Step 3 inline — and checks:

```js
function resolveIslandMode(mod, x, z, roomWidthM, roomDepthM, eligible, isFreestandingPositionResult) {
  return mod.options.islandModeManual
    ? true
    : eligible
      ? isFreestandingPositionResult
      : mod.options.islandMode;
}

// Case A: forced true, right next to a wall (isFreestandingPosition would say false) -> must stay true
console.assert(resolveIslandMode({ options: { islandModeManual: true, islandMode: true } }, 0.1, 0.1, 4, 3, true, false) === true, "A failed");

// Case B: not forced, far from every wall, eligible, isFreestandingPosition says true -> true (unchanged automatic behavior)
console.assert(resolveIslandMode({ options: { islandModeManual: false, islandMode: false } }, 2, 1.5, 4, 3, true, true) === true, "B failed");

// Case C: not forced, close to a wall, eligible, isFreestandingPosition says false -> false (unchanged automatic behavior)
console.assert(resolveIslandMode({ options: { islandModeManual: false, islandMode: true } }, 0.1, 0.1, 4, 3, true, false) === false, "C failed");

console.log("all cases passed");
```

Run it with `node` and confirm `"all cases passed"` prints with no assertion errors —
this proves the short-circuit logic (Case A: manual override wins outright) coexists
correctly with the unchanged automatic behavior (Cases B/C match what Task 2 of the
original island-cabinets plan already verified).

- [ ] **Step 8: Manual dev-server verification**

With the dev server running (`cd frontend && npx next dev -p 3123`; backend on 8000
should already be running too), open a project, drag a lower cabinet flush against a
wall. There's no UI to flip `islandModeManual` yet (Task 3 adds it) — so for this step,
verify the plumbing indirectly: open the browser's dev tools console on the page and run
the same kind of live-state read this session already used successfully (walk
`document.querySelector('canvas')`'s React fiber up via `.return`, preferring
`.alternate.memoizedProps` over `.memoizedProps`, until you find `props.modules` — see
the read technique developed earlier in this session for the exact code), confirm the
module's `options.islandModeManual` is `undefined` (nothing sets it yet) and
`options.islandMode` still updates exactly as before when dragged. This step exists to
catch any accidental behavior change from Steps 3-5 before Task 3 makes the toggle
reachable; full end-to-end verification of the override itself happens in Task 3.

- [ ] **Step 9: Commit**

```bash
git add store/useKitchenStore.ts components/3d/KitchenAssemblyScene.tsx
git commit -m "$(cat <<'EOF'
Add setIslandModeManual and wire the manual override into drag/nudge

islandModeManual (Task 1) now short-circuits all three places islandMode
gets computed (drag move, drag drop, arrow-key nudge) — while true,
islandMode stays pinned to true regardless of distance to the nearest
wall. setIslandModeManual is the only way to flip it; turning it off
re-derives islandMode from the module's current position instead of just
clearing it. Not yet reachable from the UI — Task 3 adds the toggle.
EOF
)"
```

---

### Task 3: Inspector toggle — "Forzar modo isla"

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx:216-220` (destructure
  `setIslandModeManual`), `:457-493` (insert the new toggle section, fix one line of
  help text)

**Interfaces:**
- Consumes: `setIslandModeManual(id: string, forced: boolean): void` (Task 2);
  `ModuleOptions.islandModeManual` (Task 1); `Section`, `FieldGroup`, `SelectInput`
  (pre-existing in this file); `category`, `opt` (already in scope, destructured from
  `module`/`module.options` earlier in the component).

- [ ] **Step 1: Destructure the new store action**

In `frontend/components/kitchen/ModuleInspector.tsx`, find:

```tsx
  const {
    getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
  } = useKitchenStore();
```

Replace with:

```tsx
  const {
    getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
    setIslandModeManual,
  } = useKitchenStore();
```

- [ ] **Step 2: Add the toggle section, right before "Panel trasero"**

Find:

```tsx
            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode || opt.backPanelMaterial === "puertas" || opt.backPanelMaterial === "alacena") && (
              <Section label="Panel trasero">
```

Replace with:

```tsx
            {(category === "lower" || category === "tower" || category === "corner") && (
              <Section label="Isla">
                <FieldGroup label="Forzar modo isla">
                  <SelectInput
                    value={opt.islandModeManual ? "si" : "no"}
                    onChange={(v) => setIslandModeManual(module.id, v === "si")}
                    options={[{ value: "si", label: "Forzado" }, { value: "no", label: "Automático" }]}
                  />
                </FieldGroup>
                <p className="mt-2 text-[10px] text-warmgray/70">
                  Automático: se vuelve isla solo al arrastrarlo lejos de toda pared. Forzado: se queda en modo isla (gira libre, cara trasera configurable) sin importar qué tan cerca esté de una pared.
                </p>
              </Section>
            )}

            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode || opt.backPanelMaterial === "puertas" || opt.backPanelMaterial === "alacena") && (
              <Section label="Panel trasero">
```

- [ ] **Step 3: Fix the "Panel trasero" help text's now-inaccurate claim**

A manually-forced island can be right next to a wall, so the existing generic-island
branch of this help text — which claims the module is "lejos de cualquier muro" — is no
longer always true. Find:

```tsx
                <p className="mt-2 text-[10px] text-warmgray/70">
                  {type === "desayunador"
                    ? "El respaldo queda expuesto hacia el lado del banquillo (no contra un muro), por eso lleva un acabado en vez de tablero liso. La cubierta vuela este tanto extra sobre ese lado."
                    : type === "librero_giratorio_espejo"
                    ? "El respaldo lleva un espejo en vez de tablero — visible por el lado opuesto a los estantes."
                    : "Este mueble está en modo isla (lejos de cualquier muro): el respaldo queda expuesto hacia el cuarto. Puedes dejarlo con un acabado plano, ponerle sus propias puertas, o abrirlo tipo alacena."}
                </p>
```

Replace with:

```tsx
                <p className="mt-2 text-[10px] text-warmgray/70">
                  {type === "desayunador"
                    ? "El respaldo queda expuesto hacia el lado del banquillo (no contra un muro), por eso lleva un acabado en vez de tablero liso. La cubierta vuela este tanto extra sobre ese lado."
                    : type === "librero_giratorio_espejo"
                    ? "El respaldo lleva un espejo en vez de tablero — visible por el lado opuesto a los estantes."
                    : "Este mueble está en modo isla: el respaldo queda expuesto hacia el cuarto. Puedes dejarlo con un acabado plano, ponerle sus propias puertas, o abrirlo tipo alacena."}
                </p>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: PASSES cleanly.

- [ ] **Step 5: Manual dev-server verification (end-to-end)**

With the dev server running, add a lower cabinet, drag it flush against a wall
(automatic island mode stays off, matching today's behavior). Open its inspector — a new
"Isla" section with a "Forzar modo isla" dropdown should appear (it's offered for every
lower/tower/corner module, not gated on current island state). Switch it to "Forzado":
- The "Panel trasero" section should appear immediately, without needing to drag the
  module first.
- Drag the module around near the wall — it should keep rotating freely (not snapping to
  face the wall) and stay flush against the wall if you put it there.
- Switch "Forzar modo isla" back to "Automático" while the module is still near the wall
  — the "Panel trasero" section should disappear (islandMode re-derives to false from the
  current close-to-wall position) and the module should resume auto-facing the nearest
  wall on its next drag.
- Repeat the "Forzado" step but with the module already far from every wall before
  switching to "Automático" — this time "Panel trasero" should stay visible, since
  automatic detection at that position is already true.

If your session's browser-pane tooling has the same visibility/screenshot compositing
issue seen throughout this session's earlier work, fall back to the live-state read
technique (walking the canvas's React fiber, preferring `.alternate`) to confirm
`options.islandModeManual` and `options.islandMode` end up correct after each step, and
confirm the "Isla"/"Panel trasero" sections' presence via `get_page_text`/DOM queries
rather than screenshots — both approaches were used successfully earlier in this session.

- [ ] **Step 6: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Add "Forzar modo isla" toggle to the inspector

Lets a user force island behavior on a lower/tower/corner cabinet even
close to a wall, via setIslandModeManual. Purely additive to the
existing automatic detection — the toggle defaults to "Automático" and
changes nothing when left there. Also fixes the "Panel trasero" help
text's claim that an island module is always far from every wall, which
a forced-near-wall island now contradicts.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1) · store action + drag/nudge short-circuit
  (Task 2) · inspector toggle + gating (Task 3). All 4 spec sections (data model, store
  action, eligibility/gating, drag-and-nudge interaction) have a task.
- **Placeholder scan:** none found — every step has literal, complete code.
- **Type consistency:** `setIslandModeManual(id: string, forced: boolean): void` is
  declared identically in Task 2's interface addition and implementation, and consumed
  with the same signature in Task 3's `onChange` handler. `islandModeManual` is spelled
  identically across all three tasks (Task 1's type, Task 2's read/write sites, Task 3's
  `opt.islandModeManual` read).
- **Scope check:** single cohesive plan, no sub-project split needed — each task builds
  directly on the previous one's interface, and Task 3 exercises the whole stack as its
  own end-to-end verification.
- **Ambiguity check:** the spec's "no drag-time way to turn it off" constraint is
  reflected structurally — no task adds any UI for turning the override off outside
  `ModuleInspector.tsx`.
