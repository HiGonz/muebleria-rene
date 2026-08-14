# Closet designer — design

Status: approved (chat), ready for implementation planning
Scope: a brand-new "closet designer" subsystem, conceptually and
functionally independent from the existing kitchen designer. Built
bottom-up from stackable vertical blocks inside a module, unlike the
kitchen's flat side-by-side module list.

Explicitly out of scope for this spec (deferred to later phases, per the
phased plan in §10):
- Room-type áreas (4-wall walk-around space) — phase 1 ships niche-type
  áreas only.
- Backend persistence (migrations/controller/routes/pages) — phase 1 is
  draft-only (in-memory + localStorage), no save/load to a server.
- Any block kind beyond the four in the original request (drawers, open,
  doors, hangrod).
- Corner modules, sliding doors, mirrors, lighting — explicitly future
  block kinds per the original request, not designed here beyond "the
  union can grow".

## Why this shape

The existing kitchen designer (`frontend/store/useKitchenStore.ts`,
`frontend/types/kitchen.ts`, `frontend/components/3d/KitchenAssemblyScene.tsx`,
`frontend/components/3d/ModulePreview3D.tsx`) was analyzed in full before
this design (two parallel deep-research passes, findings folded in below).
Two things came out of that analysis that directly shape this design:

1. **Kitchen's `ModuleOptions` is one undiscriminated ~70-field bag** shared
   across all 68 module types, with no per-type narrowing — the research
   flagged this explicitly as a trap not to repeat. The closet's `ClosetBlock`
   is a true TypeScript discriminated union (`kind` narrows `config`) instead.
2. **Kitchen's vertical position is never truly modeled** — a module is
   either at floor level or at a hardcoded `mountHeight`, with "is this
   wall-mounted" duplicated as an ad hoc predicate in ~10 places. The closet
   system's central new idea — a module built from an ordered stack of
   blocks, each with an explicit `heightCm`, whose `yBottom`/`yTop` are
   *always derived* by summing the heights of everything below — has no
   equivalent in kitchen and must be written fresh (§4).

Everything else that's genuinely generic (3D primitives, spatial math, the
camera rig, the debounced-persist/undo-redo *patterns*) is reused per the
inventory in §2, via the safest available mechanism: adding `export` to
existing, unit-generic kitchen functions with zero logic changes, rather
than moving code or restructuring kitchen's files.

## 1. What's reused, and how

**3D primitives** — export-only from `ModulePreview3D.tsx` (no logic
changes): `Panel`/`Box`, `Carcass`, `Shelves`, `SideFiller`, `TopFiller`,
`ToeKick`, `LambrinPanel`, `DoorPanel`, `DrawerFace`, `HARDWARE_LOOKS`,
`mapKey`, `shiftColor`, `getWoodTexture`/`getWoodRoughness` (from
`woodTextures.ts`, already exported), `useContextRecovery` (already
exported, already a standalone module). `DoorPanel`/`DrawerFace` are
already data-driven off a `{widthPct, offsetPct, fromBottomCm, heightCm}`
rect — call them with `toeKick={0}`.

**Spatial math** — export-only from `KitchenAssemblyScene.tsx`:
`boxesOverlap`, `moduleBox`, `slideToClosestFree`, `findNearestFreePosition`,
`overlapDepthM`, `stickyHeightSnapCm`, `rotateLocal`, `moduleSideEdgeAt`,
`edgeStraddledByBoth`.

**Camera** — reused as-is: `CameraRig`, the camera-persistence trio
(`cameraStorageKey`/`readPersistedCameraView`/`createDebouncedCameraWriter`),
`zoom()`, and `Camera3DControls.tsx` in full (already a pure presentational
component with zero kitchen imports). Only the four preset position
expressions and the initial orbit target are kitchen-shaped; the closet
scene supplies its own.

**Patterns reimplemented (not imported) in closet-owned code**, because
they're small, self-contained, and copying beats cross-store coupling:
- The `UndoEntry`-shaped before/after-per-item undo/redo pattern.
- `createDebouncedLocalStorage`'s ~20-line debounced-write shape.
- `ModuleCatalogEntry`'s `type → defaultDimensions/defaultOptions →
  configurableFields` catalog shape, adapted to `kind → defaultConfig`.
- The relational-skeleton-plus-JSON-detail persistence shape kitchen uses
  (`kitchen_modules.options` as JSON) — closet blocks follow the same idea
  (§9), deferred to the persistence phase.

**Not reused — closet-incompatible or kitchen-policy, written fresh**:
`placementBand`/island mode/`snapAlignAcrossBands` (two-band floor/wall
model has no closet equivalent), `nearestWallRotation`/`wallFlushXZ`/
`WallDragBasis` (wall-tied rotation semantics), `computeCountertopRunSpans`
and everything countertop-shaped, the `CabinetMesh` 8-early-return dispatch
shape, `cabinetsSnapCompatible`.

## 2. Data model

All new types in `frontend/types/closet.ts` — no shared types with
`frontend/types/kitchen.ts`.

```ts
interface ClosetProject {
  id: number | null;
  clientName: string;
  projectName: string;
  notes: string;
  areas: ClosetArea[];
}

interface ClosetArea {
  id: string;
  label: string;
  spaceType: "niche" | "room";
  // "niche": envelope against one wall, no walk-around — camera frames the
  // box. "room" (phase 3): 4-wall walkable space, camera orbits freely —
  // structurally similar to kitchen's room but a separate type, not shared.
  space:
    | { width: number; height: number; depth: number }         // niche, cm
    | { width: number; depth: number; ceilingHeight: number };  // room, cm
  conjuntos: ClosetConjunto[];
}

interface ClosetConjunto {
  id: string;
  label: string;
  x: number; z: number; rotation: 0 | 90 | 180 | 270; // placement within the área
  modules: ClosetModule[];   // left-to-right order
  topShelf?: ClosetTopShelf;
}

interface ClosetModule {
  id: string;
  label: string;
  width: number;  // cm, fixed
  depth: number;  // cm, fixed
  // height is NEVER stored — always sum(blocks[i].heightCm), see §4
  blocks: ClosetBlock[]; // bottom-to-top order
}

type ClosetBlockKind = "drawers" | "open" | "doors" | "hangrod";

interface DrawerBlockConfig {
  quantity: number;
  individualHeightCm?: number; // auto (heightCm / quantity) if omitted
  gapCm: number;
}
interface OpenBlockConfig {} // nothing beyond the block's own heightCm
interface DoorBlockConfig {
  doorCount: number;
  doorWidths?: number[]; // auto-even split if omitted
  hasLock: boolean;
  doorType: string;
}
interface HangRodBlockConfig {
  rodHeightFromBottomCm: number;
  rodDepthCm: number;
  secondRod?: { heightFromBottomCm: number }; // future
}

type ClosetBlock =
  | { id: string; kind: "drawers"; heightCm: number; config: DrawerBlockConfig }
  | { id: string; kind: "open";    heightCm: number; config: OpenBlockConfig }
  | { id: string; kind: "doors";   heightCm: number; config: DoorBlockConfig }
  | { id: string; kind: "hangrod"; heightCm: number; config: HangRodBlockConfig };

interface ClosetTopShelf {
  id: string;
  coversModuleIds: string[]; // must be a contiguous run within the conjunto
  thickness: number;
  material: string;
}
```

Extensibility: a future block kind (zapatera, pantalonera, corbatero,
cesta, espejo, iluminación, corner, sliding doors) is one new member added
to the `ClosetBlock` union + its config interface + its catalog entry +
its mesh renderer. `layoutModuleBlocks` (§4), `stackAlongAxis` (§5), and
every consumer that only reads `heightCm` need no changes.

## 3. Coordinate system

Same convention kitchen uses, confirmed against `KitchenAssemblyScene.tsx`:
Y is up, floor is `y = 0`, cm in the data layer, meters in the 3D layer
(`/100` at the component boundary). A module's blocks stack along local Y
starting at the module's own floor (`y = 0` relative to the module, which
sits at the área's floor). A conjunto's `x`/`z`/`rotation` place it within
the área, same units/rotation-enum convention as kitchen's `KitchenModule`
(`0/90/180/270`, though closet's rotation meaning is area-relative, not
"which of 4 room walls" — a niche área only ever has one wall, so rotation
is fixed there; it only varies in room-type áreas, phase 3).

## 4. Vertical block stacking

```ts
function layoutModuleBlocks(blocks: ClosetBlock[]) {
  let y = 0;
  return blocks.map((block) => {
    const yBottomCm = y;
    y += block.heightCm;
    return { block, yBottomCm, yTopCm: y };
  });
}

function validateModuleHeight(blocks: ClosetBlock[], maxHeightCm: number) {
  const totalCm = blocks.reduce((sum, b) => sum + b.heightCm, 0);
  return { fits: totalCm <= maxHeightCm, totalCm, overflowCm: Math.max(0, totalCm - maxHeightCm) };
}
```

Pure, no Three.js, no store dependency. Called from a `useMemo` keyed on
the module's `blocks` array wherever geometry or the block-stack editor
needs positions. `yBottom`/`yTop` are **never persisted** — inserting,
removing, reordering, or resizing a block is just "replace the `blocks`
array"; every position above the change falls out of the next
`layoutModuleBlocks` call for free. This is what makes "todo lo que está
arriba se recalcula" (request §5) true by construction rather than by an
explicit cascade-recompute step.

## 5. Module adjacency (within a conjunto)

Same idea as §4, one axis over:

```ts
function stackAlongAxis<T extends { sizeCm: number }>(items: T[], gapCm = 0) {
  let pos = 0;
  return items.map((item) => {
    const startCm = pos;
    pos += item.sizeCm + gapCm;
    return { item, startCm, endCm: startCm + item.sizeCm };
  });
}
```

Modules within a conjunto are auto-packed left-to-right by this function
(`sizeCm = module.width`), guaranteeing "quedar perfectamente unidos" by
construction, not by a drag-then-snap step. An optional `gapCm` between
modules (default 0) covers deliberate gaps (e.g. leaving room for a
full-length mirror). `layoutModuleBlocks` and `stackAlongAxis` are the same
shape on purpose — one small reusable utility, two call sites.

The **conjunto** itself is freely placed within the área (drag/collision),
reusing the exported spatial-math helpers (§1) the same way kitchen
positions a module — that's the one place in this system where "drag a
thing around and snap it" still applies.

## 6. Elements spanning multiple modules (top shelf)

`ClosetTopShelf.coversModuleIds` must be a contiguous run of the
conjunto's module order. Its world rect is derived, never independently
positioned: `x`/`width` from `stackAlongAxis`'s `startCm`/`endCm` of the
first/last covered module, `y` = the max of `layoutModuleBlocks`'s total
height across the covered modules (so it clears the tallest one), `depth`
= the conjunto's shared depth. Changing a covered module's block
composition recomputes the shelf's `y` for free on next render.

Validation: removing or reordering a module that breaks
`coversModuleIds`'s contiguity must shrink or delete the shelf — this is
called out explicitly (§8, risk) so it isn't hand-waved during
implementation.

## 7. State — `frontend/store/useClosetStore.ts`

A new, separate Zustand store — not an extension of `useKitchenStore`.
Phase 1 (this spec's implementation target) holds a single in-memory
`ClosetProject` draft with its own localStorage persistence key (e.g.
`closet-draft-v1`), reusing the *debounced-write pattern* from
`useKitchenStore.ts` (copied, not imported — see §1). Reimplements the
`UndoEntry`-shaped undo/redo pattern for block/module mutations, scoped to
whatever phase 1 actually needs (add/remove/reorder block, add/remove
module) — the exact action list is for the implementation plan to enumerate
task-by-task, not this spec.

## 8. Risks

1. Export-only reuse is a silent dependency — a future kitchen refactor
   touching an exported name breaks closet without warning. Each export
   site gets a one-line comment noting closet depends on it.
2. Niche vs. room doubles scene-composition surface eventually; mitigated
   by phasing (niche first, room in phase 3).
3. Multiple conjuntos per área from v1 means conjunto-vs-conjunto collision
   is in scope from the first cut, not an add-on.
4. `ClosetTopShelf` contiguous-coverage must be actively enforced on
   module reorder/remove, not assumed.
5. The `ClosetBlock` discriminated union means store updates need a
   `switch`/narrow on `kind` rather than kitchen's blind options-merge —
   more code, deliberately, to avoid kitchen's flat-bag trap.

## 9. Persistence shape (for later phases, noted now for consistency)

When backend persistence is built (phase 4, out of scope here): mirror
kitchen's relational-skeleton-plus-JSON approach — `closet_projects` →
`closet_areas` → `closet_conjuntos` → `closet_modules` as relational rows,
with each module's `blocks` array stored as one JSON column (not a
`closet_blocks` table) since blocks are always read/written as a whole
ordered list per module, never queried individually.

## 10. Phased plan (full roadmap; this spec's implementation covers phase 0 + phase 1 only)

- **Phase 0** — Foundation: `export` additions to kitchen (§1), scaffold
  `types/closet.ts`, `store/useClosetStore.ts`, `services/closetData.ts`
  with `layoutModuleBlocks`/`stackAlongAxis`/`validateModuleHeight`.
- **Phase 1** — Niche áreas, one conjunto: `ClosetAssemblyScene.tsx`
  (niche-only), auto-packed modules, auto-stacked blocks, the four block
  renderers (drawers/open/doors/hangrod — hangrod needs a new mesh, the
  other three lean on reused primitives), the block-stack editor UI.
  Draft-only, no backend.
- **Phase 2** — Multiple conjuntos + top shelf (conjunto placement/drag,
  contiguous-coverage enforcement).
- **Phase 3** — Room-type áreas (4-wall space, orbit camera).
- **Phase 4** — Persistence (migrations, controller, routes, `/closet` +
  `/closet/projects` pages).
- **Phase 5** — Additional block kinds, proving the union is extensible
  without touching the stacking engine.
