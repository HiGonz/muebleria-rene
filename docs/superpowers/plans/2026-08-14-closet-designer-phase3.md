# Closet Designer Phase 3 (Room-Type Áreas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a closet project use a `"room"` área — a 4-wall walkable space with free camera orbit — as an alternative to the existing niche área, with conjuntos attaching to one of the 4 walls (sliding along it, reassignable to another wall by dragging) and corner-aware collision between conjuntos on different walls.

**Architecture:** Rotation stays restricted to the 4 cardinal values already on `ClosetConjunto` (`0|90|180|270`), so every conjunto footprint is a plain axis-aligned box in room coordinates — collision is AABB overlap, not oriented-rectangle math. A conjunto's `x`/`z` pair always has one axis pinned to its wall (derived from rotation, never read for that axis) and one free (user-controlled, slides along the wall); `findNearestFreeConjuntoX`'s phase-2 same-wall 1D search generalizes to a same-shaped 1D search whose overlap test checks every other conjunto's full room-space box, regardless of wall — this is what makes collision corner-aware for free. Rendering computes each module's world position directly per wall (4 independent, individually-obvious formulas) rather than through a rotation-matrix transform, which was checked by hand against kitchen's own rotation formula while drafting the design and found to mix the two local axes' signs in a way that's easy to get subtly wrong.

**Tech Stack:** Next.js 16, React Three Fiber / `@react-three/drei`, Zustand 5, TypeScript. No frontend test runner exists in this repo. Pure logic (Task 1) is verified with real executable assertions via `npx tsx`. Everything else is verified with `npx tsc --noEmit` plus a manual smoke check.

**Spec:** `docs/superpowers/specs/2026-08-14-closet-designer-phase3-room-design.md` (full spec for this phase — also see `docs/superpowers/specs/2026-08-14-closet-designer-design.md` §2/§10 for the original phased plan this continues)

## Global Constraints

- Still fully independent from kitchen — no new imports from `store/useKitchenStore.ts`, `types/kitchen.ts`, `services/kitchenData.ts`, or any `components/3d/*Kitchen*` file in this plan (the design originally proposed reusing camera-persistence/`boxesOverlap` from `KitchenAssemblyScene.tsx`; both were dropped during planning once a same-pattern, closet-owned version turned out equally simple — see spec's amended §4/§5).
- Conjunto rotation is always exactly one of `0 | 90 | 180 | 270` (`ClosetWallRotation`) — never a freeform angle. Every footprint stays axis-aligned.
- Wall convention (fixed, do not invent a different mapping): `0`=north (`z=0`, free axis `x`), `180`=south (`z=roomDepth`, free axis `x`), `90`=west (`x=0`, free axis `z`), `270`=east (`x=roomWidth`, free axis `z`).
- Conjuntos in a room attach to exactly one wall and slide along it; free/island placement inside a room is out of scope for this phase.
- No wall openings, no camera position/orbit presets, no switching an existing área's `spaceType` after creation, no multiple áreas per project — all explicitly out of scope per the spec.
- Every new module-mutating or conjunto-mutating store action continues routing through `updateModuleInProject`/`updateConjuntoInProject`/`updateAreaInProject` (already established in phase 2) — no inline `areas.map(...).conjuntos.map(...)` traversals added elsewhere in the store.

---

### Task 1: Room wall geometry + collision math

**Files:**
- Modify: `frontend/types/closet.ts`
- Modify: `frontend/services/closetData.ts`

**Interfaces:**
- Consumes: `ClosetConjunto` (from `types/closet.ts`, already exists), `stackAlongAxis`, `conjuntoWidthCm`, `findNearestFreeConjuntoX` (already in `closetData.ts`, unchanged).
- Produces: `ClosetWallRotation` (type, from `types/closet.ts`), `wallLengthCm(rotation, roomWidthCm, roomDepthCm): number`, `conjuntoAlongWallCm(conjunto): number`, `conjuntoDepthCm(conjunto): number`, `ConjuntoBox`, `conjuntoBox(alongWallCm, rotation, widthCm, depthCm, roomWidthCm, roomDepthCm): ConjuntoBox`, `closetBoxesOverlap(a, b): boolean`, `nearestWallForConjunto(xCm, zCm, roomWidthCm, roomDepthCm, currentRotation): ClosetWallRotation`, `findNearestFreeWallPosition(targetAlongWallCm, rotation, widthCm, depthCm, roomWidthCm, roomDepthCm, otherBoxes): number | null`, `wallLocalToWorldCm(rotation, alongWallCm, packOffsetCm, depthOffsetCm, roomWidthCm, roomDepthCm): {xCm, zCm}`. Tasks 2, 3, and 4 consume these.

- [ ] **Step 1: Add the `ClosetWallRotation` type and use it for `ClosetConjunto.rotation`**

In `frontend/types/closet.ts`, line 4 currently reads:
```ts
export type ClosetSpaceType = "niche" | "room";
```
Add a new type export right after it:
```ts
export type ClosetSpaceType = "niche" | "room";

// A conjunto's rotation is always one of the 4 cardinal directions — it
// never rotates freely. This keeps every conjunto footprint axis-aligned
// in room coordinates, so collision math is plain AABB overlap.
export type ClosetWallRotation = 0 | 90 | 180 | 270;
```

Then, in the same file, line 27 currently reads:
```ts
  x: number; z: number; rotation: 0 | 90 | 180 | 270; // cm/degrees — placement within the área
```
Replace with:
```ts
  x: number; z: number; rotation: ClosetWallRotation; // cm/degrees — placement within the área
```

- [ ] **Step 2: Add `ClosetWallRotation` to the `closetData.ts` type import**

In `frontend/services/closetData.ts`, lines 1-5 currently read:
```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, ClosetTopShelf, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
```
Replace with:
```ts
import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, ClosetTopShelf, ClosetWallRotation, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";
```

- [ ] **Step 3: Append the room wall geometry and collision functions**

At the end of `frontend/services/closetData.ts` (after the existing `layoutTopShelf` function), append:

```ts

// ─── Room wall geometry (phase 3 — a room área has 4 walls; a conjunto
// attaches to exactly one, sliding along it) ────────────────────────────────
//
// Rotation-to-wall convention:
//   0   = north wall (z=0),         along-wall axis = x
//   180 = south wall (z=roomDepth), along-wall axis = x
//   90  = west wall  (x=0),         along-wall axis = z
//   270 = east wall  (x=roomWidth), along-wall axis = z

export function wallLengthCm(rotation: ClosetWallRotation, roomWidthCm: number, roomDepthCm: number): number {
  return rotation === 0 || rotation === 180 ? roomWidthCm : roomDepthCm;
}

// A conjunto's x/z pair always has one axis pinned to its wall (derived,
// never read) and one free (stored, user-controlled) — this returns
// whichever of x/z is currently the free one for the conjunto's own
// rotation.
export function conjuntoAlongWallCm(conjunto: ClosetConjunto): number {
  return conjunto.rotation === 0 || conjunto.rotation === 180 ? conjunto.x : conjunto.z;
}

// Perpendicular extent (cm) a conjunto's modules stick out from its wall —
// the deepest module, same value the top shelf mesh uses for its own depth.
export function conjuntoDepthCm(conjunto: ClosetConjunto): number {
  return conjunto.modules.reduce((max, m) => Math.max(max, m.depth), 0);
}

export interface ConjuntoBox { minX: number; maxX: number; minZ: number; maxZ: number }

// World-space AABB (cm) for a conjunto placed on one of a room's 4 walls.
// Rotation is always a cardinal (0/90/180/270), so this is always
// axis-aligned — no oriented-rectangle math needed.
export function conjuntoBox(
  alongWallCm: number, rotation: ClosetWallRotation,
  widthCm: number, depthCm: number, roomWidthCm: number, roomDepthCm: number,
): ConjuntoBox {
  switch (rotation) {
    case 0: return { minX: alongWallCm, maxX: alongWallCm + widthCm, minZ: 0, maxZ: depthCm };
    case 180: return { minX: alongWallCm, maxX: alongWallCm + widthCm, minZ: roomDepthCm - depthCm, maxZ: roomDepthCm };
    case 90: return { minX: 0, maxX: depthCm, minZ: alongWallCm, maxZ: alongWallCm + widthCm };
    case 270: return { minX: roomWidthCm - depthCm, maxX: roomWidthCm, minZ: alongWallCm, maxZ: alongWallCm + widthCm };
  }
}

// Same tolerance rationale as CONJUNTO_OVERLAP_TOLERANCE_CM above, in 2D.
// Written fresh rather than importing kitchen's boxesOverlap — closetData.ts
// has zero component-layer imports today, and a services file importing a
// components/3d .tsx file for a 5-line tolerance check isn't worth the
// layering inversion.
const CONJUNTO_BOX_OVERLAP_TOLERANCE_CM = 0.3;

export function closetBoxesOverlap(a: ConjuntoBox, b: ConjuntoBox): boolean {
  return (
    a.minX < b.maxX - CONJUNTO_BOX_OVERLAP_TOLERANCE_CM && a.maxX > b.minX + CONJUNTO_BOX_OVERLAP_TOLERANCE_CM &&
    a.minZ < b.maxZ - CONJUNTO_BOX_OVERLAP_TOLERANCE_CM && a.maxZ > b.minZ + CONJUNTO_BOX_OVERLAP_TOLERANCE_CM
  );
}

// Which wall a floor point is closest to. Ties (a point near a corner,
// equidistant between two walls) resolve to the conjunto's current wall,
// so hovering near a corner mid-drag doesn't flicker the target wall.
export function nearestWallForConjunto(
  xCm: number, zCm: number, roomWidthCm: number, roomDepthCm: number, currentRotation: ClosetWallRotation,
): ClosetWallRotation {
  const distances: Array<{ rotation: ClosetWallRotation; dist: number }> = [
    { rotation: 0, dist: zCm },
    { rotation: 180, dist: roomDepthCm - zCm },
    { rotation: 90, dist: xCm },
    { rotation: 270, dist: roomWidthCm - xCm },
  ];
  const minDist = Math.min(...distances.map((d) => d.dist));
  const tieToleranceCm = 0.01;
  const nearest = distances.filter((d) => d.dist <= minDist + tieToleranceCm);
  return nearest.some((d) => d.rotation === currentRotation) ? currentRotation : nearest[0].rotation;
}

// Same outward-search shape as findNearestFreeConjuntoX above, generalized
// to test the moving conjunto's full room-space AABB against every other
// conjunto in the área regardless of which wall it's on — this is what
// makes collision corner-aware: two conjuntos on adjacent walls are just
// two boxes compared like any other pair.
export function findNearestFreeWallPosition(
  targetAlongWallCm: number, rotation: ClosetWallRotation,
  widthCm: number, depthCm: number, roomWidthCm: number, roomDepthCm: number,
  otherBoxes: ConjuntoBox[],
): number | null {
  const lengthCm = wallLengthCm(rotation, roomWidthCm, roomDepthCm);
  const maxAlongWall = lengthCm - widthCm;
  if (maxAlongWall < 0) return null;
  const clamp = (v: number) => Math.min(Math.max(v, 0), maxAlongWall);
  const overlapsAny = (alongWallCm: number) => {
    const box = conjuntoBox(alongWallCm, rotation, widthCm, depthCm, roomWidthCm, roomDepthCm);
    return otherBoxes.some((other) => closetBoxesOverlap(box, other));
  };

  const clamped = clamp(targetAlongWallCm);
  if (!overlapsAny(clamped)) return clamped;

  const stepCm = 1;
  for (let offset = stepCm; offset <= lengthCm; offset += stepCm) {
    for (const dir of [1, -1] as const) {
      const candidate = clamp(targetAlongWallCm + dir * offset);
      if (!overlapsAny(candidate)) return candidate;
    }
  }
  return null;
}

// World position (cm) for one module inside a room-attached conjunto.
// packOffsetCm/depthOffsetCm are the module's own local offsets (from
// stackAlongAxis and module.depth/2, same values niche already uses) —
// this just routes them onto whichever world axes the conjunto's wall
// implies. Four independent per-wall cases, each correct by inspection,
// rather than a single rotation-matrix transform (which mixes the two
// local axes' signs and is much easier to get subtly wrong).
export function wallLocalToWorldCm(
  rotation: ClosetWallRotation, alongWallCm: number, packOffsetCm: number, depthOffsetCm: number,
  roomWidthCm: number, roomDepthCm: number,
): { xCm: number; zCm: number } {
  switch (rotation) {
    case 0: return { xCm: alongWallCm + packOffsetCm, zCm: depthOffsetCm };
    case 180: return { xCm: alongWallCm + packOffsetCm, zCm: roomDepthCm - depthOffsetCm };
    case 90: return { xCm: depthOffsetCm, zCm: alongWallCm + packOffsetCm };
    case 270: return { xCm: roomWidthCm - depthOffsetCm, zCm: alongWallCm + packOffsetCm };
  }
}
```

- [ ] **Step 4: Write and run a throwaway verification script**

Create `frontend/scripts/verify-closet-room.ts`:
```ts
import {
  wallLengthCm, conjuntoAlongWallCm, conjuntoDepthCm, conjuntoBox, closetBoxesOverlap,
  nearestWallForConjunto, findNearestFreeWallPosition, wallLocalToWorldCm,
  buildNewConjunto, buildNewClosetModule,
} from "../services/closetData";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok: ${msg}`);
}

const ROOM_W = 400;
const ROOM_D = 300;

// wallLengthCm
assert(wallLengthCm(0, ROOM_W, ROOM_D) === 400, "north/south wall length is the room's width");
assert(wallLengthCm(90, ROOM_W, ROOM_D) === 300, "west/east wall length is the room's depth");

// conjuntoAlongWallCm / conjuntoDepthCm
const northConjunto = buildNewConjunto(50, 999, 0);
assert(conjuntoAlongWallCm(northConjunto) === 50, "north wall (rotation 0): along-wall axis is x");
const westConjunto = buildNewConjunto(999, 70, 90);
assert(conjuntoAlongWallCm(westConjunto) === 70, "west wall (rotation 90): along-wall axis is z");
const m60 = buildNewClosetModule(80, 60);
const m45 = buildNewClosetModule(80, 45);
northConjunto.modules = [m60, m45];
assert(conjuntoDepthCm(northConjunto) === 60, "conjunto depth is the deepest module's depth (60, not 45)");
assert(conjuntoDepthCm(buildNewConjunto(0, 0, 0)) === 0, "an empty conjunto has zero depth");

// conjuntoBox — one case per wall
assert(JSON.stringify(conjuntoBox(50, 0, 100, 60, ROOM_W, ROOM_D)) === JSON.stringify({ minX: 50, maxX: 150, minZ: 0, maxZ: 60 }), "north wall box");
assert(JSON.stringify(conjuntoBox(50, 180, 100, 60, ROOM_W, ROOM_D)) === JSON.stringify({ minX: 50, maxX: 150, minZ: 240, maxZ: 300 }), "south wall box");
assert(JSON.stringify(conjuntoBox(50, 90, 100, 60, ROOM_W, ROOM_D)) === JSON.stringify({ minX: 0, maxX: 60, minZ: 50, maxZ: 150 }), "west wall box");
assert(JSON.stringify(conjuntoBox(50, 270, 100, 60, ROOM_W, ROOM_D)) === JSON.stringify({ minX: 340, maxX: 400, minZ: 50, maxZ: 150 }), "east wall box");

// closetBoxesOverlap — corner-aware: north-wall box vs west-wall box near the same corner
const northNearCorner = conjuntoBox(0, 0, 100, 60, ROOM_W, ROOM_D);
const westNearCorner = conjuntoBox(0, 90, 100, 60, ROOM_W, ROOM_D);
assert(closetBoxesOverlap(northNearCorner, westNearCorner) === true, "boxes on adjacent walls that share the corner region overlap");
const northFar = conjuntoBox(300, 0, 80, 60, ROOM_W, ROOM_D);
assert(closetBoxesOverlap(northFar, westNearCorner) === false, "boxes on adjacent walls that don't share any region don't overlap");

// nearestWallForConjunto
assert(nearestWallForConjunto(200, 10, ROOM_W, ROOM_D, 0) === 0, "point near the north wall resolves to north");
assert(nearestWallForConjunto(200, 290, ROOM_W, ROOM_D, 0) === 180, "point near the south wall resolves to south");
assert(nearestWallForConjunto(10, 150, ROOM_W, ROOM_D, 0) === 90, "point near the west wall resolves to west");
assert(nearestWallForConjunto(390, 150, ROOM_W, ROOM_D, 0) === 270, "point near the east wall resolves to east");
assert(nearestWallForConjunto(0, 0, ROOM_W, ROOM_D, 90) === 90, "corner tie (north/west equidistant) resolves to the conjunto's current wall (west)");
assert(nearestWallForConjunto(0, 0, ROOM_W, ROOM_D, 0) === 0, "same corner tie resolves to north when that's the current wall instead");

// findNearestFreeWallPosition
assert(findNearestFreeWallPosition(50, 0, 60, 40, ROOM_W, ROOM_D, []) === 50, "no obstacles: target position is used as-is");
assert(findNearestFreeWallPosition(1000, 0, 60, 40, ROOM_W, ROOM_D, []) === 340, "target beyond the wall clamps to the max valid position (400-60=340)");
assert(findNearestFreeWallPosition(0, 0, 500, 40, ROOM_W, ROOM_D, []) === null, "a conjunto wider than the wall itself has no valid position");
const sameWallObstacle = [conjuntoBox(0, 0, 100, 40, ROOM_W, ROOM_D)];
const sameWallResolved = findNearestFreeWallPosition(50, 0, 60, 40, ROOM_W, ROOM_D, sameWallObstacle);
assert(sameWallResolved !== null && sameWallResolved >= 100, `same-wall collision resolves clear of the obstacle, got ${sameWallResolved}`);
const cornerObstacle = [conjuntoBox(0, 90, 100, 40, ROOM_W, ROOM_D)]; // west wall, near the north-west corner
const cornerResolved = findNearestFreeWallPosition(10, 0, 60, 40, ROOM_W, ROOM_D, cornerObstacle);
assert(cornerResolved !== null, "corner collision against a different-wall conjunto still resolves to a position");
const resolvedBox = conjuntoBox(cornerResolved as number, 0, 60, 40, ROOM_W, ROOM_D);
assert(!closetBoxesOverlap(resolvedBox, cornerObstacle[0]), `resolved position (${cornerResolved}) is actually clear of the cross-wall obstacle`);

// wallLocalToWorldCm — one case per wall
assert(JSON.stringify(wallLocalToWorldCm(0, 50, 30, 25, ROOM_W, ROOM_D)) === JSON.stringify({ xCm: 80, zCm: 25 }), "north wall local-to-world");
assert(JSON.stringify(wallLocalToWorldCm(180, 50, 30, 25, ROOM_W, ROOM_D)) === JSON.stringify({ xCm: 80, zCm: 275 }), "south wall local-to-world");
assert(JSON.stringify(wallLocalToWorldCm(90, 50, 30, 25, ROOM_W, ROOM_D)) === JSON.stringify({ xCm: 25, zCm: 80 }), "west wall local-to-world");
assert(JSON.stringify(wallLocalToWorldCm(270, 50, 30, 25, ROOM_W, ROOM_D)) === JSON.stringify({ xCm: 375, zCm: 80 }), "east wall local-to-world");

console.log("All room wall geometry checks passed.");
```

Run (from `frontend/`):
```bash
npx tsx scripts/verify-closet-room.ts
```
Expected: every line prints `ok: ...`, ending with `All room wall geometry checks passed.` and exit code 0. If any assertion throws, fix `closetData.ts` (not the script) and re-run.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm frontend/scripts/verify-closet-room.ts
```

- [ ] **Step 6: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/types/closet.ts frontend/services/closetData.ts
git commit -m "feat(closet): room wall geometry and corner-aware collision math"
```

---

### Task 2: Store — room área creation + wall-aware conjunto placement

**Files:**
- Modify: `frontend/store/useClosetStore.ts`

**Interfaces:**
- Consumes: `buildNewArea`, `buildNewConjunto` (already in `closetData.ts`, unchanged), `updateConjuntoInProject`, `updateAreaInProject` (already in this file, unchanged), `ClosetWallRotation` (from Task 1).
- Produces: `initRoom(widthCm, depthCm, ceilingHeightCm): void`, `updateConjuntoXZRotation(conjuntoId, xCm, zCm, rotation): void` (replaces `updateConjuntoX`, which is removed). Tasks 3 and 4 consume both.

- [ ] **Step 1: Add `initRoom` next to `initNiche`**

In `frontend/store/useClosetStore.ts`, the `ClosetStore` interface currently declares (line 78):
```ts
  initNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
```
Replace with:
```ts
  initNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
  initRoom: (widthCm: number, depthCm: number, ceilingHeightCm: number) => void;
```

The implementation (lines 145-154) currently reads:
```ts
      initNiche: (widthCm, heightCm, depthCm) => {
        const area = buildNewArea("Closet", "niche", { width: widthCm, height: heightCm, depth: depthCm });
        const firstConjunto = buildNewConjunto(0, 0);
        area.conjuntos = [firstConjunto];
        set({
          project: { id: null, clientName: "", projectName: "Closet nuevo", notes: "", areas: [area] },
          selectedModuleId: null,
          selectedConjuntoId: firstConjunto.id,
        });
      },
```
Add right after it (same indentation level, inside the same object):
```ts

      initRoom: (widthCm, depthCm, ceilingHeightCm) => {
        const area = buildNewArea("Closet", "room", { width: widthCm, depth: depthCm, ceilingHeight: ceilingHeightCm });
        const firstConjunto = buildNewConjunto(0, 0, 0);
        area.conjuntos = [firstConjunto];
        set({
          project: { id: null, clientName: "", projectName: "Closet nuevo", notes: "", areas: [area] },
          selectedModuleId: null,
          selectedConjuntoId: firstConjunto.id,
        });
      },
```

- [ ] **Step 2: Replace `updateConjuntoX` with `updateConjuntoXZRotation`**

The interface currently declares (line 92):
```ts
  updateConjuntoX: (conjuntoId: string, xCm: number) => void;
```
Replace with:
```ts
  updateConjuntoXZRotation: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
```

The implementation (lines 285-289) currently reads:
```ts
      updateConjuntoX: (conjuntoId, xCm) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateConjuntoInProject(s.project, conjuntoId, (c) => ({ ...c, x: xCm })) };
        }),
```
Replace with:
```ts
      updateConjuntoXZRotation: (conjuntoId, xCm, zCm, rotation) =>
        set((s) => {
          if (!s.project) return {};
          return { project: updateConjuntoInProject(s.project, conjuntoId, (c) => ({ ...c, x: xCm, z: zCm, rotation })) };
        }),
```

- [ ] **Step 3: Fix `addConjunto`'s default placement for rooms with mixed-wall conjuntos**

`addConjunto` always places a brand-new (empty) conjunto on the north wall — that's unchanged. But it currently computes "how far right to place it" by reducing over `c.x + conjuntoWidthCm(c)` across *every* conjunto in the área, regardless of which wall each one is on; in a room, a conjunto on the west/east wall has an unrelated `x` value (its along-wall axis is `z`, not `x` — see `conjuntoAlongWallCm`), so mixing it into a north-wall placement calculation is wrong. It currently reads (lines 255-267):
```ts
      addConjunto: () =>
        set((s) => {
          if (!s.project) return {};
          const area = s.project.areas[0];
          if (!area) return {};
          const rightmostEndCm = area.conjuntos.reduce((max, c) => Math.max(max, c.x + conjuntoWidthCm(c)), 0);
          const newConjunto = buildNewConjunto(area.conjuntos.length ? rightmostEndCm + 10 : 0, 0);
          return {
            project: updateAreaInProject(s.project, area.id, (a) => ({ ...a, conjuntos: [...a.conjuntos, newConjunto] })),
            selectedConjuntoId: newConjunto.id,
            selectedModuleId: null,
          };
        }),
```
Replace with:
```ts
      addConjunto: () =>
        set((s) => {
          if (!s.project) return {};
          const area = s.project.areas[0];
          if (!area) return {};
          // A new conjunto always starts on the north wall (rotation 0) —
          // only conjuntos already on that same wall are relevant to "how
          // far right is already occupied" (a west/east-wall conjunto's x
          // isn't a north-wall offset at all, see conjuntoAlongWallCm).
          const northWallConjuntos = area.conjuntos.filter((c) => c.rotation === 0);
          const rightmostEndCm = northWallConjuntos.reduce((max, c) => Math.max(max, c.x + conjuntoWidthCm(c)), 0);
          const newConjunto = buildNewConjunto(northWallConjuntos.length ? rightmostEndCm + 10 : 0, 0, 0);
          return {
            project: updateAreaInProject(s.project, area.id, (a) => ({ ...a, conjuntos: [...a.conjuntos, newConjunto] })),
            selectedConjuntoId: newConjunto.id,
            selectedModuleId: null,
          };
        }),
```

- [ ] **Step 4: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: errors in `ClosetAssemblyScene.tsx` and `ClosetBuilder.tsx` about `updateConjuntoX` no longer existing and `onConjuntoMove` prop mismatches — that's expected until Tasks 3 and 4 update those files. Confirm there are no errors inside `useClosetStore.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add frontend/store/useClosetStore.ts
git commit -m "feat(closet): room área creation and wall-aware conjunto placement action"
```

---

### Task 3: Scene — room backdrop, camera, and wall-aware drag/render

**Files:**
- Modify: `frontend/components/3d/ClosetAssemblyScene.tsx`

**Interfaces:**
- Consumes: everything from Task 1 (`conjuntoAlongWallCm`, `conjuntoDepthCm`, `conjuntoBox`, `closetBoxesOverlap`, `nearestWallForConjunto`, `findNearestFreeWallPosition`, `wallLocalToWorldCm`, `wallLengthCm`, `ClosetWallRotation`), Task 2's `updateConjuntoXZRotation` (via the `onConjuntoMove` prop, now 4-argument).
- Produces: `ClosetAssemblyScene`'s `onConjuntoMove` prop type becomes `(conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void`. Task 4 (`ClosetBuilder.tsx`) consumes this new prop type.

- [ ] **Step 1: Replace the entire contents of `ClosetAssemblyScene.tsx`**

The full file becomes:

```tsx
"use client";

import { useRef, useState, type RefObject } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box } from "./ModulePreview3D";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import {
  stackAlongAxis, conjuntoWidthCm, conjuntoRange, findNearestFreeConjuntoX, layoutTopShelf,
  conjuntoDepthCm, conjuntoBox, conjuntoAlongWallCm, nearestWallForConjunto, findNearestFreeWallPosition, wallLocalToWorldCm,
} from "@/services/closetData";
import { isNicheSpace, type ClosetConjunto, type ClosetProject, type ClosetWallRotation } from "@/types/closet";

const SHELF_THICKNESS_M = 0.02;
const SHELF_COLOR = "#d4c5b0";

// A niche has no walls to walk around — a plain backdrop panel behind the
// modules plus a floor patch is enough to read as "this is a wall alcove".
function NicheBackdrop({ widthM, heightM, depthM }: { widthM: number; heightM: number; depthM: number }) {
  return (
    <group>
      <mesh position={[widthM / 2, heightM / 2, -0.02]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, heightM + 0.4]} />
        <meshStandardMaterial color="#e5e1d8" />
      </mesh>
      <mesh position={[widthM / 2, -0.005, depthM / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, depthM + 0.4]} />
        <meshStandardMaterial color="#cfcabf" />
      </mesh>
    </group>
  );
}

// A room is a real 4-wall walkable space — plain wall planes (no thickness,
// no openings — a closet room never has doors/windows in it, unlike
// kitchen's RoomBoundary) plus a floor patch sized exactly to the room.
function RoomBackdrop({ widthM, depthM, ceilingHeightM }: { widthM: number; depthM: number; ceilingHeightM: number }) {
  const wallColor = "#e5e1d8";
  const floorColor = "#cfcabf";
  return (
    <group>
      <mesh position={[widthM / 2, -0.005, depthM / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <mesh position={[widthM / 2, ceilingHeightM / 2, 0]} receiveShadow>
        <planeGeometry args={[widthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[widthM / 2, ceilingHeightM / 2, depthM]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[widthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, ceilingHeightM / 2, depthM / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[widthM, ceilingHeightM / 2, depthM / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Niche: 1-DOF drag (unchanged from phase 2) ─────────────────────────────

function useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { camera, gl } = useThree();
  const [dragPreview, setDragPreview] = useState<{ id: string; xCm: number } | null>(null);
  const dragRef = useRef<{ conjuntoId: string; pointerId: number; grabOffsetCm: number } | null>(null);

  const getFloorXCm = (clientX: number, clientY: number): number | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point.x * 100 : null;
  };

  const startDrag = (conjunto: ClosetConjunto, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pointerId = e.nativeEvent.pointerId;
    const floorXCm = getFloorXCm(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (floorXCm === null) return;
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* already captured */ }
    dragRef.current = { conjuntoId: conjunto.id, pointerId, grabOffsetCm: floorXCm - conjunto.x };
    setDragPreview({ id: conjunto.id, xCm: conjunto.x });

    const resolveXCm = (clientX: number, clientY: number): number | null => {
      const state = dragRef.current;
      if (!state) return null;
      const floorX = getFloorXCm(clientX, clientY);
      return floorX === null ? null : floorX - state.grabOffsetCm;
    };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY);
      if (targetXCm !== null) setDragPreview({ id: state.conjuntoId, xCm: targetXCm });
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (controlsRef.current) controlsRef.current.enabled = true;
      dragRef.current = null;
      setDragPreview(null);
    };

    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY) ?? conjunto.x;
      const widthCm = conjuntoWidthCm(conjunto);
      const others = conjuntos.filter((c) => c.id !== state.conjuntoId).map((c) => conjuntoRange(c));
      const resolvedXCm = findNearestFreeConjuntoX(targetXCm, widthCm, areaWidthCm, others);
      if (resolvedXCm !== null) onConjuntoMove(state.conjuntoId, resolvedXCm, conjunto.z, conjunto.rotation);
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function TopShelfMesh({ conjunto, xCm }: { conjunto: ClosetConjunto; xCm: number }) {
  if (!conjunto.topShelf) return null;
  const layout = layoutTopShelf(conjunto.topShelf, conjunto);
  if (!layout) return null;
  const widthM = (layout.xEndCm - layout.xStartCm) / 100;
  const depthM = Math.max(...conjunto.modules.map((m) => m.depth), 0) / 100;
  if (widthM <= 0 || depthM <= 0) return null;
  return (
    <Box
      pos={[xCm / 100 + (layout.xStartCm + layout.xEndCm) / 200, layout.yTopCm / 100 + SHELF_THICKNESS_M / 2, depthM / 2]}
      size={[widthM, SHELF_THICKNESS_M, depthM]}
      color={SHELF_COLOR}
    />
  );
}

function ConjuntoLayer({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { dragPreview, startDrag } = useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove });

  return (
    <>
      {conjuntos.map((conjunto) => {
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
      })}
    </>
  );
}

// ─── Room: wall-aware drag (mid-drag can reassign to another wall) + full
// room-space corner-aware collision ─────────────────────────────────────────

function useRoomConjuntoDrag({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  roomWidthCm: number;
  roomDepthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { camera, gl } = useThree();
  const [dragPreview, setDragPreview] = useState<{ id: string; xCm: number; zCm: number; rotation: ClosetWallRotation } | null>(null);
  const dragRef = useRef<{ conjuntoId: string; pointerId: number; grabOffsetCm: number; rotation: ClosetWallRotation } | null>(null);

  const getFloorPointCm = (clientX: number, clientY: number): { xCm: number; zCm: number } | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? { xCm: point.x * 100, zCm: point.z * 100 } : null;
  };

  const startDrag = (conjunto: ClosetConjunto, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pointerId = e.nativeEvent.pointerId;
    const floorStart = getFloorPointCm(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!floorStart) return;
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* already captured */ }

    const alongWallStartCm = conjuntoAlongWallCm(conjunto);
    const floorAlongWallStartCm = conjunto.rotation === 0 || conjunto.rotation === 180 ? floorStart.xCm : floorStart.zCm;
    dragRef.current = { conjuntoId: conjunto.id, pointerId, grabOffsetCm: floorAlongWallStartCm - alongWallStartCm, rotation: conjunto.rotation };
    setDragPreview({ id: conjunto.id, xCm: conjunto.x, zCm: conjunto.z, rotation: conjunto.rotation });

    const widthCm = conjuntoWidthCm(conjunto);
    const depthCm = conjuntoDepthCm(conjunto);

    // Resolves a live pointer position to a wall + along-wall offset, using
    // whichever wall the pointer is currently nearest — this is what lets a
    // drag reassign the conjunto to a different wall mid-gesture.
    const resolveLive = (clientX: number, clientY: number): { alongWallCm: number; rotation: ClosetWallRotation } | null => {
      const state = dragRef.current;
      if (!state) return null;
      const floorPoint = getFloorPointCm(clientX, clientY);
      if (!floorPoint) return null;
      const rotation = nearestWallForConjunto(floorPoint.xCm, floorPoint.zCm, roomWidthCm, roomDepthCm, state.rotation);
      const floorAlongWallCm = rotation === 0 || rotation === 180 ? floorPoint.xCm : floorPoint.zCm;
      state.rotation = rotation;
      return { alongWallCm: floorAlongWallCm - state.grabOffsetCm, rotation };
    };

    const toXZ = (alongWallCm: number, rotation: ClosetWallRotation): { xCm: number; zCm: number } =>
      rotation === 0 || rotation === 180 ? { xCm: alongWallCm, zCm: conjunto.z } : { xCm: conjunto.x, zCm: alongWallCm };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const live = resolveLive(ev.clientX, ev.clientY);
      if (!live) return;
      setDragPreview({ id: state.conjuntoId, ...toXZ(live.alongWallCm, live.rotation), rotation: live.rotation });
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (controlsRef.current) controlsRef.current.enabled = true;
      dragRef.current = null;
      setDragPreview(null);
    };

    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const live = resolveLive(ev.clientX, ev.clientY) ?? { alongWallCm: alongWallStartCm, rotation: conjunto.rotation };
      const otherBoxes = conjuntos
        .filter((c) => c.id !== state.conjuntoId)
        .map((c) => conjuntoBox(conjuntoAlongWallCm(c), c.rotation, conjuntoWidthCm(c), conjuntoDepthCm(c), roomWidthCm, roomDepthCm));
      const resolvedAlongWallCm = findNearestFreeWallPosition(live.alongWallCm, live.rotation, widthCm, depthCm, roomWidthCm, roomDepthCm, otherBoxes);
      if (resolvedAlongWallCm !== null) {
        const { xCm, zCm } = toXZ(resolvedAlongWallCm, live.rotation);
        onConjuntoMove(state.conjuntoId, xCm, zCm, live.rotation);
      }
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function RoomTopShelfMesh({ conjunto, alongWallCm, rotation, roomWidthCm, roomDepthCm }: {
  conjunto: ClosetConjunto; alongWallCm: number; rotation: ClosetWallRotation; roomWidthCm: number; roomDepthCm: number;
}) {
  if (!conjunto.topShelf) return null;
  const layout = layoutTopShelf(conjunto.topShelf, conjunto);
  if (!layout) return null;
  const depthCm = conjuntoDepthCm(conjunto);
  const widthM = (layout.xEndCm - layout.xStartCm) / 100;
  const depthM = depthCm / 100;
  if (widthM <= 0 || depthM <= 0) return null;
  const centerPackCm = (layout.xStartCm + layout.xEndCm) / 2;
  const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, centerPackCm, depthCm / 2, roomWidthCm, roomDepthCm);
  const alongWallAxisIsX = rotation === 0 || rotation === 180;
  return (
    <Box
      pos={[xCm / 100, layout.yTopCm / 100 + SHELF_THICKNESS_M / 2, zCm / 100]}
      size={alongWallAxisIsX ? [widthM, SHELF_THICKNESS_M, depthM] : [depthM, SHELF_THICKNESS_M, widthM]}
      color={SHELF_COLOR}
    />
  );
}

function RoomConjuntoLayer({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  roomWidthCm: number;
  roomDepthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { dragPreview, startDrag } = useRoomConjuntoDrag({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove });

  return (
    <>
      {conjuntos.map((conjunto) => {
        const preview = dragPreview?.id === conjunto.id ? dragPreview : null;
        const rotation = preview?.rotation ?? conjunto.rotation;
        const alongWallCm = preview ? (rotation === 0 || rotation === 180 ? preview.xCm : preview.zCm) : conjuntoAlongWallCm(conjunto);
        const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => {
              const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, startCm + item.module.width / 2, item.module.depth / 2, roomWidthCm, roomDepthCm);
              return <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100} z={zCm / 100} />;
            })}
            <RoomTopShelfMesh conjunto={conjunto} alongWallCm={alongWallCm} rotation={rotation} roomWidthCm={roomWidthCm} roomDepthCm={roomDepthCm} />
          </group>
        );
      })}
    </>
  );
}

export function ClosetAssemblyScene({ project, onConjuntoMove }: {
  project: ClosetProject;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const area = project.areas[0];
  const controlsRef = useRef<OrbitControlsImpl>(null);
  if (!area) return null;

  if (isNicheSpace(area.space)) {
    const { width, height, depth } = area.space;
    const widthM = width / 100;
    const heightM = height / 100;
    const depthM = depth / 100;
    const dist = Math.max(widthM, heightM, depthM) * 2.2 + 0.6;

    return (
      <div className="relative h-full w-full overflow-hidden bg-surface">
        <Canvas shadows camera={{ position: [widthM / 2, heightM / 2.5, dist], fov: 45 }}>
          <color attach="background" args={["#1c1c28"]} />
          <ambientLight intensity={1} />
          <directionalLight position={[widthM + 2, heightM + 3, depthM + 3]} intensity={1.2} castShadow />
          <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />
          <NicheBackdrop widthM={widthM} heightM={heightM} depthM={depthM} />
          <Grid position={[widthM / 2, -0.004, depthM / 2]} args={[widthM + 1, depthM + 1]} cellColor="#3a3a48" sectionColor="#4a4a58" fadeDistance={10} />
          <ConjuntoLayer conjuntos={area.conjuntos} areaWidthCm={width} controlsRef={controlsRef} onConjuntoMove={onConjuntoMove} />
          <OrbitControls ref={controlsRef} target={[widthM / 2, heightM / 2, 0]} enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>
    );
  }

  const { width, depth, ceilingHeight } = area.space;
  const widthM = width / 100;
  const depthM = depth / 100;
  const ceilingHeightM = ceilingHeight / 100;
  const initialPos: [number, number, number] = [widthM / 2, ceilingHeightM * 0.85, Math.max(widthM, depthM) * 1.1 + depthM / 2];
  const targetPos: [number, number, number] = [widthM / 2, ceilingHeightM / 2, depthM / 2];

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      <Canvas shadows camera={{ position: initialPos, fov: 50 }}>
        <color attach="background" args={["#1c1c28"]} />
        <ambientLight intensity={1} />
        <directionalLight position={[widthM + 2, ceilingHeightM + 3, depthM + 3]} intensity={1.2} castShadow />
        <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />
        <RoomBackdrop widthM={widthM} depthM={depthM} ceilingHeightM={ceilingHeightM} />
        <Grid position={[widthM / 2, 0.001, depthM / 2]} args={[widthM, depthM]} cellColor="#3a3a48" sectionColor="#4a4a58" fadeDistance={10} />
        <RoomConjuntoLayer conjuntos={area.conjuntos} roomWidthCm={width} roomDepthCm={depth} controlsRef={controlsRef} onConjuntoMove={onConjuntoMove} />
        <OrbitControls ref={controlsRef} target={targetPos} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: remaining errors are only in `ClosetBuilder.tsx` (`updateConjuntoX` no longer exists, `onConjuntoMove` arity) — fixed in Task 4. No errors inside `ClosetAssemblyScene.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/3d/ClosetAssemblyScene.tsx
git commit -m "feat(closet): room backdrop, free-orbit camera, and wall-aware conjunto drag/render"
```

---

### Task 4: UI — área creation screen + builder wiring

**Files:**
- Create: `frontend/components/closet/ClosetAreaCreationScreen.tsx`
- Modify: `frontend/components/closet/ClosetBuilder.tsx`

**Interfaces:**
- Consumes: `useClosetStore`'s `initNiche`, `initRoom`, `updateConjuntoXZRotation` (Task 2), `ClosetAssemblyScene` (Task 3), `NumericField` (already exists, unchanged), `isNicheSpace` (already exists, unchanged).
- Produces: `ClosetAreaCreationScreen({ onCreateNiche, onCreateRoom })` — a standalone component, not consumed elsewhere in this plan.

- [ ] **Step 1: Create the área creation screen**

Create `frontend/components/closet/ClosetAreaCreationScreen.tsx`:
```tsx
"use client";

import { useState } from "react";
import { NumericField } from "./NumericField";

const DEFAULT_NICHE = { width: 300, height: 240, depth: 60 };
const DEFAULT_ROOM = { width: 300, depth: 300, ceilingHeight: 240 };

const fieldClass = "w-20 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory";

// Shown instead of the builder whenever there's no draft yet (first-ever
// visit, or the draft was cleared) — replaces the old silent auto-init of a
// fixed niche, which never gave the user a way to reach a room área at all.
export function ClosetAreaCreationScreen({ onCreateNiche, onCreateRoom }: {
  onCreateNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
  onCreateRoom: (widthCm: number, depthCm: number, ceilingHeightCm: number) => void;
}) {
  const [spaceType, setSpaceType] = useState<"niche" | "room">("niche");
  const [nicheWidth, setNicheWidth] = useState(DEFAULT_NICHE.width);
  const [nicheHeight, setNicheHeight] = useState(DEFAULT_NICHE.height);
  const [nicheDepth, setNicheDepth] = useState(DEFAULT_NICHE.depth);
  const [roomWidth, setRoomWidth] = useState(DEFAULT_ROOM.width);
  const [roomDepth, setRoomDepth] = useState(DEFAULT_ROOM.depth);
  const [roomCeilingHeight, setRoomCeilingHeight] = useState(DEFAULT_ROOM.ceilingHeight);

  return (
    <div className="flex h-screen items-center justify-center bg-ink text-ivory">
      <div className="w-80 rounded-2xl border border-ivory/10 bg-ivory/4 p-5">
        <h1 className="font-display text-sm font-semibold">Nuevo closet</h1>
        <div className="mt-4 flex gap-1.5">
          <button
            onClick={() => setSpaceType("niche")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${spaceType === "niche" ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
          >
            Nicho
          </button>
          <button
            onClick={() => setSpaceType("room")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${spaceType === "room" ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
          >
            Cuarto
          </button>
        </div>

        {spaceType === "niche" ? (
          <div className="mt-4 space-y-2">
            <label className="flex items-center justify-between text-xs text-warmgray">
              Ancho (cm)
              <NumericField value={nicheWidth} min={50} onCommit={setNicheWidth} className={fieldClass} ariaLabel="Ancho del nicho en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Alto (cm)
              <NumericField value={nicheHeight} min={50} onCommit={setNicheHeight} className={fieldClass} ariaLabel="Alto del nicho en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Profundidad (cm)
              <NumericField value={nicheDepth} min={20} onCommit={setNicheDepth} className={fieldClass} ariaLabel="Profundidad del nicho en centímetros" />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="flex items-center justify-between text-xs text-warmgray">
              Ancho (cm)
              <NumericField value={roomWidth} min={100} onCommit={setRoomWidth} className={fieldClass} ariaLabel="Ancho del cuarto en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Profundidad (cm)
              <NumericField value={roomDepth} min={100} onCommit={setRoomDepth} className={fieldClass} ariaLabel="Profundidad del cuarto en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Altura de techo (cm)
              <NumericField value={roomCeilingHeight} min={180} onCommit={setRoomCeilingHeight} className={fieldClass} ariaLabel="Altura de techo del cuarto en centímetros" />
            </label>
          </div>
        )}

        <button
          onClick={() => (spaceType === "niche" ? onCreateNiche(nicheWidth, nicheHeight, nicheDepth) : onCreateRoom(roomWidth, roomDepth, roomCeilingHeight))}
          className="mt-4 w-full rounded-lg bg-brass px-3 py-2 text-xs font-semibold text-ink hover:bg-brass-soft"
        >
          Crear
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the entire contents of `ClosetBuilder.tsx`**

The full file becomes:
```tsx
"use client";

import { useState } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { ClosetAssemblyScene } from "@/components/3d/ClosetAssemblyScene";
import { ClosetAreaCreationScreen } from "./ClosetAreaCreationScreen";
import { ClosetModuleStackEditor } from "./ClosetModuleStackEditor";
import { ClosetTopShelfEditor } from "./ClosetTopShelfEditor";
import { NumericField } from "./NumericField";
import { isNicheSpace } from "@/types/closet";

const DEFAULT_MODULE_WIDTH_CM = 60;
const DEFAULT_MODULE_DEPTH_CM = 60;

export function ClosetBuilder() {
  const hasHydrated = useClosetStore((s) => s._hasHydrated);
  const project = useClosetStore((s) => s.project);
  const selectedConjuntoId = useClosetStore((s) => s.selectedConjuntoId);
  const selectedModuleId = useClosetStore((s) => s.selectedModuleId);
  const initNiche = useClosetStore((s) => s.initNiche);
  const initRoom = useClosetStore((s) => s.initRoom);
  const addModule = useClosetStore((s) => s.addModule);
  const removeModule = useClosetStore((s) => s.removeModule);
  const selectModule = useClosetStore((s) => s.selectModule);
  const addConjunto = useClosetStore((s) => s.addConjunto);
  const removeConjunto = useClosetStore((s) => s.removeConjunto);
  const selectConjunto = useClosetStore((s) => s.selectConjunto);
  const updateConjuntoXZRotation = useClosetStore((s) => s.updateConjuntoXZRotation);
  // Width is set once here at creation time (also editable later per-module
  // in ClosetModuleStackEditor) — a hangrod module often needs to be wider
  // than a drawer module next to it, so a single fixed default isn't enough.
  const [newModuleWidthCm, setNewModuleWidthCm] = useState(DEFAULT_MODULE_WIDTH_CM);

  // Not yet hydrated: render nothing rather than treating "haven't checked
  // storage yet" the same as "genuinely empty" (which would otherwise flash
  // briefly before the real draft applies).
  if (!hasHydrated) return null;

  // No draft yet (first-ever visit, or everything was cleared) — let the
  // user pick a space type and dimensions instead of silently auto-creating
  // one, so room áreas are actually reachable.
  if (!project) return <ClosetAreaCreationScreen onCreateNiche={initNiche} onCreateRoom={initRoom} />;

  const area = project.areas[0];
  if (!area) return null;
  const maxHeightCm = isNicheSpace(area.space) ? area.space.height : area.space.ceilingHeight;

  const selectedConjunto = area.conjuntos.find((c) => c.id === selectedConjuntoId) ?? area.conjuntos[0] ?? null;
  const selectedModule = selectedConjunto?.modules.find((m) => m.id === selectedModuleId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold">{project.projectName}</h1>
        <button
          onClick={() => addConjunto()}
          className="rounded-lg border border-ivory/15 px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-ivory/8"
        >
          + Agregar conjunto
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ClosetAssemblyScene project={project} onConjuntoMove={updateConjuntoXZRotation} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ivory/8">
          <div className="border-b border-ivory/8 p-3">
            <p className="text-xs font-semibold text-ivory">Conjuntos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {area.conjuntos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConjunto(c.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${c.id === selectedConjuntoId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {selectedConjunto ? (
            <>
              <div className="border-b border-ivory/8 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ivory">Módulos</p>
                  <button
                    onClick={() => removeConjunto(selectedConjunto.id)}
                    className="text-[10px] text-terracotta hover:underline"
                  >
                    Eliminar conjunto
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedConjunto.modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectModule(m.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${m.id === selectedModuleId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-warmgray">
                    Ancho (cm)
                    <NumericField
                      value={newModuleWidthCm} min={20}
                      onCommit={setNewModuleWidthCm}
                      className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
                      ariaLabel="Ancho del nuevo módulo en centímetros"
                    />
                  </label>
                  <button
                    onClick={() => addModule(newModuleWidthCm, DEFAULT_MODULE_DEPTH_CM)}
                    className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass-soft"
                  >
                    + Agregar módulo
                  </button>
                </div>
              </div>

              {selectedModule && (
                <>
                  <ClosetModuleStackEditor module={selectedModule} maxHeightCm={maxHeightCm} />
                  <div className="border-b border-ivory/8 p-3">
                    <button
                      onClick={() => removeModule(selectedModule.id)}
                      className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                    >
                      Eliminar módulo
                    </button>
                  </div>
                </>
              )}

              <ClosetTopShelfEditor conjunto={selectedConjunto} />
            </>
          ) : (
            <p className="p-3 text-xs text-warmgray">Agrega un conjunto para empezar.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: no errors anywhere in the closet subsystem.

- [ ] **Step 4: Manual smoke check**

Start the dev server (from `frontend/`, if not already running): `npm run dev`. In the browser, clear the `closet-draft-v1` localStorage key (or use a fresh profile) and visit `/closet`:
1. The creation screen appears — confirm both "Nicho" and "Cuarto" tabs show their own dimension fields, and "Crear" on "Cuarto" opens a 4-wall room with a freely-orbitable camera (not the fixed niche framing).
2. Click "+ Agregar conjunto" twice, drag one conjunto along the north wall — it should slide and stop at the room boundary or the other conjunto, never leave the floor.
3. Drag a conjunto from the north wall toward the west wall — it should reassign to the west wall partway through the drag (modules rotate to face into the room) and its release position should avoid overlapping the other conjunto, including near the shared corner.
4. Add a module to a conjunto, set a top shelf via the existing "Repisa superior" editor — confirm the shelf renders at the correct height/position regardless of which wall the conjunto is on.
5. Refresh the page — confirm the room draft (área type, dimensions, conjunto positions/walls) persists via the existing debounced localStorage save.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/closet/ClosetAreaCreationScreen.tsx frontend/components/closet/ClosetBuilder.tsx
git commit -m "feat(closet): área creation screen (nicho/cuarto) and room builder wiring"
```
