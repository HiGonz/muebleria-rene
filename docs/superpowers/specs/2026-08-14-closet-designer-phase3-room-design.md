# Closet designer phase 3 — room-type áreas — design

Status: approved (chat), ready for implementation planning
Scope: adds `spaceType: "room"` áreas to the closet designer — a 4-wall
walkable space with free camera orbit — alongside the existing niche
type. Builds on `docs/superpowers/specs/2026-08-14-closet-designer-design.md`
§2 (data model, already room-shaped) and §10 (phased plan). Phase 0/1/2
(niche áreas, block stacking, multiple conjuntos + top shelf) are done and
unchanged by this phase.

Explicitly out of scope (deferred further, not designed here):
- Free/island placement of conjuntos inside a room — wall-only for now.
- Wall openings (doors/windows) inside a closet room.
- Camera presets (frontal/plan/isometric) — free orbit only.
- Switching an existing área's `spaceType` after creation.
- Multiple áreas per project, or per-área spaceType mixing.

## 1. Why this shape

The data model (`ClosetArea.space`'s room variant, `ClosetConjunto.z`/
`.rotation`) was already reserved for this phase and needs no changes —
phase 2's plan explicitly deferred mutating `z`/`rotation` to here. The
only real net-new mechanism is: (a) a way to actually create a room área
(today nothing creates one — the builder silently auto-inits a fixed
niche), and (b) wall-aware 2D placement + corner-aware collision, where
phase 1/2 only ever needed 1D placement along a single wall.

Rotation stays restricted to the 4 cardinal values already on the type
(`0 | 90 | 180 | 270`) — conjuntos never rotate freely. That keeps every
footprint an axis-aligned box in room coordinates, so collision detection
needs plain AABB overlap, not oriented-rectangle math.

## 2. Wall convention

Matches kitchen's existing rotation-to-wall convention (see
`KitchenAssemblyScene.tsx`'s `wallFlushXZ` comment) so nothing here reads
as an arbitrary new mapping:

| rotation | wall | pinned coord | free coord (slides) |
|---|---|---|---|
| 0 | north | `z = 0` | `x` |
| 180 | south | `z = depth` | `x` |
| 90 | west | `x = 0` | `z` |
| 270 | east | `x = width` | `z` |

A conjunto's `x`/`z` pair always has one axis pinned to its wall and the
other free; which axis is which is derived from `rotation`, never stored
separately.

## 3. Área creation

Today `ClosetBuilder.tsx` calls `initNiche(300, 240, 60)` unconditionally
the first time `hasHydrated && !project`. This phase replaces that
silent call with a small creation screen shown at the same gate: a type
toggle (Nicho / Cuarto) plus the matching dimension fields (width/
height/depth for nicho; width/depth/ceilingHeight for cuarto), a "Crear"
button. Picking a type calls the matching store action:

- `initNiche(widthCm, heightCm, depthCm)` — unchanged, already exists.
- `initRoom(widthCm, depthCm, ceilingHeightCm)` — new, mirrors `initNiche`:
  builds a `"room"` área via `buildNewArea` with one starting conjunto
  (`buildNewConjunto(0, 0, 0)`, i.e. north wall, x=0).

`ClosetBuilder.tsx` and `ClosetAssemblyScene.tsx` currently both guard
with `if (!area || !isNicheSpace(area.space)) return null` — a leftover
from phase 1 when room didn't exist yet. Both guards become real
branches: niche keeps its current rendering path unchanged, room gets
the new path described below. `ClosetModuleStackEditor`'s `maxHeightCm`
prop, currently `area.space.height`, becomes `area.space.height ??
area.space.ceilingHeight` (or an equivalent narrow) for room áreas.

## 4. Room scene + camera

A fresh, closet-owned `RoomBackdrop` (parallel name to the existing
`NicheBackdrop`, not a shared component) replaces kitchen's much heavier
`RoomBoundary`: 4 plain wall planes positioned at the room's extents plus
a floor plane, sized from `width`/`depth`/`ceilingHeight` — no wall
thickness, no openings, no dimension-line overlay. `ClosetAssemblyScene`
branches on `area.spaceType`: niche keeps its existing fixed-distance
framing camera; room uses the same `Canvas camera={{position, fov}}` +
`<OrbitControls target=... />` pattern niche already uses today (no
`CameraRig` — niche doesn't use one either), just with unrestricted
rotation, a target at the room's center, and an initial position
elevated and pulled back looking inward. No camera-position persistence,
matching niche's own current behavior (it has none) — this keeps the
phase free of any new import from `KitchenAssemblyScene.tsx`, dropping
the camera-persistence-trio reuse this section originally proposed, once
it was clear niche's own camera already works fine without it.

## 5. Conjunto placement, drag, and collision

**Footprint box** — `conjuntoBox(alongWallCm, rotation, widthCm, depthCm,
roomWidthCm, roomDepthCm)`, new in `closetData.ts`, returns `{minX, maxX,
minZ, maxZ}` in room coordinates per the pinned/free split from §2. Its
overlap test (`closetBoxesOverlap`) is written fresh in `closetData.ts`
rather than importing kitchen's `boxesOverlap` — `closetData.ts` has zero
component-layer imports today (only from `types/closet.ts`), and a
services-file-importing-a-`components/3d` `.tsx` file would invert that
layering for a 5-line tolerance check that isn't worth the coupling. This
is still what makes collision corner-aware: two conjuntos on adjacent
walls just produce two boxes compared like any other pair.

**Wall selection during drag** — fresh, closet-owned
`nearestWallForConjunto(xCm, zCm, roomWidthCm, roomDepthCm)`, simpler than
kitchen's `nearestWallRotation` (no island-mode branch, no mount height):
compares the floor-raycast point's distance to each of the 4 walls,
returns the matching rotation; ties (e.g. a point near a corner,
equidistant between two walls) resolve to whichever wall the conjunto is
already on, so hovering near a corner doesn't flicker the target wall
mid-drag. `useConjuntoDrag` (existing hook in
`ClosetAssemblyScene.tsx`) extends its floor-raycast handler to recompute
the target wall on every pointer move (so dragging from the north wall
toward the east wall reassigns mid-drag, matching kitchen's wall-mounted
module behavior) and derive the free-axis position from the grab offset
on whichever axis is currently free for that wall.

**Placement resolution on release** — `findNearestFreeConjuntoX`'s
outward 1D search generalizes to `findNearestFreeWallPosition(targetCm,
conjunto, rotation, roomWidthCm, roomDepthCm, otherConjuntos)`: same
outward-search-in-both-directions shape, but each candidate is tested via
`conjuntoBox`/`boxesOverlap` against every other conjunto in the área
regardless of which wall it's on (not just same-wall ones, unlike phase
2's same-wall-only `findNearestFreeConjuntoX` which niche still uses
as-is). Falls back the same way phase 2 does: if truly nothing on that
wall fits, the conjunto doesn't move.

**Rendering** — a conjunto's modules stay packed in local wall-space via
the unchanged `stackAlongAxis`. Each module's world position is computed
directly via a fresh `wallLocalToWorldM(rotation, alongWallCm,
packOffsetCm, depthOffsetCm, roomWidthCm, roomDepthCm)` — a 4-way switch
on the cardinal rotation, one obvious case per wall (e.g. west wall: the
pack offset runs along world `z`, the depth offset runs along world `x`
starting from `x=0`) — extending the same explicit-world-coordinates
style `ConjuntoLayer` already uses for niche, rather than introducing a
rotated-group transform: a single Y-axis rotation matrix necessarily
mixes the two local axes' signs (confirmed by hand-deriving it against
kitchen's `rotateLocal` matrix while drafting this plan), which is easy
to get subtly wrong and hard to eyeball-verify, whereas four independent
per-wall formulas are each trivially correct by inspection and cheap to
unit-test with concrete numbers. `ConjuntoLayer` branches on `spaceType`
to pick the niche (existing, x-only) or room (new, wall+free-axis) drag
handler, but both funnel into the same `onConjuntoMove` store callback —
extended to `updateConjuntoXZRotation(conjuntoId, xCm, zCm, rotation)`
(niche's call site keeps passing the conjunto's existing `z`/`rotation`
unchanged, i.e. `0`/`0`, so it's a strict superset of `updateConjuntoX`,
which gets removed rather than kept alongside the new action).

## 6. Testing

Unit tests (mirroring phase 2's plan-file style) for the new pure
functions in `closetData.ts`: `conjuntoBox` (pinned/free axis split per
wall), `nearestWallForConjunto` (all 4 quadrants + near-corner
ambiguity), `findNearestFreeWallPosition` (same-wall overlap, cross-wall
corner overlap, no-fit fallback). Manual verification in-browser for the
área-creation screen and drag/reassign-wall interaction — no automated
3D/visual test exists elsewhere in this codebase either.
