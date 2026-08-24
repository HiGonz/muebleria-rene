# Closet designer: elevated modules — Design

## Problem

Every `ClosetModule` in a conjunto is packed left-to-right at floor level
(`stackAlongAxis`, always rendered at `position={[x, 0, z]}` in
`ClosetBlockMeshes.tsx:132`). There is no way to place a module so it
sits *on top of* one or more other modules instead of next to them. This
blocks a common real furniture shape: two side-by-side drawer units
("cajoneras") of one width, sharing a single wider open niche on top of
both — the user has a photo of exactly this piece and can't reproduce it
in the closet designer today.

The closest existing mechanism, `ClosetTopShelf` (`types/closet.ts:76-81`),
already solves the *positioning* half of this — it spans a contiguous run
of a conjunto's modules (`coversModuleIds`) and its render position is
computed from them (`layoutTopShelf`, `closetData.ts:188-197`) — but it's
a single thin plank (`thickness` + `material`), not a real module with
its own drawers/doors/niche/hangrod blocks.

## Goals

- A conjunto can contain one or more **elevated modules**: real
  `ClosetModule`s (full block support — drawers, doors, open niche,
  hangrod, same editor as any other module) whose horizontal position,
  width, and vertical base height are all derived automatically from a
  contiguous run of the conjunto's existing "ground" modules, rather than
  set by hand.
- Building the example piece (2 cajoneras + 1 niche spanning both) takes:
  add module, add module, add module → "elevar sobre" → pick the first
  two → configure its blocks like any other module.
- If a ground module directly under an elevated module is resized, the
  elevated module's width/position adjust automatically on next render
  (nothing to keep in sync by hand).
- Deleting a ground module that's currently covered by an elevated module
  is blocked with a clear message, rather than silently leaving the
  elevated module dangling or auto-deleting user-configured work.
- Purely additive to the persisted schema — existing saved closets (no
  elevated modules) keep working with no migration.

## Non-goals

- No multi-level towers (an elevated module covering another elevated
  module). Only ground modules can be covered. If someone needs a third
  tier later, that's a separate follow-up spec — YAGNI for now.
- No manual/free-form positioning for an elevated module (arbitrary X/Y
  independent of any covered modules). Every elevated module's geometry
  is fully derived from what it covers, same philosophy as the existing
  `ClosetTopShelf`.
- No change to `ClosetTopShelf` itself — it stays as the lightweight
  "just a plank" option; elevated modules are a separate, heavier option
  for when the user wants real storage on top, not a replacement.
- No reordering of modules within a conjunto (still append-only, per the
  existing `reconcileTopShelfCoverage` comment at `closetData.ts:172-176`)
  — elevated modules don't need to change this.

## 1. Data model (`frontend/types/closet.ts`)

`ClosetModule` (`closet.ts:37-44`) gains one optional field:

```ts
export interface ClosetModule {
  id: string;
  label: string;
  width: number; // cm — for a ground module, fixed by the user; for an
                 // elevated module, DERIVED (see layoutElevatedModule)
                 // and overwritten on every layout pass, never
                 // hand-edited directly
  depth: number;
  blocks: ClosetBlock[];
  coversModuleIds?: string[]; // present only on elevated modules — a
                              // contiguous run of sibling GROUND module
                              // ids (no module whose own coversModuleIds
                              // is set may appear here)
}
```

A module is "elevated" iff `coversModuleIds` is present and non-empty;
otherwise it's a "ground" module, behaving exactly as today. No new type
is introduced — this keeps full block support (drawers/doors/open/
hangrod) for free, since that's already what `ClosetModule` provides,
which was the deciding factor against generalizing `ClosetTopShelf` into
a parallel module-shaped type.

## 2. Layout (`frontend/services/closetData.ts`)

**New helper**, mirroring `layoutTopShelf` (`closetData.ts:188-197`) but
for a module instead of a plank:

```ts
export interface ElevatedModuleLayout { xStartCm: number; xEndCm: number; yBaseCm: number }

export function layoutElevatedModule(module: ClosetModule, groundModules: ClosetModule[]): ElevatedModuleLayout | null {
  const packed = stackAlongAxis(groundModules.map((m) => ({ sizeCm: m.width, module: m })));
  const covered = packed.filter((p) => module.coversModuleIds?.includes(p.item.module.id));
  if (covered.length === 0) return null;
  return {
    xStartCm: Math.min(...covered.map((p) => p.startCm)),
    xEndCm: Math.max(...covered.map((p) => p.endCm)),
    yBaseCm: Math.max(...covered.map((p) => moduleTotalHeightCm(p.item.module.blocks))),
  };
}
```

`groundModules` is always `conjunto.modules.filter((m) => !m.coversModuleIds?.length)`
— every call site below computes this split once and reuses it.

**Ground-module helpers must stop counting elevated modules as floor
width.** Today, four places feed the *entire* `conjunto.modules` array
into `stackAlongAxis` (or an equivalent sum) to compute the conjunto's
floor footprint. Once an elevated module can live in that same array,
counting it again on top of the ground modules it covers would inflate
the conjunto's apparent width by however wide the elevated module is —
double-counting the same physical space. Each of these needs to filter
to ground modules first:

- `conjuntoWidthCm` (`closetData.ts:118-121`) — filter to ground modules
  before packing. This is the one with the widest blast radius: it's also
  what bounds `addModule`'s and `updateModuleWidth`'s "don't exceed the
  niche's width" ceilings (`useClosetStore.ts:213`, and the
  `otherModulesWidthCm` reduce at `useClosetStore.ts:323-325`, which sums
  sibling widths directly rather than through `conjuntoWidthCm` and needs
  the same ground-only filter applied inline) — fixing it here fixes both
  transitively.
- Niche rendering pack, `ClosetAssemblyScene.tsx:298`.
- Room rendering pack, `ClosetAssemblyScene.tsx:456`.
- Dimension-label pack, `ClosetAssemblyScene.tsx:482`.

`conjuntoDepthCm` (`closetData.ts:222-224`, max depth over *all* modules)
is intentionally left untouched — an elevated module's own depth should
still count toward the conjunto's footprint depth if it's ever deeper
than what's below it.

**Coverage reconciliation on module removal**, mirroring
`reconcileTopShelfCoverage` (`closetData.ts:177-184`) but scoped to
elevated modules instead of the conjunto's single `topShelf`: if a ground
module is removed, any elevated module whose `coversModuleIds` includes
it needs the same "shrink to the surviving contiguous sub-run, or drop
entirely if nothing survives or the survivors aren't contiguous" logic.
Concretely this spec resolves it differently from `topShelf` though —
see section 4 (`removeModule`) for why removal is blocked outright rather
than silently reconciled.

## 3. Store (`frontend/store/useClosetStore.ts`)

**New action**, alongside the existing `addModule`/`setTopShelf`:

```ts
addElevatedModule: (coversModuleIds: string[], depthCm: number) => void;
```

Mirrors `addModule` (`useClosetStore.ts:197-225`): resolves the target
conjunto the same way (`selectedConjuntoId` fallback), builds a new
`ClosetModule` via `buildNewClosetModule` with `coversModuleIds` set and
`width` seeded from `layoutElevatedModule`'s derived span. `depthCm` is a
plain caller-supplied value exactly like `addModule`'s today (the editor
panel defaults it to the max depth among the covered modules, same
`DEFAULT_MODULE_DEPTH_CM`-style constant pattern `ClosetBuilder.tsx:134`
already uses) — depth is fixed at creation time for every module, elevated
or not (no `updateModuleDepth` action exists in this store today), so this
isn't a new restriction. Selects the new module (`selectedModuleId`) so
its block editor opens immediately, same as a freshly added ground module
does today.

**`removeModule` (`useClosetStore.ts:227-244`) gains a guard**: if the
module being removed is a ground module currently covered by any elevated
module in the same conjunto, the removal is rejected (the action becomes
a no-op) rather than silently reconciling or cascading. This is the
"blocked, not auto-adjusted" rule confirmed in chat — the caller (the
module list UI) surfaces this as a toast/disabled state: "Este módulo
está cubierto por un módulo elevado — quítalo primero." Removing an
*elevated* module itself is unrestricted (already just filters it out of
`conjunto.modules`, no special case needed — it never has anything
covering *it*, since multi-level stacking is out of scope).

**`updateModuleWidth` (`useClosetStore.ts:314-329`) needs no change to
elevated modules themselves** — their `width` is derived, not
user-editable, so the width editor UI simply doesn't offer a width field
for a module with `coversModuleIds` set (see section 4). Its *ceiling
calculation* for ground modules does need the same ground-only filter as
`conjuntoWidthCm` (section 2) so resizing a ground module isn't
artificially capped by an elevated sibling's derived width.

## 4. UI (`frontend/components/closet/`)

**Adding an elevated module**: a new small panel, `ClosetElevatedModuleEditor.tsx`,
built the same way as `ClosetTopShelfEditor.tsx` (`closetData` "desde"/
"hasta" dropdowns over the conjunto's *ground* modules only — any pair of
indices is necessarily contiguous, so there's nothing left to validate)
plus an "Elevar sobre estos módulos" button that calls `addElevatedModule`.
Placed in the same panel area as the existing "+ Nuevo Módulo" /
"Repisa superior" controls, visible once the conjunto has ≥ 2 ground
modules (spanning just one module is allowed but pointless — the UI
doesn't forbid it, it just won't come up in practice).

**Editing an elevated module's contents**: reuses `ClosetModuleStackEditor.tsx`
completely unchanged — an elevated module is a `ClosetModule` like any
other, so its block list (add/remove/reorder drawers, doors, open,
hangrod) works identically. The one difference: wherever the module's
own `width` is currently shown as an editable field, it's rendered
read-only (with a short label like "Ancho: derivado de los módulos
cubiertos") when `coversModuleIds` is set.

**Module list / selection**: existing module tabs/list (wherever
`moduleLetter` labels are shown) get a small visual marker (e.g. an "↑"
badge or the amber label styled differently) for elevated modules, so
it's clear at a glance which entries aren't part of the normal
left-to-right row.

## 5. Rendering (`frontend/components/3d/ClosetBlockMeshes.tsx`, `ClosetAssemblyScene.tsx`)

`ClosetModuleMesh` (`ClosetBlockMeshes.tsx:124-145`) gains a `y` prop,
defaulting to `0`:

```ts
export function ClosetModuleMesh({ module, x, y = 0, z, rotationDeg = 0 }: { ...; y?: number; ... }) {
  ...
  return (
    <group position={[x, y, z]} rotation-y={...}>
```

`ConjuntoLayer` and `RoomConjuntoLayer` (`ClosetAssemblyScene.tsx:286-310`,
`441-469`) each currently do one `stackAlongAxis` pack over *all*
`conjunto.modules` and render one `ClosetModuleMesh` per entry at `y`
implicitly 0. Each becomes two passes:

1. Ground modules: same as today, but packed from the ground-only subset
   (section 2), still at `y={0}`.
2. Elevated modules: for each, call `layoutElevatedModule` against the
   ground pack computed in step 1, and render one more `ClosetModuleMesh`
   positioned at the derived `xStartCm`/`yBaseCm` (converted to meters,
   same unit convention as everything else in this file) with its actual
   derived width. This replaces what `TopShelfMesh`/`RoomTopShelfMesh`
   (`ClosetAssemblyScene.tsx:270-284`, `419-439`) already do for a plank —
   an elevated module reuses the exact same layout math, just rendering a
   full `ClosetModuleMesh` instead of a single `<Box>`.

`NicheDimensionOverlay`'s module-label pack (`ClosetAssemblyScene.tsx:480-488`)
also switches to the ground-only subset for its "Módulo A/B/C" lettering
along the floor row, and gains one label per elevated module positioned
at its own derived center — otherwise an elevated module would have no
letter/dimension label at all.

## 6. Testing

- `closetData.test.ts` (or wherever `layoutTopShelf`/`stackAlongAxis`
  are currently tested, following this repo's existing convention for
  that file): new cases for `layoutElevatedModule` — spanning 1 module,
  spanning 2+ modules of unequal width, spanning modules of unequal
  height (base = the taller one), and the "covers a ground module that
  no longer exists" → `null` case.
- `useClosetStore.test.ts`: `addElevatedModule` creates a module with the
  right derived width/position; `removeModule` is a no-op (with whatever
  signal the test convention uses for "rejected") when the target is
  covered by an elevated module; `updateModuleWidth` on a ground module
  under an elevated sibling isn't capped by that sibling's own width.
- Manual verification in the browser (per this repo's established
  practice of manual 3D checks for closet/kitchen builder changes):
  reproduce the reference photo exactly — two same-width drawer modules
  side by side, then an elevated open-niche module spanning both — and
  confirm it renders flush on top with the correct combined width, then
  resize one of the two drawer modules and confirm the niche above
  adjusts on the next render.
