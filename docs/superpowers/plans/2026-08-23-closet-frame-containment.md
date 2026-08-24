# Closet Marco (Frame) Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new "Marco" closet module (an open box, no back/doors) hold other closet modules placed freely inside its opening — width and height position both draggable, depth always flush to the front — and carry that content along when the marco itself moves.

**Architecture:** Purely geometric containment, no stored parent/child relationship — the same philosophy the just-shipped drag-to-stack fixes already use for "resting on top of." A new `findContainedWithin` (services layer, testable) derives what's inside a marco from current positions; the 3D drag handler detects "currently over a marco's footprint" mid-gesture and repurposes the existing wall-mounted vertical-drag machinery (`WallDragBasis`/`resolveWallDrag`) to let height-within-the-marco be set by the same drag gesture; the store's existing carry-on-move logic gets a second source (`findContainedWithin`) feeding the same translate loop it already has for `findRestingAbove`.

**Tech Stack:** Next.js App Router, Zustand, react-three-fiber/drei, TypeScript, Vitest (service-layer tests only — `frontend/vitest.config.ts` restricts test discovery to `services/**`/`lib/**`, same constraint the drag-to-stack work just operated under).

**Spec:** `docs/superpowers/specs/2026-08-23-closet-frame-containment-design.md`

## Global Constraints

- A marco can never contain another marco (no nesting) — enforced structurally (a marco is never considered a valid "hovered" target for another marco, and `findContainedWithin` never returns a `marco_closet` module).
- Depth is never independently positionable inside a marco — a contained module always sits front-flush with the marco's own front face (same front-facing sign convention `countertopFrontEdgeCoord` already uses).
- Two modules inside the same marco can never overlap (2D box check in the marco's own width×height plane) — checked at drop time; a colliding drop is rejected outright (module stays at its pre-drag position), same UX as the existing "no cabe junto a…" collision toast elsewhere.
- Only closet-category modules can be placed inside a marco.
- No BOM/shared-panel treatment for marco contents — priced/rendered as fully independent pieces, same precedent as the existing stacking "bridge" case.
- Automated tests only for the pure functions in `frontend/services/kitchenData.ts` — the 3D drag interaction (`components/3d/KitchenAssemblyScene.tsx`) and store wiring (`store/useKitchenStore.ts`) are verified via `tsc --noEmit` plus manual browser walkthroughs, matching this session's established convention for those files.

---

### Task 1: Data model, containment geometry, catalog entry, Inspector gating

**Files:**
- Modify: `frontend/types/kitchen.ts:145` (add `marco_closet` to `ClosetModuleType`)
- Modify: `frontend/services/kitchenData.ts` (new catalog entry near the closet section, `:1302-1427`; new exported functions after `findRestingAbove`, currently ending `:1805-1827`ish — check the actual current line by searching `export function findRestingAbove`)
- Modify: `frontend/components/kitchen/ModuleInspector.tsx:869` (exclude `marco_closet` from the back-panel section)
- Test: `frontend/services/kitchenData.test.ts` (extend — this file already has a `closetModule` factory from the drag-to-stack work; add a `marcoModule` factory alongside it)

**Interfaces:**
- Produces: `marcoInteriorCm(marco: KitchenModule): { alongMinCm: number; alongMaxCm: number; heightMinCm: number; heightMaxCm: number }`; `findContainedWithin(marco: KitchenModule, modules: KitchenModule[]): KitchenModule[]`; `closetContentsOverlap(marco: KitchenModule, candidate: KitchenModule, candidateAlongCm: number, candidateMountHeightCm: number, modules: KitchenModule[]): boolean`; `findHoveredMarco(xCm: number, zCm: number, modules: KitchenModule[], excludeId?: string): KitchenModule | null`; `marcoFrontFlushAcrossCm(marco: KitchenModule, contentDepthCm: number): number`. All five are consumed by Task 2 (3D drag) and Task 3 (store carry).

- [ ] **Step 1: Add the new closet module type**

In `frontend/types/kitchen.ts`, change line 145:

```ts
export type ClosetModuleType = "cajonera_closet" | "nicho_closet" | "tubo_ropa_closet" | "nicho_doble_puerta_closet" | "zapatera_extraible" | "marco_closet";
```

- [ ] **Step 2: Write the failing tests for the new geometry functions**

Open `frontend/services/kitchenData.test.ts`. It already has (from this session's earlier work) a `closetModule(over)` factory built on `buildNewModule("cajonera_closet", 0, 0, 0)`. Add a second factory right after it, and the new test suites at the end of the file:

```ts
function marcoModule(over: {
  id: string; x?: number; z?: number; rotation?: KitchenModule["rotation"];
  dimensions?: Partial<KitchenModule["dimensions"]>; options?: Partial<KitchenModule["options"]>;
}): KitchenModule {
  const base = buildNewModule("marco_closet", 0, 0, 0);
  return {
    ...base,
    id: over.id,
    x: over.x ?? base.x,
    z: over.z ?? base.z,
    rotation: over.rotation ?? base.rotation,
    dimensions: { ...base.dimensions, ...over.dimensions },
    options: { ...base.options, ...over.options },
  };
}
```

Add this import to the top of the file alongside the existing ones: `findContainedWithin, findHoveredMarco, closetContentsOverlap, marcoInteriorCm, marcoFrontFlushAcrossCm` (add to the existing `import { ... } from "./kitchenData";` line).

Then append:

```ts
describe("marcoInteriorCm", () => {
  it("shrinks the marco's own span/height by the frame wall thickness on each side", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    expect(marcoInteriorCm(marco)).toEqual({ alongMinCm: 61.8, alongMaxCm: 138.2, heightMinCm: 1.8, heightMaxCm: 178.2 });
  });
});

describe("findContainedWithin", () => {
  it("finds a closet module positioned inside the marco's opening", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const inside = closetModule({ id: "inside", x: 90, z: 30, dimensions: { width: 40, depth: 60, height: 40 }, options: { mountHeight: 60 } });
    expect(findContainedWithin(marco, [marco, inside]).map((m) => m.id)).toEqual(["inside"]);
  });

  it("excludes a module outside the marco's along-axis span or height range", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const tooFarRight = closetModule({ id: "far", x: 200, z: 30, dimensions: { width: 40, depth: 60, height: 40 }, options: { mountHeight: 60 } });
    const tooHigh = closetModule({ id: "high", x: 100, z: 30, dimensions: { width: 40, depth: 60, height: 40 }, options: { mountHeight: 300 } });
    expect(findContainedWithin(marco, [marco, tooFarRight, tooHigh])).toEqual([]);
  });

  it("includes something resting on top of a contained module (transitive)", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const inside = closetModule({ id: "inside", x: 100, z: 30, dimensions: { width: 40, depth: 60, height: 40 }, options: { mountHeight: 60 } });
    const onTop = closetModule({ id: "onTop", x: 100, z: 30, dimensions: { width: 40, depth: 60, height: 20 }, options: { mountHeight: 100 } });
    expect(findContainedWithin(marco, [marco, inside, onTop]).map((m) => m.id).sort()).toEqual(["inside", "onTop"]);
  });

  it("never treats another marco as contained inside a marco", () => {
    const outer = marcoModule({ id: "outer", x: 100, z: 30, dimensions: { width: 120, height: 200, depth: 60 }, options: { mountHeight: 0 } });
    const inner = marcoModule({ id: "inner", x: 100, z: 30, dimensions: { width: 40, height: 40, depth: 60 }, options: { mountHeight: 60 } });
    expect(findContainedWithin(outer, [outer, inner])).toEqual([]);
  });
});

describe("closetContentsOverlap", () => {
  it("passes for two non-overlapping placements", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const existing = closetModule({ id: "existing", x: 80, z: 30, dimensions: { width: 30, depth: 60, height: 40 }, options: { mountHeight: 20 } });
    const candidate = closetModule({ id: "candidate", x: 0, z: 0, dimensions: { width: 30, depth: 60, height: 40 } });
    expect(closetContentsOverlap(marco, candidate, 120, 20, [marco, existing])).toBe(false);
  });

  it("catches two overlapping placements (along-axis AND height both overlap)", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const existing = closetModule({ id: "existing", x: 100, z: 30, dimensions: { width: 30, depth: 60, height: 40 }, options: { mountHeight: 20 } });
    const candidate = closetModule({ id: "candidate", x: 0, z: 0, dimensions: { width: 30, depth: 60, height: 40 } });
    expect(closetContentsOverlap(marco, candidate, 110, 30, [marco, existing])).toBe(true);
  });

  it("ignores the candidate's own previous position when repositioning within the same marco", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 }, options: { mountHeight: 0 } });
    const candidate = closetModule({ id: "candidate", x: 100, z: 30, dimensions: { width: 30, depth: 60, height: 40 }, options: { mountHeight: 20 } });
    // candidate is already inside marco at its own current spot — checking a
    // placement at that SAME spot must not treat itself as an overlap.
    expect(closetContentsOverlap(marco, candidate, 100, 20, [marco, candidate])).toBe(false);
  });
});

describe("findHoveredMarco", () => {
  it("finds the marco whose footprint contains the given point", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 } });
    expect(findHoveredMarco(110, 30, [marco])?.id).toBe("m");
    expect(findHoveredMarco(500, 500, [marco])).toBeNull();
  });

  it("excludes the given id", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, dimensions: { width: 80, height: 180, depth: 60 } });
    expect(findHoveredMarco(100, 30, [marco], "m")).toBeNull();
  });
});

describe("marcoFrontFlushAcrossCm", () => {
  it("centers a shallower module's front face flush with the marco's own front face", () => {
    const marco = marcoModule({ id: "m", x: 100, z: 30, rotation: 0, dimensions: { width: 80, height: 180, depth: 60 } });
    // marco's own front face (rotation 0) is at z + depth/2 = 30 + 30 = 60.
    // a 20cm-deep content's center must sit 10cm behind that: 60 - 10 = 50.
    expect(marcoFrontFlushAcrossCm(marco, 20)).toBe(50);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run services/kitchenData.test.ts`
Expected: FAIL — `marcoInteriorCm`, `findContainedWithin`, `closetContentsOverlap`, `findHoveredMarco`, `marcoFrontFlushAcrossCm` are not exported yet, and `buildNewModule("marco_closet", ...)` has no matching catalog entry.

- [ ] **Step 4: Add the marco_closet catalog entry**

In `frontend/services/kitchenData.ts`, add this entry to `MODULE_CATALOG` right after the existing `zapatera_extraible` entry (the one ending in `configurableFields: ["height", "width", "depth", "shelves", "boardMaterial", "color", "leftSidePanel", "rightSidePanel", "backPanelMaterial", "hardwareFinish"],` followed by `},`):

```ts
  // Nothing but an open box — four sides, no back, no doors, no drawers,
  // no shelves. Its whole purpose is to hold other closet modules INSIDE
  // its opening (findContainedWithin below), not to be furniture itself.
  // backPanelMaterial is fixed at "ninguno" and left out of
  // configurableFields — see ModuleInspector.tsx's back-panel section,
  // which explicitly excludes this type from being able to change it.
  {
    type: "marco_closet",
    category: "closet",
    label: "Marco",
    description: "Caja abierta por los 4 lados, sin respaldo — para meter otros muebles de closet adentro",
    icon: "🖼️",
    defaultDimensions: { height: 180, width: 80, depth: 60 },
    defaultOptions: {
      drawers: 0, doors: 0, shelves: 0, includesCountertop: false,
      leftSidePanel: "exterior", rightSidePanel: "exterior", backPanelMaterial: "ninguno",
      mountHeight: 0,
      hasToeKick: false, // see cajonera_closet's note above
    },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color", "leftSidePanel", "rightSidePanel"],
  },
```

- [ ] **Step 5: Add the containment/overlap/hover-detection functions**

In `frontend/services/kitchenData.ts`, add this block right after `findRestingAbove`'s closing brace (search for `export function findRestingAbove` — the block ends at the next `}` on its own line, currently followed by the "Both blind-corner types..." comment for `BLIND_CORNER_TYPES`):

```ts
// Same board thickness calculateKitchenMaterials uses locally
// (BOARD_THICKNESS_CM, 1.8cm/18mm) for a drawer box's inner width — not
// exported from there, so this is its own module-level copy rather than a
// cross-function reach-in.
const MARCO_WALL_THICKNESS_CM = 1.8;

export interface MarcoInteriorCm { alongMinCm: number; alongMaxCm: number; heightMinCm: number; heightMaxCm: number }

// The usable OPENING inside a marco_closet — its own outer span/height
// shrunk by the frame's own wall thickness on each side. "along" is
// whichever world axis is the marco's own width direction, given its
// rotation (same convention findRestingAbove/findClosetSupportRun use).
export function marcoInteriorCm(marco: KitchenModule): MarcoInteriorCm {
  const alongIsX = !(marco.rotation === 90 || marco.rotation === 270);
  const center = alongIsX ? marco.x : marco.z;
  const halfInterior = marco.dimensions.width / 2 - MARCO_WALL_THICKNESS_CM;
  return {
    alongMinCm: center - halfInterior,
    alongMaxCm: center + halfInterior,
    heightMinCm: marco.options.mountHeight + MARCO_WALL_THICKNESS_CM,
    heightMaxCm: marco.options.mountHeight + marco.dimensions.height - MARCO_WALL_THICKNESS_CM,
  };
}

// Every closet module currently positioned INSIDE marco's own opening —
// directly, or transitively (something resting on top of something that's
// inside marco, via findRestingAbove). Depth/across alignment is NOT
// checked here — a contained module is always placed front-flush by the
// drag interaction (marcoFrontFlushAcrossCm), so there's nothing to
// verify. A marco is never itself found inside another marco (no nesting
// — excluded explicitly, not just by coincidence of the height/span math).
export function findContainedWithin(marco: KitchenModule, modules: KitchenModule[]): KitchenModule[] {
  if (marco.type !== "marco_closet") return [];
  const alongIsX = !(marco.rotation === 90 || marco.rotation === 270);
  const interior = marcoInteriorCm(marco);
  const direct = modules.filter((m) => {
    if (m.id === marco.id || m.category !== "closet" || m.type === "marco_closet") return false;
    if (m.rotation !== marco.rotation) return false;
    const mAlong = alongIsX ? m.x : m.z;
    const mHalf = m.dimensions.width / 2;
    const mTop = m.options.mountHeight + m.dimensions.height;
    return mAlong - mHalf >= interior.alongMinCm - CLOSET_STACK_XZ_TOLERANCE_CM &&
      mAlong + mHalf <= interior.alongMaxCm + CLOSET_STACK_XZ_TOLERANCE_CM &&
      m.options.mountHeight >= interior.heightMinCm - CLOSET_STACK_XZ_TOLERANCE_CM &&
      mTop <= interior.heightMaxCm + CLOSET_STACK_XZ_TOLERANCE_CM;
  });
  return direct.flatMap((d) => [d, ...findRestingAbove(d, modules)]);
}

// Would placing `candidate` inside `marco` at the given along-axis center
// and mountHeight collide with anything already inside marco? 2D box
// overlap (along-axis span AND height-span both overlapping) in the
// marco's own width×height plane — depth doesn't enter into it, contents
// are always front-flush. Excludes `candidate` itself from the comparison
// (its own PREVIOUS position, if it was already inside this same marco,
// must never count as a collision against the placement being tested).
export function closetContentsOverlap(
  marco: KitchenModule, candidate: KitchenModule, candidateAlongCm: number, candidateMountHeightCm: number, modules: KitchenModule[],
): boolean {
  const candHalf = candidate.dimensions.width / 2;
  const candMin = candidateAlongCm - candHalf;
  const candMax = candidateAlongCm + candHalf;
  const candTop = candidateMountHeightCm + candidate.dimensions.height;
  const alongIsX = !(marco.rotation === 90 || marco.rotation === 270);
  const existing = findContainedWithin(marco, modules).filter((m) => m.id !== candidate.id);
  return existing.some((m) => {
    const mAlong = alongIsX ? m.x : m.z;
    const mHalf = m.dimensions.width / 2;
    const mMin = mAlong - mHalf;
    const mMax = mAlong + mHalf;
    const mTop = m.options.mountHeight + m.dimensions.height;
    const alongOverlap = candMin < mMax && candMax > mMin;
    const heightOverlap = candidateMountHeightCm < mTop && candTop > m.options.mountHeight;
    return alongOverlap && heightOverlap;
  });
}

// The marco (if any) whose own floor-level footprint contains the given
// point — used to detect "the drag is currently over this marco's
// opening" mid-gesture. Height isn't part of this check (entering a
// marco's footprint at ANY drag height still counts as hovering it) —
// closetContentsOverlap/marcoInteriorCm handle whether a specific drop is
// actually valid, separately.
export function findHoveredMarco(xCm: number, zCm: number, modules: KitchenModule[], excludeId?: string): KitchenModule | null {
  return modules.find((m) => {
    if (m.type !== "marco_closet" || m.id === excludeId) return false;
    const alongIsX = !(m.rotation === 90 || m.rotation === 270);
    const along = alongIsX ? xCm : zCm;
    const across = alongIsX ? zCm : xCm;
    const mAlong = alongIsX ? m.x : m.z;
    const mAcross = alongIsX ? m.z : m.x;
    return Math.abs(along - mAlong) <= m.dimensions.width / 2 && Math.abs(across - mAcross) <= m.dimensions.depth / 2;
  }) ?? null;
}

// The across-axis (depth-direction) world coordinate a module must sit at
// to land front-flush inside marco's opening — same front-facing sign
// convention countertopFrontEdgeCoord already uses (z+reach at rotation 0,
// mirrored per rotation), offset inward by the CONTAINED module's own half
// depth so its front FACE (not its center) aligns with marco's front face.
export function marcoFrontFlushAcrossCm(marco: KitchenModule, contentDepthCm: number): number {
  const halfContent = contentDepthCm / 2;
  switch (marco.rotation) {
    case 0: return marco.z + marco.dimensions.depth / 2 - halfContent;
    case 180: return marco.z - marco.dimensions.depth / 2 + halfContent;
    case 90: return marco.x + marco.dimensions.depth / 2 - halfContent;
    case 270: return marco.x - marco.dimensions.depth / 2 + halfContent;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run services/kitchenData.test.ts`
Expected: PASS (all new tests, plus the pre-existing ones in this file still green).

- [ ] **Step 7: Exclude marco_closet from the back-panel Inspector section**

In `frontend/components/kitchen/ModuleInspector.tsx`, change line 869 from:

```tsx
            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode || opt.backPanelMaterial === "puertas" || opt.backPanelMaterial === "alacena" || isBlindCorner || category === "closet") && (
```

to:

```tsx
            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode || opt.backPanelMaterial === "puertas" || opt.backPanelMaterial === "alacena" || isBlindCorner || (category === "closet" && type !== "marco_closet")) && (
```

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add types/kitchen.ts services/kitchenData.ts services/kitchenData.test.ts components/kitchen/ModuleInspector.tsx
git commit -m "feat(closet): add marco_closet type and containment geometry"
```

---

### Task 2: 3D drag interaction — placing modules inside a marco

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx` (import line `:16`; inside `handleDragStart`, new closure state/helpers near `resolveMountHeightCm` `:2787-2791`; `handleMove`'s `mountHeightCm` line `:2826`; `handleUp`'s support-run block `:2872-2905`)

**Interfaces:**
- Consumes (from Task 1): `findHoveredMarco`, `marcoInteriorCm`, `closetContentsOverlap`, `marcoFrontFlushAcrossCm` from `@/services/kitchenData`.
- Produces: no new exports — this task only changes drag behavior inside `AssemblyContent`.

- [ ] **Step 1: Import the new helpers**

In `frontend/components/3d/KitchenAssemblyScene.tsx`, add `findHoveredMarco, marcoInteriorCm, closetContentsOverlap, marcoFrontFlushAcrossCm` to the existing `@/services/kitchenData` import (currently line 16, already imports `findTowerChain, findRestingAbove, TOWER_JOINT_TOLERANCE_CM` among others).

- [ ] **Step 2: Add marco-hover drag state and the height-resolution helper**

Inside `handleDragStart` (search for `const handleDragStart = (mod: KitchenModule, e: ThreeEvent<PointerEvent>) => {`), right after the existing `const resolveMountHeightCm = (rawHeightCm: number | undefined): number | undefined => { ... };` block (currently ending around line 2791), add:

```ts
    // Only a non-marco closet module can be dragged INTO a marco — no
    // nesting, and nothing outside the closet subsystem participates.
    const canEnterMarco = mod.category === "closet" && mod.type !== "marco_closet";

    // Tracks which marco (if any) is currently hovered mid-drag, and the
    // screen-space reference established the moment it was first entered —
    // mirrors wallDragBasis's own "measure once via projectToScreen" idea
    // above, just for a SINGLE axis (height) instead of two, since the
    // along-axis position already comes for free from the ordinary floor
    // raycast (resolveDragTarget) — only height needs a screen-to-world
    // mapping for a floor-band module, which otherwise never drags
    // vertically at all.
    let hoveredMarcoId: string | null = null;
    let marcoHeightPx: { x: number; y: number } | null = null;
    let marcoEnterClientX = 0;
    let marcoEnterClientY = 0;
    let marcoEnterHeightCm = 0;

    const resolveMarcoHeightCm = (marco: KitchenModule, clientX: number, clientY: number): number => {
      const interior = marcoInteriorCm(marco);
      const minCm = interior.heightMinCm;
      const maxCm = interior.heightMaxCm - mod.dimensions.height;
      if (marco.id !== hoveredMarcoId) {
        hoveredMarcoId = marco.id;
        const basePoint = new THREE.Vector3(marco.x / 100, planeY, marco.z / 100);
        const abovePoint = basePoint.clone().add(new THREE.Vector3(0, 1, 0));
        const screenBase = projectToScreen(basePoint);
        const screenAbove = projectToScreen(abovePoint);
        marcoHeightPx = { x: screenAbove.x - screenBase.x, y: screenAbove.y - screenBase.y };
        marcoEnterClientX = clientX;
        marcoEnterClientY = clientY;
        marcoEnterHeightCm = Math.min(Math.max(mod.options.mountHeight || 0, minCm), maxCm);
      }
      if (!marcoHeightPx) return marcoEnterHeightCm;
      const magSq = marcoHeightPx.x * marcoHeightPx.x + marcoHeightPx.y * marcoHeightPx.y;
      if (magSq < 1e-6) return marcoEnterHeightCm;
      const dx = clientX - marcoEnterClientX;
      const dy = clientY - marcoEnterClientY;
      const heightM = (dx * marcoHeightPx.x + dy * marcoHeightPx.y) / magSq;
      return Math.min(Math.max(marcoEnterHeightCm + heightM * 100, minCm), maxCm);
    };

    // Resolves where `mod` would land if dropped inside `marco` right now —
    // along-axis position free (clamped to the marco's interior span),
    // height from resolveMarcoHeightCm, depth always front-flush. Returns
    // null if that placement would overlap something already inside marco
    // (the caller falls back to the ordinary floor/support-stacking path).
    const resolveMarcoPlacement = (
      marco: KitchenModule, xCm: number, zCm: number, clientX: number, clientY: number,
    ): { xCm: number; zCm: number; mountHeightCm: number } | null => {
      const marcoMountHeightCm = resolveMarcoHeightCm(marco, clientX, clientY);
      const interior = marcoInteriorCm(marco);
      const alongIsX = !(marco.rotation === 90 || marco.rotation === 270);
      const halfWidth = mod.dimensions.width / 2;
      const rawAlongCm = alongIsX ? xCm : zCm;
      const clampedAlongCm = Math.min(Math.max(rawAlongCm, interior.alongMinCm + halfWidth), interior.alongMaxCm - halfWidth);
      if (closetContentsOverlap(marco, mod, clampedAlongCm, marcoMountHeightCm, modules)) return null;
      const acrossCm = marcoFrontFlushAcrossCm(marco, mod.dimensions.depth);
      return {
        xCm: alongIsX ? clampedAlongCm : acrossCm,
        zCm: alongIsX ? acrossCm : clampedAlongCm,
        mountHeightCm: marcoMountHeightCm,
      };
    };
```

- [ ] **Step 3: Use marco-hover detection in the live drag preview (`handleMove`)**

In `handleMove`, replace the existing line (currently `:2826`):

```ts
      const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
      setDragPreview({ id: state.id, x: x * 100, z: z * 100, rotation, mountHeightCm });
```

with:

```ts
      const marco = canEnterMarco ? findHoveredMarco(x * 100, z * 100, modules, mod.id) : null;
      let mountHeightCm: number | undefined;
      if (marco) {
        mountHeightCm = resolveMarcoHeightCm(marco, ev.clientX, ev.clientY);
      } else {
        hoveredMarcoId = null;
        mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
      }
      setDragPreview({ id: state.id, x: x * 100, z: z * 100, rotation, mountHeightCm });
```

(The preview intentionally doesn't reject an overlapping in-marco position — it just shows where the module currently tracks; the reject-and-toast happens on drop, in Step 4.)

- [ ] **Step 4: Use marco placement on drop (`handleUp`)**

In `handleUp`, replace the existing block (currently `:2872-2905`, from `let mountHeightCm = resolveMountHeightCm(target.rawHeightCm);` through the closing of the `if (supportRun) { ... } else { ... }`) with:

```ts
          const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
          const marco = canEnterMarco ? findHoveredMarco(x * 100, z * 100, modules, mod.id) : null;
          const marcoPlacement = marco ? resolveMarcoPlacement(marco, x * 100, z * 100, ev.clientX, ev.clientY) : null;
          if (marcoPlacement) {
            onModuleMove?.(state.id, marcoPlacement.xCm, marcoPlacement.zCm, marco!.rotation, marcoPlacement.mountHeightCm, islandMode);
          } else if (marco) {
            toast(`No cabe dentro de "${marco.label}"`, { description: "Se traslapa con algo que ya está adentro.", duration: 1800 });
          } else {
            // Landing on top of a same-height support (one module with the
            // exact same footprint — a "tower" — or several side-by-side
            // ones whose combined width covers this drop — a "bridge")
            // instead of colliding — checked before the normal
            // overlap/push-apart path so it short-circuits that entirely.
            let floorMountHeightCm = mountHeightCm;
            const supportRun = findClosetSupportRun(mod, x, z, rotation, modules);
            if (supportRun) {
              const alongIsX = !(rotation === 90 || rotation === 270);
              if (alongIsX) { x = supportRun.alongCenterM; z = supportRun.acrossM; }
              else { z = supportRun.alongCenterM; x = supportRun.acrossM; }
              floorMountHeightCm = supportRun.topCm;
              onModuleMove?.(state.id, x * 100, z * 100, rotation, floorMountHeightCm, islandMode);
            } else {
              // A closet module that WAS stacked but just got dragged off
              // its base (no longer landing on a matching footprint) drops
              // back to the floor instead of staying frozen at its old
              // stacked height.
              if (mod.category === "closet" && (mod.options.mountHeight ?? 0) > 0) floorMountHeightCm = 0;
              const blocker = findOverlap(mod, x, z, rotation, modules);
              if (blocker) {
                // Searches near the drop point itself for the closest
                // still-clear spot instead of walking back toward wherever
                // the drag started — see findNearestFreePosition.
                const landed = findNearestFreePosition(mod, x, z, rotation, modules, roomWidthM, roomDepthM);
                if (landed) {
                  onModuleMove?.(state.id, landed.x * 100, landed.z * 100, rotation, floorMountHeightCm, islandMode);
                  toast(`"${mod.label}" se acomodó junto a "${blocker.label}"`, { description: "Se ajustó al espacio libre más cercano.", duration: 1800 });
                } else {
                  toast(`No cabe junto a "${blocker.label}"`, { description: "No hay espacio libre cercano, se mantuvo la posición anterior.", duration: 1800 });
                }
              } else {
                onModuleMove?.(state.id, x * 100, z * 100, rotation, floorMountHeightCm, islandMode);
              }
            }
          }
```

Note the `mountHeightCm` → `let floorMountHeightCm = mountHeightCm` rename inside the `else` branch: the outer `mountHeightCm` const is now shared with the marco-detection path above it, so the floor/support-stacking logic needs its own mutable copy instead of reassigning the now-`const` outer one.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual regression check (no marcos exist yet in any existing flow)**

Run the dev server (`npm run dev` from `frontend/`), open the kitchen builder, add two ordinary closet modules (e.g. two Cajonera) and drag one onto the other to confirm the existing stack-on-top behavior still works exactly as before (this proves `canEnterMarco`/`findHoveredMarco` returning `null` when there's no marco on the board doesn't change anything about the pre-existing floor/stacking path — the `else` branch is the same logic as before, just re-indented).

- [ ] **Step 7: Commit**

```bash
cd frontend
git add components/3d/KitchenAssemblyScene.tsx
git commit -m "feat(closet): drag a module inside a marco's opening"
```

---

### Task 3: Store carry integration + full manual verification

**Files:**
- Modify: `frontend/store/useKitchenStore.ts` (import line `:7`; `updateModulePosition`'s carry computation, currently the `const carried = findRestingAbove(current, s.draft.modules);` line)

**Interfaces:**
- Consumes (from Task 1): `findContainedWithin` from `@/services/kitchenData`.

- [ ] **Step 1: Add findContainedWithin to the carry computation**

In `frontend/store/useKitchenStore.ts`, add `findContainedWithin` to the existing `@/services/kitchenData` import (line 7, already imports `findRestingAbove` among others).

Then change the carry line (search for `const carried = findRestingAbove(current, s.draft.modules);`) to:

```ts
          const carried = [...findRestingAbove(current, s.draft.modules), ...findContainedWithin(current, s.draft.modules)];
```

Update the comment immediately above it (currently explaining "resting on top of" only) to also mention containment — replace the existing comment block with:

```ts
          // A closet module carries along whatever's resting on top of it
          // (findRestingAbove) AND, if it's a marco, whatever's positioned
          // INSIDE its opening (findContainedWithin) — both are unioned
          // into one list and translated identically below; a marco moving
          // takes its contents with it exactly the same way a tower takes
          // what's stacked on it. Everything below/outside stays put:
          // dragging a module only takes what depends on IT, same as
          // physically lifting one piece out. Each carried module
          // translates by the SAME x/z/mountHeight delta `current` itself
          // just moved by (not "set to match") — see the mountHeight-delta
          // fix above for why an absolute set would strand anything above
          // a base that changed height.
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass (Task 1's new tests plus every pre-existing one).

- [ ] **Step 4: Full manual end-to-end walkthrough**

Run the dev server (`npm run dev` from `frontend/`), in the kitchen builder:

1. Add a Marco (search "marco" in the module catalog). Confirm it renders as an open box with no back panel.
2. Add a small Nicho. Drag it so its footprint overlaps the marco's footprint, then move the mouse up/down while still dragging — confirm the nicho's height changes live (the drag preview should show it rising/falling within the marco) and clamps at the marco's floor and ceiling instead of escaping the opening.
3. Drop it inside the marco at a chosen height. Confirm it lands there (not on the floor, not on top of the marco).
4. Add a second small Nicho and drag it inside the SAME marco at a different position (not overlapping the first). Confirm it's accepted.
5. Try dragging a third module inside the marco so it overlaps one of the two already there. Confirm the drop is rejected (toast shown, module stays at its pre-drag position) rather than landing on top of/inside the existing one.
6. Move the marco itself to a new spot in the room. Confirm both contained nichos travel with it, keeping their relative positions inside the opening.
7. Drag one of the contained nichos back OUT of the marco onto open floor. Confirm it drops to floor level (0) instead of staying frozen at its in-marco height.
8. Regression: repeat the ordinary (non-marco) stack-on-top flow from Task 2's Step 6 once more to confirm it's still unaffected after Task 3's carry change.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add store/useKitchenStore.ts
git commit -m "feat(closet): carry a marco's contents when it moves"
```
