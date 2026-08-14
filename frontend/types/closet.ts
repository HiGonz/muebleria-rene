// Closet designer data model — fully independent from types/kitchen.ts.
// See docs/superpowers/specs/2026-08-14-closet-designer-design.md.

export type ClosetSpaceType = "niche" | "room";

// "niche": envelope against one wall, no walk-around — the scene frames
// the box. "room" (later phase): 4-wall walkable space. Both are cm.
export type ClosetSpace =
  | { width: number; height: number; depth: number }
  | { width: number; depth: number; ceilingHeight: number };

export function isNicheSpace(space: ClosetSpace): space is { width: number; height: number; depth: number } {
  return "height" in space;
}

export interface ClosetArea {
  id: string;
  label: string;
  spaceType: ClosetSpaceType;
  space: ClosetSpace;
  conjuntos: ClosetConjunto[];
}

export interface ClosetConjunto {
  id: string;
  label: string;
  x: number; z: number; rotation: 0 | 90 | 180 | 270; // cm/degrees — placement within the área
  modules: ClosetModule[]; // left-to-right order
  topShelf?: ClosetTopShelf;
}

export interface ClosetModule {
  id: string;
  label: string;
  width: number; // cm, fixed
  depth: number; // cm, fixed
  // height is NEVER stored — always sum(blocks[i].heightCm), see layoutModuleBlocks
  blocks: ClosetBlock[]; // bottom-to-top order
}

export type ClosetBlockKind = "drawers" | "open" | "doors" | "hangrod";

export interface DrawerBlockConfig {
  quantity: number;
  individualHeightCm?: number; // auto ((heightCm - gapCm*(quantity-1)) / quantity) if omitted
  gapCm: number;
}

// Nothing beyond the block's own heightCm — the hueco IS the space.
export interface OpenBlockConfig {}

export interface DoorBlockConfig {
  doorCount: number;
  doorWidths?: number[]; // auto-even split if omitted; length must equal doorCount when set
  hasLock: boolean;
  doorType: string; // free-form for now — no commercial door-type rules exist yet
}

export interface HangRodBlockConfig {
  rodHeightFromBottomCm: number;
  rodDepthCm: number;
  secondRod?: { heightFromBottomCm: number }; // future
}

export type ClosetBlock =
  | { id: string; kind: "drawers"; heightCm: number; config: DrawerBlockConfig }
  | { id: string; kind: "open"; heightCm: number; config: OpenBlockConfig }
  | { id: string; kind: "doors"; heightCm: number; config: DoorBlockConfig }
  | { id: string; kind: "hangrod"; heightCm: number; config: HangRodBlockConfig };

export interface ClosetTopShelf {
  id: string;
  coversModuleIds: string[]; // must be a contiguous run within the conjunto's modules
  thickness: number;
  material: string;
}

export interface ClosetProject {
  id: number | null;
  clientName: string;
  projectName: string;
  notes: string;
  areas: ClosetArea[];
}
