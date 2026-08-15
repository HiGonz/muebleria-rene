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
framing camera; room uses `OrbitControls` with unrestricted rotation,
target at the room's center `[width/200, ceilingHeight/200, depth/200]`,
initial camera position elevated and pulled back looking inward. Reuses
the already-exported `CameraRig` and camera-persistence trio
(`cameraStorageKey`/`readPersistedCameraView`/`createDebouncedCameraWriter`)
per the original spec's §1 — only the initial position/target expressions
are closet-room-specific, not imported from kitchen.

## 5. Conjunto placement, drag, and collision

**Footprint box** — `conjuntoBox(conjunto, xCm, zCm, rotation, depthCm)`,
new in `closetData.ts`, closet-owned (parallel to kitchen's `moduleBox`
but without corner-footprint/mount-height logic that doesn't apply here):
given the pinned/free coordinate split from §2 and the conjunto's own
`conjuntoWidthCm`/max-module-depth, returns `{minX, maxX, minZ, maxZ}` in
room coordinates. The already-exported `boxesOverlap` (generic over any
`{minX,maxX,minZ,maxZ}` shape, no kitchen-specific typing) is reused
as-is to test two conjunto boxes for overlap — this is what makes
collision corner-aware for free: two conjuntos on adjacent walls just
produce two boxes that get compared like any other pair.

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
the unchanged `stackAlongAxis`; the whole conjunto renders as one
`<group position={...} rotation-y={...}>` using the already-exported
`rotateLocal` for the position math, rather than computing each module's
world coordinates individually. `ConjuntoLayer` branches on `spaceType`
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
