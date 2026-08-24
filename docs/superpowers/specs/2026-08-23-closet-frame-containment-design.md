# Kitchen builder: closet "marco" (frame) containment — Design

## Problem

The closet drag-to-stack feature (just restored/fixed this session — see
`docs/superpowers/plans/` git history for the four fix commits) lets a
closet module rest **on top of** another, using `mountHeight` and pure
geometric derivation (`findClosetSupportRun` on drop,
`findRestingAbove`/`findTowerChain` to know what moves together
afterward). That only ever means "stacked vertically, same or narrower
footprint."

The user wants a large open-backed closet piece (`backPanelMaterial:
"ninguno"` — "funciona solo como un marco") to be usable as a genuine
**container**: something else placed *inside* its opening — not on top of
it — so a big frame can hold a smaller nicho, which can hold something
else, building a creative composition (a room-divider/shadow-box effect),
the way you'd arrange cube inserts into a honeycomb shelf.

## Goals

- A new, dedicated closet module type — a "Marco" — that is nothing but
  an open box (no back, no doors, no drawers): four sides forming a
  frame, sized (width/height/depth) like any module.
- Any other **closet-category** module can be placed **inside** a marco's
  opening: free 2D position (its own width position across the marco's
  width, and its own height position within the marco's height) — not
  just one fixed slot. Depth is NOT independently positionable; a
  contained module always sits flush with the marco's front opening.
- Two modules inside the same marco can never overlap each other
  (checked as a 2D box overlap in the marco's own width×height plane,
  matching how the rest of the app already prevents overlapping
  placements).
- Moving the marco carries everything inside it along (and anything
  resting on top of *that*, transitively) — extending the exact
  delta-based carry mechanism `updateModulePosition` already uses for
  "resting on top of," not a second, different mechanism.
- Setting a contained module's height within the marco happens by
  dragging it vertically while its footprint overlaps the marco's own
  footprint — the same kind of vertical-drag gesture already used for
  wall-mounted (aéreo) modules, adapted to a marco's own front-facing
  plane instead of a room wall.

## Non-goals

- **No marco-inside-marco.** A marco can hold ordinary closet modules,
  never another marco. If nested frames are wanted later, that's a
  separate follow-up spec, not this one.
- **No depth positioning inside a marco.** Front-flush only — the one
  degree of freedom this spec deliberately doesn't add.
- **No resize-safety.** Shrinking a marco that already has something
  inside it that no longer fits does not retroactively move or flag
  that content — matches how this app doesn't retroactively fix
  downstream state when a dimension changes elsewhere.
- **Only closet-category modules can go inside a marco.** No appliances,
  no regular kitchen cabinetry, no wall-mounted pieces — keeps this
  entirely within the closet subsystem this session already built.
- **No BOM/shared-panel treatment** for marco contents — same
  precedent as the existing bridge case (`findClosetSupportRun`'s own
  comment): a contained module is priced/rendered as its own fully
  independent piece, not merged into the marco's bill of materials.

## 1. Data model

`types/kitchen.ts:145`'s `ClosetModuleType` gains one new value:

```ts
export type ClosetModuleType = "cajonera_closet" | "nicho_closet" | "tubo_ropa_closet" | "nicho_doble_puerta_closet" | "zapatera_extraible" | "marco_closet";
```

A new `MODULE_CATALOG` entry in `services/kitchenData.ts` (alongside the
existing closet entries around line 1302-1382), `type: "marco_closet"`,
`category: "closet"`, forcing the options that make it "just a frame" —
`doors: 0`, `drawers: 0`, `shelves: 0`, `backPanelMaterial: "ninguno"`
(not user-configurable for this type — the Inspector's back-panel section
should not offer a choice for `marco_closet`, matching how it already
narrows options per-type, e.g. `ModuleInspector.tsx:877`'s
`category === "closet"` branch). No new fields on `KitchenModule` or
`ModuleOptions` — containment is derived purely from position, exactly
like "resting on top of."

## 2. Containment geometry (`services/kitchenData.ts`)

New function, same family and shape as `findRestingAbove`
(`services/kitchenData.ts`, added this session):

```ts
// Every closet module currently positioned INSIDE marco's own opening —
// directly, or transitively (something resting on top of something
// that's inside marco). "Inside" means: same rotation, the module's own
// along-axis span fits within marco's INTERIOR along-axis span (marco's
// own span minus its frame thickness on each side), and its mountHeight
// falls within marco's interior height range — not touching marco's own
// floor or ceiling the way findClosetSupportRun's "resting on top of"
// does, genuinely WITHIN the opening. "Interior" span/height range is
// marco's own span/height shrunk by BOARD_THICKNESS_CM (services/
// kitchenData.ts:2082, the same 1.8cm side/top/bottom panel thickness
// the cut-list math already uses) on each side, not the marco's raw
// outer dimensions. A marco can never itself be found
// inside another marco (non-goal — marco-in-marco isn't supported), and
// a marco's own contents never include another marco.
export function findContainedWithin(marco: KitchenModule, modules: KitchenModule[]): KitchenModule[]
```

Depth is not part of this check (contents are always auto-flush to the
front — see section 3), so unlike `findRestingAbove`/
`findClosetSupportRun`, this does not compare `dimensions.depth` between
marco and contents at all.

A second small helper, `closetContentsOverlap`, checks two modules
already (or about to be) inside the SAME marco for a 2D overlap in the
marco's own width×height plane (their along-axis spans AND their
mountHeight-to-mountHeight+height spans both overlapping) — used at
drop time (section 3) to reject a placement that would collide with
something already inside.

## 3. Placement interaction (`components/3d/KitchenAssemblyScene.tsx`)

While dragging any closet module (the "Mover" gesture already in
`AssemblyContent`'s `handleDragStart`/`handleMove`/`handleUp`, around
`KitchenAssemblyScene.tsx:2700-2930`), if the dragged module's current
X/Z footprint falls within a marco's own footprint (any `marco_closet`
module in `modules`, not the one being dragged), placement switches from
the normal floor-drop path into "inside this marco" mode for the rest of
the gesture:

- A basis analogous to `WallDragBasis`/`resolveWallDrag`
  (`KitchenAssemblyScene.tsx:104-123`) is established once, at the
  moment the drag first enters the marco's footprint: tangent = the
  marco's own width axis (in world space, given its rotation) instead of
  a room wall's tangent, and "height" = world Y exactly like the wall
  case. The same `resolveWallDrag` Cramer's-rule math applies unchanged
  — only which vector counts as "tangent" differs (marco width axis vs.
  wall direction).
- The resulting `rawHeightCm` is clamped to the marco's own interior
  height range (0 to `marco.dimensions.height - draggedModule.dimensions.height`,
  relative to the marco's own `mountHeight`) instead of the room's
  ceiling — reusing `resolveMountHeightCm`'s existing sticky-snap
  machinery (`stickyHeightSnapCm`, `KitchenAssemblyScene.tsx:1424`) with
  snap candidates being the marco's own floor, ceiling, and any other
  content already inside it (top/bottom aligned), the same idea
  `candidateHeightSnapsCm` (`:1408`) already provides for wall-mounted
  pieces.
- On drop (`handleUp`): if the final position is inside the marco's
  footprint and `closetContentsOverlap` finds no collision with existing
  contents, `mountHeightCm` is set to `marco.options.mountHeight +
  <the resolved in-marco height>`, and the module's along-axis position
  is set to wherever the drag left it — free placement, not
  auto-centered — clamped only enough to keep it fully within the
  marco's interior span. If it WOULD overlap existing contents, the
  drop falls through to the existing `findOverlap`/
  `findNearestFreePosition` handling (same "no cabe junto a…" toast
  path already there for ordinary collisions).
- Leaving the marco's footprint mid-drag (dragging it back out) reverts
  to the ordinary floor-drag behavior for the rest of that gesture —
  same spirit as how a stacked module dropped off its base falls back to
  the floor (`KitchenAssemblyScene.tsx` existing "closet module that WAS
  stacked… drops back to the floor" comment).

## 4. Carrying contents when the marco moves (`store/useKitchenStore.ts`)

`updateModulePosition`'s existing carry step (this session's most recent
fix, `useKitchenStore.ts:511-554`) currently computes `carried =
findRestingAbove(current, s.draft.modules)` and translates each by
`dx`/`dz`/`dMountHeight`. This becomes:

```ts
const carried = [...findRestingAbove(current, s.draft.modules), ...findContainedWithin(current, s.draft.modules)];
```

Both sets use the exact same translation loop already there (delta x/z,
delta mountHeight, rotation set to match) — no new carry logic, just a
second source feeding the same list. `findContainedWithin` is already
transitive (a module resting on top of something that's inside the
marco is included via composing with `findRestingAbove` internally — see
section 2), so nothing above section 2's function needs its own
recursion here.

## 5. Rendering

A `marco_closet` module reuses the existing no-back-panel closet mesh
path essentially unchanged (it's `backPanelMaterial: "ninguno"`,
`doors: 0` — a shape this renderer already draws correctly today for a
plain open nicho). Contained modules render exactly like any other
closet module at their derived `x`/`z`/`mountHeight` — no special
"recessed" mesh treatment needed, since front-flush depth alone reads as
"inside" visually.

## 6. Testing

- `services/kitchenData.test.ts` (same file `findRestingAbove`'s tests
  live in): `findContainedWithin` cases — a module inside a marco found
  correctly; one outside the marco's footprint or height range excluded;
  the transitive case (something resting on top of a contained module
  is included); confirms it never matches a `marco_closet` module as
  something "inside" another marco (non-goal enforcement). Plus
  `closetContentsOverlap` cases: two non-overlapping placements pass,
  two overlapping ones are caught.
- The drag interaction itself (marco-relative `WallDragBasis` analog,
  drop-time `closetContentsOverlap` check) lives in
  `KitchenAssemblyScene.tsx` and is verified manually in the browser, per
  this session's established practice for that file (no test discovery
  under `vitest.config.ts` for component files).
- Manual walkthrough: place a marco, drag a small nicho inside it at a
  chosen height, drag a second one inside without overlapping the first,
  try to drop a third one overlapping an existing one and confirm it's
  rejected, then move the marco and confirm both contained pieces (and
  anything resting on either of them) travel with it.
