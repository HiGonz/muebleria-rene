import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, ClosetTopShelf, ClosetWallRotation, DoorBlockConfig, DrawerBlockConfig,
  HangRodBlockConfig, OpenBlockConfig,
} from "@/types/closet";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Vertical stacking (blocks within a module) ────────────────────────────
export interface BlockStackEntry { block: ClosetBlock; yBottomCm: number; yTopCm: number }

export function layoutModuleBlocks(blocks: ClosetBlock[]): BlockStackEntry[] {
  let y = 0;
  return blocks.map((block) => {
    const yBottomCm = y;
    y += block.heightCm;
    return { block, yBottomCm, yTopCm: y };
  });
}

export function moduleTotalHeightCm(blocks: ClosetBlock[]): number {
  const layout = layoutModuleBlocks(blocks);
  return layout.length ? layout[layout.length - 1].yTopCm : 0;
}

export interface HeightValidation { fits: boolean; totalCm: number; overflowCm: number }

export function validateModuleHeight(blocks: ClosetBlock[], maxHeightCm: number): HeightValidation {
  const totalCm = moduleTotalHeightCm(blocks);
  return { fits: totalCm <= maxHeightCm, totalCm, overflowCm: Math.max(0, totalCm - maxHeightCm) };
}

// ─── Horizontal packing (modules within a conjunto, or any sized items) ────
export interface AxisStackEntry<T> { item: T; startCm: number; endCm: number }

export function stackAlongAxis<T extends { sizeCm: number }>(items: T[], gapCm = 0): AxisStackEntry<T>[] {
  let pos = 0;
  return items.map((item) => {
    const startCm = pos;
    pos += item.sizeCm + gapCm;
    return { item, startCm, endCm: startCm + item.sizeCm };
  });
}

// ─── Block catalog ──────────────────────────────────────────────────────────
export interface ClosetBlockCatalogEntry {
  kind: ClosetBlockKind;
  label: string;
  description: string;
  defaultHeightCm: number;
  defaultConfig: DrawerBlockConfig | OpenBlockConfig | DoorBlockConfig | HangRodBlockConfig;
}

export const CLOSET_BLOCK_CATALOG: ClosetBlockCatalogEntry[] = [
  {
    kind: "drawers", label: "Cajones",
    description: "Uno o varios cajones apilados, con distribución vertical automática.",
    defaultHeightCm: 80,
    defaultConfig: { quantity: 5, gapCm: 1 } as DrawerBlockConfig,
  },
  {
    kind: "open", label: "Hueco abierto",
    description: "Espacio completamente abierto — perfumes, accesorios, decoración, zapatos.",
    defaultHeightCm: 40,
    defaultConfig: {} as OpenBlockConfig,
  },
  {
    kind: "doors", label: "Hueco con puertas",
    description: "Espacio cerrado con una o más puertas.",
    defaultHeightCm: 60,
    defaultConfig: { doorCount: 2, hasLock: false, doorType: "Lisa" } as DoorBlockConfig,
  },
  {
    kind: "hangrod", label: "Barra para ropa",
    description: "Barra horizontal para colgar ropa en ganchos.",
    defaultHeightCm: 100,
    defaultConfig: { rodHeightFromBottomCm: 90, rodDepthCm: 30 } as HangRodBlockConfig,
  },
];

export function getClosetBlockCatalogEntry(kind: ClosetBlockKind): ClosetBlockCatalogEntry {
  const entry = CLOSET_BLOCK_CATALOG.find((e) => e.kind === kind);
  if (!entry) throw new Error(`Unknown closet block kind: ${kind}`);
  return entry;
}

export function buildNewBlock(kind: ClosetBlockKind): ClosetBlock {
  const entry = getClosetBlockCatalogEntry(kind);
  const id = newId(kind);
  const heightCm = entry.defaultHeightCm;
  switch (kind) {
    case "drawers": return { id, kind, heightCm, config: entry.defaultConfig as DrawerBlockConfig };
    case "open": return { id, kind, heightCm, config: entry.defaultConfig as OpenBlockConfig };
    case "doors": return { id, kind, heightCm, config: entry.defaultConfig as DoorBlockConfig };
    case "hangrod": return { id, kind, heightCm, config: entry.defaultConfig as HangRodBlockConfig };
  }
}

// ─── Module / conjunto / area builders ──────────────────────────────────────
export function buildNewClosetModule(width: number, depth: number): ClosetModule {
  return { id: newId("modulo"), label: "Módulo", width, depth, blocks: [] };
}

export function buildNewConjunto(x: number, z: number, rotation: ClosetWallRotation = 0): ClosetConjunto {
  return { id: newId("conjunto"), label: "Conjunto", x, z, rotation, modules: [] };
}

export function buildNewArea(label: string, spaceType: ClosetSpaceType, space: ClosetSpace): ClosetArea {
  return { id: newId("area"), label, spaceType, space, conjuntos: [] };
}

// ─── Conjunto placement (1D — a niche área only ever has one wall, so a
// conjunto's only real degree of freedom is its X offset along it) ─────────
export interface ConjuntoRange { startCm: number; endCm: number }

export function conjuntoWidthCm(conjunto: ClosetConjunto): number {
  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width })));
  return packed.length ? packed[packed.length - 1].endCm : 0;
}

export function conjuntoRange(conjunto: ClosetConjunto): ConjuntoRange {
  const widthCm = conjuntoWidthCm(conjunto);
  return { startCm: conjunto.x, endCm: conjunto.x + widthCm };
}

// Just enough tolerance to absorb floating-point noise, same rationale as
// kitchen's OVERLAP_TOLERANCE_M.
const CONJUNTO_OVERLAP_TOLERANCE_CM = 0.3;

export function conjuntosOverlap(a: ConjuntoRange, b: ConjuntoRange): boolean {
  return a.startCm < b.endCm - CONJUNTO_OVERLAP_TOLERANCE_CM && a.endCm > b.startCm + CONJUNTO_OVERLAP_TOLERANCE_CM;
}

// A drag release is "place it here" — searches outward in both directions
// (1cm steps) from the target for the nearest X where the conjunto's own
// width doesn't overlap any other conjunto's range, clamped to stay fully
// inside the área. Mirrors kitchen's findNearestFreePosition ring-search,
// simplified from a 2D ring to a 1D line since a conjunto only has one axis
// of freedom. Returns null only if truly nothing in [0, areaWidthCm] fits
// (the conjunto is wider than the área itself).
export function findNearestFreeConjuntoX(
  targetXCm: number, widthCm: number, areaWidthCm: number, others: ConjuntoRange[],
): number | null {
  const maxX = areaWidthCm - widthCm;
  if (maxX < 0) return null;
  const clamp = (x: number) => Math.min(Math.max(x, 0), maxX);
  const overlapsAny = (x: number) => others.some((o) => conjuntosOverlap({ startCm: x, endCm: x + widthCm }, o));

  const clamped = clamp(targetXCm);
  if (!overlapsAny(clamped)) return clamped;

  const stepCm = 1;
  for (let offset = stepCm; offset <= areaWidthCm; offset += stepCm) {
    for (const dir of [1, -1] as const) {
      const candidate = clamp(targetXCm + dir * offset);
      if (!overlapsAny(candidate)) return candidate;
    }
  }
  return null;
}

// ─── Repisa superior (spans a contiguous run of one conjunto's modules) ────
export function buildNewTopShelf(coversModuleIds: string[]): ClosetTopShelf {
  return { id: newId("repisa"), coversModuleIds, thickness: 2, material: "Melamina blanca 15mm" };
}

// If a covered module is removed, the shelf's coverage shrinks to whatever
// contiguous sub-run of its ORIGINAL coverage still exists in the module's
// new order; if none of the covered ids remain, the shelf is dropped. The
// "survivors are no longer contiguous" case (some other module now sits
// between two covered ones) can't currently happen through the app — modules
// only ever get appended or removed, never reordered/inserted mid-list, so
// removing one always closes the gap cleanly — but the check stays in place
// as the correct, defensive behavior for if/when module reordering is added.
export function reconcileTopShelfCoverage(topShelf: ClosetTopShelf, moduleIdsInOrder: string[]): ClosetTopShelf | null {
  const stillPresent = topShelf.coversModuleIds.filter((id) => moduleIdsInOrder.includes(id));
  if (stillPresent.length === 0) return null;
  const indices = stillPresent.map((id) => moduleIdsInOrder.indexOf(id)).sort((a, b) => a - b);
  const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
  if (!isContiguous) return null;
  return { ...topShelf, coversModuleIds: indices.map((idx) => moduleIdsInOrder[idx]) };
}

export interface TopShelfLayout { xStartCm: number; xEndCm: number; yTopCm: number }

export function layoutTopShelf(topShelf: ClosetTopShelf, conjunto: ClosetConjunto): TopShelfLayout | null {
  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
  const covered = packed.filter((p) => topShelf.coversModuleIds.includes(p.item.module.id));
  if (covered.length === 0) return null;
  return {
    xStartCm: Math.min(...covered.map((p) => p.startCm)),
    xEndCm: Math.max(...covered.map((p) => p.endCm)),
    yTopCm: Math.max(...covered.map((p) => moduleTotalHeightCm(p.item.module.blocks))),
  };
}

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
