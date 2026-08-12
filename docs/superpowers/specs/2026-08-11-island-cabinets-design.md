# Island cabinets — design

Status: approved, ready for implementation planning
Scope: let any existing floor cabinet (`lower`/`tower`/`corner`) be placed away from
every wall and function as a real freestanding island piece — open on the back like a
desayunador, or closed, or just a countertop, joined edge-to-edge with other island
pieces to form a combined island run. Replaces the `isla_central` catalog placeholder
(a bare box + slab with no real doors/drawers, rendered through a separate
`CountertopMesh` path) with the real cabinet meshes instead.

Explicitly out of scope for this spec (deferred if ever needed):
- Per-door customization on the back face (hinge side, glass, pull-out accessories,
  detailed layout) — back doors/shelves are a simple count, sharing the module's
  existing style/material, not the full `doorDefs`-level editor the front face has.
- Back-side drawers.
- A manual "force island mode" override — detection is purely position-based (see
  below); "Dirección fija" (already shipped) remains the escape hatch if the automatic
  rotation guess is ever wrong for an edge-case placement.
- Any change to `cubierta`/`barra_desayunadora`/`peninsula`/`cubierta_tarja`/
  `cubierta_parrilla` — these stay exactly as they are; only `isla_central` is removed.

## Why this shape

Most of what an "island cabinet" needs already exists in the codebase, just gated to
wall-mounted assumptions:

- Floor categories (`lower`/`tower`/`corner`/`appliance`) already drag freely anywhere
  in the room — nothing wall-locks them today. The only thing forcing a "wall"
  appearance is `nearestWallRotation` (`KitchenAssemblyScene.tsx`), which auto-orients
  *any* floor module toward whichever wall is nearest, even dead center in a large
  room.
- `snapToNeighbor` + `cabinetsSnapCompatible` (same file) already join same-category,
  same-height cabinets edge-to-edge by pure geometry (edge distance/overlap), with no
  assumption about being against a wall. Two island cabinets already snap flush
  against each other today.
- `addCountertop` (`kitchenData.ts`) already groups countertop segments into a single
  priced run by shared rotation + perpendicular-axis position — a straight run of
  island cabinets already merges into one continuous countertop for costing, no
  changes needed.
- `BackPanelMode` and the `backPanelMaterial` field already model a configurable back
  finish (interior/exterior/lambrín/espejo) and `barOverhangCm` already lets the
  countertop slab overhang the back edge — both currently wired up for
  `desayunador`/`librero_giratorio_espejo` only, but the mesh code (`CabinetMesh`,
  `CountertopSlab`) applies them generically already.

So this isn't a new subsystem — it's (1) teaching the existing rotation logic to
recognize "far from every wall" and stand down, (2) widening the back-face options
from "finish only" to "finish, or real doors/open shelves", and (3) exposing options
that already exist generically in the mesh code but are gated to specific types in the
inspector UI. The `isla_central` placeholder is deleted since real cabinets now cover
what it was a stand-in for.

## Island-mode detection

New helper, alongside `nearestWallRotation` in `KitchenAssemblyScene.tsx`:

```
function isFreestandingPosition(x, z, roomWidthM, roomDepthM, wasIsland: boolean): boolean
```

Distance to the nearest of the 4 walls, with hysteresis (same shape as the existing
`WALL_ROTATION_STICKY_MARGIN_M` / height-snap margins, just a new enter/release pair
so the state doesn't flicker right at the boundary):

- `ISLAND_ENTER_DISTANCE_M = 0.85` — becomes an island once the nearest wall is farther
  than this.
- `ISLAND_RELEASE_DISTANCE_M = 0.55` — falls back to wall mode once the nearest wall is
  closer than this.
- Between the two: keeps whatever state it already had (`wasIsland`).

This is evaluated at the same two call sites that already compute rotation live during
drag/drop (`handleMove` and the drag-end handler), and the result is **persisted**,
not recomputed elsewhere:

```
const islandMode = isFreestandingPosition(x, z, roomWidthM, roomDepthM, mod.options.islandMode ?? false);
const rotation = moveMode.fixed || islandMode ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
```

`islandMode` is stored as `options.islandMode?: boolean` (lives in the free-form
`options` JSON, same reasoning as the existing `locked` field: no backend migration
needed). Only `lower`/`tower`/`corner` categories are eligible — `upper`/`appliance`
are unaffected.

Everything downstream (inspector field visibility, back-face rendering, countertop
back overhang) reads this stored flag directly. Nothing needs room dimensions plumbed
through to it — `calculateKitchenMaterials` in `kitchenData.ts`, in particular, doesn't
receive room width/depth today and won't need to.

## Back face: data model

Extend the existing `BackPanelMode` union (`types/kitchen.ts`) with two new values:

```
export type BackPanelMode = "interior" | "exterior" | "lambrin" | "espejo" | "puertas" | "alacena";
```

Two new `ModuleOptions` fields, both simple counts (no per-item layout editor — see
Scope):

```
backDoors?: number;    // count, only meaningful when backPanelMaterial === "puertas"
backShelves?: number;  // count, only meaningful when backPanelMaterial === "alacena"
```

Back doors reuse the module's own `doorStyle`, `exteriorMaterial`, `exteriorColor`,
`exteriorTexture`, and `hardwareFinish` — same visual family as the front, just a
second face. Hinge sides default to the same alternating left/right pattern the front
uses when no per-door override is set (no back-specific hinge customization).

`espejo` (mirror) is librero-giratorio-specific and is not offered for island cabinets
in the inspector — the picker shows `interior`/`exterior`/`lambrin`/`puertas`/`alacena`
for island-mode modules.

`barOverhangCm` (existing field, currently only exposed in the inspector for
`desayunador`) is reused as-is for island back overhang — default 0 (flush with the
cabinet back, standard island look), editable once `islandMode` is true.

## Inspector UI

The back-panel selector and `barOverhangCm` field, currently gated to
`module.type === "desayunador" || module.type === "librero_giratorio_espejo"`, change
that gate to `module.options.islandMode === true` (in addition to, not instead of, the
existing type-based cases — desayunador keeps working exactly as it does today). When
`backPanelMaterial` is `"puertas"` or `"alacena"`, a count input for
`backDoors`/`backShelves` appears next to the selector, same pattern as the existing
front `doors`/`shelves` count inputs.

## 3D rendering

`CabinetMesh` (`ModulePreview3D.tsx`) currently renders one face (front: doors/drawers
via `getEffectiveDoors`/`getEffectiveDrawers`) plus a flat back panel keyed off
`backPanelMaterial`. This is extended so that when `backPanelMaterial` is `"puertas"`
or `"alacena"`, instead of a flat panel it renders a second face at -Z built the same
way the front face is (reusing the existing door/shelf mesh components, mirrored),
sized from `backDoors`/`backShelves` instead of `doors`/`shelves`. This is the one
genuinely new chunk of rendering code in this feature — everything else is
threading an existing flag through existing, already-generic code paths.

## Joining island cabinets into a run

No new code. `snapToNeighbor`/`cabinetsSnapCompatible` already snap same-category,
same-height cabinets edge-to-edge purely by geometry, regardless of wall proximity —
verified by reading the current implementation, not assumed. Two island lower cabinets
placed near each other already pull flush together exactly like a wall run does.
Countertop run-merging in `addCountertop` (`kitchenData.ts`) already groups by shared
rotation + perpendicular position, so a straight island run already prices as one
continuous countertop. This section of the design is a verification task for the
implementation plan, not a build task.

## Removing `isla_central`

`isla_central` is one entry in the `countertop` category's catalog (alongside
`cubierta`, `barra_desayunadora`, `peninsula`, `cubierta_tarja`, `cubierta_parrilla`,
which are all untouched). Removal touches exactly the 4 files where `isla_central` is
referenced today: its catalog entry and render branch in `ModulePreview3D.tsx`, its
use in `buildSampleKitchen` (`kitchenData.ts`), its type-level references
(`types/kitchen.ts`), and its entry in `KitchenAssemblyScene.tsx`. Its thumbnail file
is deleted too.
