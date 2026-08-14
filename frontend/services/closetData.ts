import type {
  ClosetArea, ClosetBlock, ClosetBlockKind, ClosetConjunto, ClosetModule,
  ClosetSpace, ClosetSpaceType, DoorBlockConfig, DrawerBlockConfig,
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
