"use client";

import { Carcass, Box, DoorPanel, DrawerFace, T } from "./ModulePreview3D";
import type { ClosetBlock, ClosetModule } from "@/types/closet";
import type { DoorDef, DrawerDef } from "@/types/kitchen";
import { layoutModuleBlocks, moduleTotalHeightCm } from "@/services/closetData";

const BOARD_COLOR = "#d4c5b0";
const FRONT_COLOR = "#e8e0d4";

// DrawerFace/DoorPanel position their content at `toeKick + T + fromBottomCm`
// (see ModulePreview3D.tsx) — that extra `T` accounts for a physical bottom
// board below local y=0 in kitchen's normal usage. Our <group position={[0,
// bottomYM, 0]}> wrapper doesn't have an equivalent bottom board to absorb
// it, so without reserving T out of the content span, the topmost front's
// rendered top edge lands T past the block's own top boundary (poking
// through the ceiling panel or the divider above). Reserving T here keeps
// content within [bottomYM, bottomYM + heightCm/100].
const T_CM = T * 100;

// One evenly-spaced DrawerDef per drawer in the block, spanning its own
// heightCm — mirrors the even-split idea kitchen uses for auto-laid-out
// drawers, simplified (no zone-height override, no door coexistence).
function drawerDefsFor(block: Extract<ClosetBlock, { kind: "drawers" }>): DrawerDef[] {
  const { quantity, gapCm, individualHeightCm } = block.config;
  const contentHeightCm = Math.max(block.heightCm - T_CM, 0);
  const perDrawerCm = individualHeightCm ?? (contentHeightCm - gapCm * Math.max(quantity - 1, 0)) / quantity;
  return Array.from({ length: quantity }, (_, i) => ({
    id: `${block.id}_d${i}`,
    label: `Cajón ${i + 1}`,
    heightCm: perDrawerCm,
    fromBottomCm: i * (perDrawerCm + gapCm),
    isGhost: false,
    widthPct: 100,
    offsetPct: 0,
    drawerSystem: "Soft-close",
  }));
}

// One DoorDef per door in the block, spanning the block's full height, evenly
// split across the width unless explicit doorWidths are given.
function doorDefsFor(block: Extract<ClosetBlock, { kind: "doors" }>): DoorDef[] {
  const { doorCount, doorWidths } = block.config;
  const contentHeightCm = Math.max(block.heightCm - T_CM, 0);
  const widths = doorWidths && doorWidths.length === doorCount ? doorWidths : Array.from({ length: doorCount }, () => 100 / doorCount);
  let offsetPct = 0;
  return widths.map((widthPct, i) => {
    const def: DoorDef = {
      id: `${block.id}_door${i}`,
      label: `Puerta ${i + 1}`,
      widthPct,
      offsetPct,
      fromBottomCm: 0,
      heightCm: contentHeightCm,
      hingeLeft: i % 2 === 0,
      doorStyle: "Lisa",
    };
    offsetPct += widthPct;
    return def;
  });
}

function HangRod({ block, W, D, bottomYM }: { block: Extract<ClosetBlock, { kind: "hangrod" }>; W: number; D: number; bottomYM: number }) {
  const rodY = bottomYM + block.config.rodHeightFromBottomCm / 100;
  const rodZ = D / 2 - block.config.rodDepthCm / 200;
  const rodLength = W - T * 4;
  return (
    <mesh position={[0, rodY, rodZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.012, 0.012, rodLength, 12]} />
      <meshStandardMaterial color="#b0b0b0" metalness={0.7} roughness={0.3} />
    </mesh>
  );
}

function BlockContent({ block, W, D, bottomYM }: { block: ClosetBlock; W: number; D: number; bottomYM: number }) {
  switch (block.kind) {
    case "drawers":
      return (
        <group position={[0, bottomYM, 0]}>
          {drawerDefsFor(block).map((d) => (
            <DrawerFace key={d.id} drawer={d} W={W} D={D} toeKick={0} color={FRONT_COLOR} hardware="Acero inoxidable" />
          ))}
        </group>
      );
    case "doors":
      return (
        <group position={[0, bottomYM, 0]}>
          {doorDefsFor(block).map((d) => (
            <DoorPanel key={d.id} door={d} W={W} D={D} toeKick={0} color={FRONT_COLOR} hardware="Acero inoxidable" />
          ))}
        </group>
      );
    case "hangrod":
      return <HangRod block={block} W={W} D={D} bottomYM={bottomYM} />;
    case "open":
      return null; // literally empty space — nothing to render beyond the shared carcass
  }
}

// One continuous Carcass spans the module's FULL derived height (so blocks
// never show a seam between them beyond the intentional divider), with a
// thin horizontal divider panel at every internal block boundary and each
// block's own front/fixture content layered on top.
export function ClosetModuleMesh({ module, x, z }: { module: ClosetModule; x: number; z: number }) {
  const W = module.width / 100;
  const D = module.depth / 100;
  const totalHeightCm = moduleTotalHeightCm(module.blocks);
  const H = Math.max(totalHeightCm / 100, 0.01);
  const layout = layoutModuleBlocks(module.blocks);

  return (
    <group position={[x, 0, z]}>
      <Carcass W={W} H={H} D={D} color={BOARD_COLOR} leftColor={BOARD_COLOR} rightColor={BOARD_COLOR} />
      {layout.slice(0, -1).map(({ block, yTopCm }) => (
        <Box key={`divider_${block.id}`} pos={[0, yTopCm / 100, 0]} size={[W - T * 2, T, D - T]} color={BOARD_COLOR} />
      ))}
      {layout.map(({ block, yBottomCm }) => (
        <BlockContent key={block.id} block={block} W={W} D={D} bottomYM={yBottomCm / 100} />
      ))}
    </group>
  );
}
