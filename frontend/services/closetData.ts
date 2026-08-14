import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, ClosetTopShelf, DoorBlockConfig, DrawerBlockConfig,
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

export function buildNewConjunto(x: number, z: number, rotation: 0 | 90 | 180 | 270 = 0): ClosetConjunto {
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
