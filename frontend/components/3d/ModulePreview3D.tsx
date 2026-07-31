"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, MeshReflectorMaterial } from "@react-three/drei";
import { useRef, useState, type ReactNode } from "react";
import { MathUtils, type Group, type Texture } from "three";
import type { KitchenModule, DrawerDef, DoorDef, HardwareFinish, PullOutAccessoryType } from "@/types/kitchen";
import { getWoodTexture, getWoodRoughness } from "./woodTextures";
import { useContextRecovery } from "./useContextRecovery";

// ─── Board thickness (meters) ─────────────────────────────────────────────────
const T = 0.018;
// ─── Interaction tuning ───────────────────────────────────────────────────────
const DOOR_OPEN_ANGLE = Math.PI * 0.42; // ~76°
const DAMP_SPEED = 7;

function setGrabCursor(hover: boolean) {
  if (typeof document !== "undefined") document.body.style.cursor = hover ? "pointer" : "auto";
}

// No front — drawer or door — reaches all the way up to the countertop
// underside: a structural rail/apron above the top-most one leaves room for
// mounting hardware. This comes off the whole usable face height before it's
// split between doors and drawers. Mirrors the same constant in services/kitchenData.ts.
const TOP_FACE_MARGIN_CM = 6;

// ─── Auto-generate layout from simple counts ─────────────────────────────────
export function getEffectiveDrawers(mod: KitchenModule): DrawerDef[] {
  if (mod.options.useDetailedLayout && mod.options.drawerDefs?.length) {
    return mod.options.drawerDefs;
  }
  const count = mod.options.drawers || 0;
  if (!count) return [];
  // Wall cabinets have no toe-kick and no mounting-rail reveal at the top —
  // their fronts run floor-to-ceiling of the box itself, not just the base.
  const isUpper = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
  const toeKick = !isUpper && mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const topMargin = isUpper ? 0 : TOP_FACE_MARGIN_CM;
  const usableH = Math.max(mod.dimensions.height - toeKick - ctThick - topMargin, 0);
  const doorCount = mod.options.doors || 0;
  const doorZoneH = doorCount > 0 ? Math.max(usableH * 0.55, 40) : 0;
  const drawerZoneH = Math.max(usableH - doorZoneH, 0);
  const drawerH = drawerZoneH / count;
  const isSink = mod.type === "bajo_tarja";

  return Array.from({ length: count }, (_, i) => ({
    id: `auto-d${i}`,
    label: `Cajón ${i + 1}`,
    heightCm: drawerH,
    fromBottomCm: doorZoneH + i * drawerH,
    isGhost: isSink,
    widthPct: 100,
    offsetPct: 0,
    drawerSystem: mod.options.drawerSystem,
  }));
}

export function getEffectiveDoors(mod: KitchenModule): DoorDef[] {
  if (mod.options.useDetailedLayout && mod.options.doorDefs?.length) {
    return mod.options.doorDefs;
  }
  const count = mod.options.doors || 0;
  if (!count) return [];
  // Wall cabinets have no toe-kick and no mounting-rail reveal at the top —
  // their fronts run floor-to-ceiling of the box itself, not just the base.
  const isUpper = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
  const toeKick = !isUpper && mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const topMargin = isUpper ? 0 : TOP_FACE_MARGIN_CM;
  const usableH = Math.max(mod.dimensions.height - toeKick - ctThick - topMargin, 0);
  const drawerCount = mod.options.drawers || 0;
  const drawerZoneH = drawerCount > 0 ? Math.max(usableH - Math.max(usableH * 0.55, 40), 0) : 0;
  const doorZoneH = usableH - drawerZoneH;
  const doorW = 100 / count;

  return Array.from({ length: count }, (_, i) => {
    const hingeSide = mod.options.doorHingeSides?.[i];
    return {
      id: `auto-dr${i}`,
      label: `Puerta ${i + 1}`,
      widthPct: doorW,
      offsetPct: i * doorW,
      fromBottomCm: 0,
      heightCm: doorZoneH,
      hingeLeft: hingeSide ? hingeSide === "izquierda" : i % 2 === 0,
      hingeTop: hingeSide === "arriba",
      doorStyle: mod.options.doorStyle,
      pullOutAccessory: mod.options.doorAccessories?.[i] ?? null,
      pullOut: mod.options.doorPullOut?.[i] ?? false,
    };
  });
}

// Whether a material has a map at all changes which shader variant Three.js
// compiles — mutating an *existing* material between "no map" and "map" (e.g.
// a side panel switched to "exterior", or a countertop given a texture that
// was "ninguna") doesn't reliably force that recompile: setting
// `material.needsUpdate = true` didn't do it either (still rendered flat
// white until something else — a full page reload — created the material
// fresh with the map already in place). Keying the JSX element on this forces
// React to construct a brand-new material instead, always correctly compiled
// for whatever map it starts with.
export function mapKey(map: Texture | null | undefined): string {
  return map ? "tex" : "flat";
}

// ─── Hardware finish → handle/pull appearance ─────────────────────────────────
// "Sin jaladores" isn't a finish at all — it means the door/drawer has no pull,
// so its handle mesh is skipped entirely rather than given a look.
const HARDWARE_LOOKS: Record<Exclude<HardwareFinish, "Sin jaladores">, { color: string; metalness: number; roughness: number }> = {
  "Acero inoxidable": { color: "#c9cdd1", metalness: 0.85, roughness: 0.25 },
  "Negro mate": { color: "#1c1c1c", metalness: 0.3, roughness: 0.65 },
  "Dorado": { color: "#d4af37", metalness: 0.9, roughness: 0.2 },
  "Bronce": { color: "#8c6239", metalness: 0.75, roughness: 0.35 },
  "Cromo": { color: "#e8eaec", metalness: 0.95, roughness: 0.08 },
};

// ─── Primitives ───────────────────────────────────────────────────────────────
function Box({
  pos,
  size,
  color,
  opacity = 1,
  roughness = 0.72,
  metalness = 0.04,
  wireframe = false,
  map = null,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  wireframe?: boolean;
  /** Wood-grain texture for exterior-visible faces — takes over from `color` when set. */
  map?: Texture | null;
}) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        key={mapKey(map)}
        color={map ? "#ffffff" : color}
        map={map ?? undefined}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
        wireframe={wireframe}
      />
    </mesh>
  );
}

// ─── Carcass (5 panels) ────────────────────────────────────────────────────────
// Left/right side panels are optional: a module marked "ninguno" on that side
// (because a neighboring module already covers it) renders without that panel.
function Carcass({ W, H, D, color, leftColor, rightColor, leftMap, rightMap, hasTop = true, hasBack = true, wireframe = false }: {
  W: number; H: number; D: number; color: string; leftColor: string | null; rightColor: string | null;
  leftMap?: Texture | null; rightMap?: Texture | null;
  // A module with its own countertop doesn't get a separate interior-board
  // top panel underneath it — the countertop slab rests directly on the
  // sides/back and closes the box itself, same as a real cabinet build.
  hasTop?: boolean;
  // Sink cabinets (bajo_tarja) skip the back panel entirely — that's where
  // the supply lines and drain trap need to pass through to the wall, so a
  // real sink base is built without one.
  hasBack?: boolean;
  wireframe?: boolean;
}) {
  const iW = W - T * 2;
  const iH = H - T * 2;
  const darkColor = shiftColor(color, -0.12);
  return (
    <group>
      {leftColor && <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={leftColor} map={leftMap} wireframe={wireframe} />}
      {rightColor && <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={rightColor} map={rightMap} wireframe={wireframe} />}
      {hasTop && <Box pos={[0, H - T / 2, 0]} size={[iW, T, D]} color={color} wireframe={wireframe} />}
      <Box pos={[0, T / 2, 0]} size={[iW, T, D]} color={color} wireframe={wireframe} />
      {hasBack && <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[iW, iH, T]} color={darkColor} roughness={0.85} wireframe={wireframe} />}
    </group>
  );
}

// ─── Shelves (interior, evenly spaced between floor and top panel) ───────────
function Shelves({ W, H, D, count, toeKick, ctThick, color, wireframe = false }: {
  W: number; H: number; D: number; count: number; toeKick: number; ctThick: number; color: string; wireframe?: boolean;
}) {
  if (count <= 0) return null;
  const iW = W - T * 2;
  const bottomY = toeKick + T;
  const topY = H - ctThick - T;
  const usableH = Math.max(topY - bottomY, 0);
  const shelfColor = shiftColor(color, -0.04);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const y = bottomY + (usableH * (i + 1)) / (count + 1);
        return <Box key={i} pos={[0, y, 0]} size={[iW, T, D - 0.01]} color={shelfColor} wireframe={wireframe} />;
      })}
    </>
  );
}

// ─── Toe Kick ─────────────────────────────────────────────────────────────────
function ToeKick({ W, D, height, color, map, roughness, aluminum = false, wireframe = false }: {
  W: number; D: number; height: number; color: string; map?: Texture | null; roughness?: number;
  // Brushed-aluminum strip look (zocaloMaterial: "Aluminio") instead of the
  // painted/finished board look every other toe-kick uses.
  aluminum?: boolean; wireframe?: boolean;
}) {
  if (height <= 0) return null;
  return aluminum
    ? <Box pos={[0, height / 2, D / 2 - 0.03]} size={[W, height, 0.04]} color="#c7ccd1" roughness={0.28} metalness={0.75} wireframe={wireframe} />
    : <Box pos={[0, height / 2, D / 2 - 0.03]} size={[W, height, 0.04]} color={color} map={map} roughness={roughness} wireframe={wireframe} />;
}

// Fillers sit proud of the carcass front by this much — enough that their
// front face is never coplanar with the carcass/side-panel front (which
// caused heavy z-fighting flicker while orbiting: two surfaces at the exact
// same depth fighting over which one the depth test keeps each frame) while
// staying clearly behind the doors/drawers (~9-10mm proud) they're meant to
// read as recessed relative to.
const FILLER_PROUD = 0.003;

// ─── Side filler (scrap-material reveal strip) ────────────────────────────────
// Doors/drawers only span the carcass's interior width, leaving a board-
// thickness-wide reveal at each side, floor to ceiling — a real gap when that
// side has no panel ("ninguno"), or a stark white sliver of interior board
// peeking out next to it when the side *does* have one ("interior", recessed
// behind the door plane so it catches shadow from the doors on both sides).
// In the shop this reveal gets covered with a thin filler strip cut from
// scrap, finished to match the exterior — visual only, no new board, so it
// never enters the cost breakdown. Only skipped when the side is already set
// to "exterior", which already shows this same finish across its full depth.
function SideFiller({ side, W, H, D, color, map, roughness, wireframe = false }: {
  side: "left" | "right"; W: number; H: number; D: number;
  color: string; map?: Texture | null; roughness?: number; wireframe?: boolean;
}) {
  const fillerDepth = 0.025;
  const x = side === "left" ? -W / 2 + T / 2 : W / 2 - T / 2;
  const z = D / 2 + FILLER_PROUD - fillerDepth / 2;
  return <Box pos={[x, H / 2, z]} size={[T, H, fillerDepth]} color={color} map={map} roughness={roughness} wireframe={wireframe} />;
}

// ─── Top filler (mounting-rail reveal) ────────────────────────────────────────
// Mirrors SideFiller for the horizontal counterpart: TOP_FACE_MARGIN_CM (see
// getEffectiveDrawers/getEffectiveDoors) reserves a structural rail's worth of
// height above the top-most door/drawer for mounting hardware, and nothing
// ever drew a front over it — just bare (white) carcass showing through right
// under the countertop.
function TopFiller({ W, D, yCenter, marginH, color, map, roughness, wireframe = false }: {
  W: number; D: number; yCenter: number; marginH: number;
  color: string; map?: Texture | null; roughness?: number; wireframe?: boolean;
}) {
  if (marginH <= 0) return null;
  const fillerDepth = 0.025;
  const z = D / 2 + FILLER_PROUD - fillerDepth / 2;
  return <Box pos={[0, yCenter, z]} size={[W, marginH, fillerDepth]} color={color} map={map} roughness={roughness} wireframe={wireframe} />;
}
// ─── Alambrín (decorative chrome wire-lattice panel) ──────────────────────────
// A grid of thin metallic bars filling a rectangular face — used for a
// desayunador's exposed back and as a side-panel material option, instead of
// a solid board. `horizontal` picks which two axes the face spans: true = the
// XY plane (width × height, thin along Z — a back panel); false = the ZY
// plane (depth × height, thin along X — a side panel).
function AlambrinPanel({ pos, faceW, faceH, horizontal, wireframe = false }: {
  pos: [number, number, number]; faceW: number; faceH: number; horizontal: boolean; wireframe?: boolean;
}) {
  const barColor = "#c7ccd1";
  const bar = 0.012;
  const GAP = 0.06;
  const cols = Math.max(Math.round(faceW / GAP), 2);
  const rows = Math.max(Math.round(faceH / GAP), 2);
  const bars: ReactNode[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = pos[1] - faceH / 2 + (faceH * i) / rows;
    bars.push(
      <Box
        key={`h${i}`}
        pos={[pos[0], y, pos[2]]}
        size={horizontal ? [faceW, bar, bar] : [bar, bar, faceW]}
        color={barColor} metalness={0.75} roughness={0.25} wireframe={wireframe}
      />
    );
  }
  for (let j = 0; j <= cols; j++) {
    const offset = -faceW / 2 + (faceW * j) / cols;
    const p: [number, number, number] = horizontal ? [pos[0] + offset, pos[1], pos[2]] : [pos[0], pos[1], pos[2] + offset];
    bars.push(<Box key={`v${j}`} pos={p} size={[bar, faceH, bar]} color={barColor} metalness={0.75} roughness={0.25} wireframe={wireframe} />);
  }
  return <group>{bars}</group>;
}

// ─── Pull-out accessory (nested behind a door, see DoorPanel) ─────────────────
// Local coordinates centered at [0,0,0] — the caller (DoorPanel) positions
// and slides the whole group, this just draws whichever accessory fits in a
// W×H×D box. Geometry ported straight from the old standalone accessory
// modules of the same types.
function PullOutAccessoryMesh({ type, W, H, D, wireframe = false }: {
  type: PullOutAccessoryType; W: number; H: number; D: number; wireframe?: boolean;
}) {
  if (type === "canasta_especiero_cromado") {
    // A stack of shallow chrome wire-basket tiers on rails.
    const tiers = 3;
    return (
      <group>
        {Array.from({ length: tiers }, (_, i) => {
          const y = -H / 2 + (H * (i + 0.5)) / tiers;
          return <AlambrinPanel key={i} pos={[0, y, 0]} faceW={W} faceH={D} horizontal wireframe={wireframe} />;
        })}
        <Box pos={[0, 0, D / 2 - 0.01]} size={[0.012, H, 0.012]} color="#aab0b4" metalness={0.85} roughness={0.2} wireframe={wireframe} />
      </group>
    );
  }

  if (type === "basurero_extraible") {
    // A pair of bins on a pull-out platform.
    // One behind the other along the depth — matches how a real double-bin
    // pull-out sits inside a single door (front bin, back bin), not side by
    // side across the width.
    const binR = Math.min(W * 0.42, (D / 2) * 0.85);
    return (
      <group>
        <Box pos={[0, -H / 2 + 0.01, 0]} size={[W, 0.02, D]} color="#8a8a8a" metalness={0.4} roughness={0.5} wireframe={wireframe} />
        {[-D / 4, D / 4].map((z, i) => (
          <mesh key={i} position={[0, 0, z]}>
            <cylinderGeometry args={[binR, binR * 0.9, H, 16]} />
            <meshStandardMaterial color="#3c3c3c" roughness={0.6} wireframe={wireframe} />
          </mesh>
        ))}
      </group>
    );
  }

  // soporte_garrafon — a pull-out platform with a large water jug on top.
  const jugR = Math.min(W, D) * 0.36;
  return (
    <group>
      <Box pos={[0, -H / 2 + 0.015, 0]} size={[W, 0.03, D]} color="#8a8a8a" metalness={0.4} roughness={0.5} wireframe={wireframe} />
      {!wireframe && (
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[jugR, jugR * 1.08, H * 0.85, 16]} />
          <meshStandardMaterial color="#bfe0e8" transparent opacity={0.55} roughness={0.15} />
        </mesh>
      )}
    </group>
  );
}

// ─── Campanero (trapezoidal hood cabinet) ────────────────────────────────────
// Wider upper box + tapered skirt + stainless hood visible at the bottom.
function CampaneroMesh({ W, H, D, color, wireframe = false }: { W: number; H: number; D: number; color: string; wireframe?: boolean }) {
  // Upper cabinet box: occupies top ~65% of total height
  const boxH = H * 0.65;
  const boxY = H - boxH / 2;            // centre of the upper box
  const skirtH = H * 0.35;             // tapered skirt height
  const skirtBotW = W * 0.55;          // narrow bottom of skirt
  const skirtTopW = W;                  // wide top (same as box)
  const darkColor = shiftColor(color, -0.1);

  // Hood body (stainless): narrow box sitting below the skirt
  const hoodH = skirtH * 0.5;
  const hoodW = skirtBotW;
  const hoodY = hoodH / 2;

  return (
    <group>
      {/* ── Upper box ── */}
      <Box pos={[0, boxY, 0]} size={[W, boxH, D]} color={color} wireframe={wireframe} />
      {/* Back panel darker */}
      {!wireframe && <Box pos={[0, boxY, -D / 2 + T / 2]} size={[W - T * 2, boxH - T * 2, T]} color={darkColor} roughness={0.85} />}

      {/* ── Tapered skirt panels (4 faces of a truncated pyramid) ── */}
      {/* Front face */}
      <Box
        pos={[0, skirtH / 2, D / 2 - T / 2]}
        size={[W, skirtH, T]}
        color={shiftColor(color, 0.03)}
        wireframe={wireframe}
      />
      {/* Back face */}
      <Box
        pos={[0, skirtH / 2, -D / 2 + T / 2]}
        size={[W, skirtH, T]}
        color={darkColor}
        wireframe={wireframe}
      />
      {/* Left face — angled: use full width at top, narrow at bottom */}
      <Box
        pos={[-(skirtBotW / 2 + (W - skirtBotW) / 4), skirtH / 2, 0]}
        size={[T, skirtH, D]}
        color={color}
        wireframe={wireframe}
      />
      {/* Right face */}
      <Box
        pos={[(skirtBotW / 2 + (W - skirtBotW) / 4), skirtH / 2, 0]}
        size={[T, skirtH, D]}
        color={color}
        wireframe={wireframe}
      />

      {/* ── Hood body (stainless steel) ── */}
      {!wireframe && (
        <>
          <mesh position={[0, hoodY, 0]} castShadow>
            <boxGeometry args={[hoodW, hoodH, D * 0.85]} />
            <meshStandardMaterial color="#a0a8a8" metalness={0.85} roughness={0.18} />
          </mesh>
          {/* Grease filter grille — thin horizontal slats */}
          {Array.from({ length: 4 }, (_, i) => (
            <mesh key={i} position={[0, hoodY * 0.35 + i * (hoodH * 0.18), D / 2 - 0.005]}>
              <boxGeometry args={[hoodW * 0.88, 0.006, 0.012]} />
              <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {/* Suction indicator light strip */}
          <mesh position={[0, hoodY * 1.55, D / 2 - 0.003]}>
            <boxGeometry args={[hoodW * 0.6, 0.008, 0.004]} />
            <meshStandardMaterial color="#ffe0a0" emissive="#ffe080" emissiveIntensity={1.5} />
          </mesh>
        </>
      )}
    </group>
  );
}
// ─── Stove Carcass (open top — no top panel) ────────────────────────────────
function StoveCarcass({ W, H, D, color, leftColor, rightColor, leftMap, rightMap, wireframe = false }: {
  W: number; H: number; D: number; color: string; leftColor: string | null; rightColor: string | null;
  leftMap?: Texture | null; rightMap?: Texture | null; wireframe?: boolean;
}) {
  const iW = W - T * 2;
  const iH = H - T; // height from bottom panel to top edge (no top board)
  const darkColor = shiftColor(color, -0.12);
  return (
    <group>
      {leftColor && <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={leftColor} map={leftMap} wireframe={wireframe} />}
      {rightColor && <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={rightColor} map={rightMap} wireframe={wireframe} />}
      <Box pos={[0, T / 2, 0]} size={[iW, T, D]} color={color} wireframe={wireframe} />
      <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[iW, iH, T]} color={darkColor} roughness={0.85} wireframe={wireframe} />
      {/* No top panel — stove rests across the opening */}
    </group>
  );
}

// ─── Stove Surface (plate + burner rings + grates) ────────────────────────────
function StoveSurface({ W, H, D }: { W: number; H: number; D: number }) {
  const pt = 0.026; // plate thickness
  const surfY = H + pt + 0.003;
  const bX = W * 0.24;
  const bZ = D * 0.2;
  type Burner = { pos: [number, number, number]; r: number; tube: number };
  const burners: Burner[] = [
    { pos: [-bX, surfY, bZ],  r: 0.054, tube: 0.016 }, // front-left  big
    { pos: [ bX, surfY, bZ],  r: 0.037, tube: 0.011 }, // front-right small
    { pos: [-bX, surfY, -bZ], r: 0.044, tube: 0.013 }, // back-left   medium
    { pos: [ bX, surfY, -bZ], r: 0.037, tube: 0.011 }, // back-right  small
  ];
  return (
    <group>
      {/* Stainless steel top plate */}
      <mesh position={[0, H + pt / 2, 0]} castShadow>
        <boxGeometry args={[W, pt, D]} />
        <meshStandardMaterial color="#a8a8a8" metalness={0.88} roughness={0.18} />
      </mesh>
      {burners.map(({ pos, r, tube }, i) => (
        <group key={i}>
          {/* Cast-iron burner ring */}
          <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, tube, 8, 28]} />
            <meshStandardMaterial color="#1e1e1e" metalness={0.4} roughness={0.75} />
          </mesh>
          {/* Grate crossbar — horizontal */}
          <mesh position={[pos[0], pos[1] + 0.006, pos[2]]}>
            <boxGeometry args={[r * 2.3, 0.008, 0.009]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.6} />
          </mesh>
          {/* Grate crossbar — vertical */}
          <mesh position={[pos[0], pos[1] + 0.006, pos[2]]}>
            <boxGeometry args={[0.009, 0.008, r * 2.3]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Countertop drop edge (postformed "waterfall" front) ─────────────────────
// A real postformed countertop isn't a flat slab with a hard 90° edge — the
// front rolls over in a rounded drop that covers a couple cm of the cabinet
// face right below it. Built as a quarter-round: tangent to the counter's
// flat underside at the top, tangent to a straight vertical drop at the
// bottom, so it reads as one continuous curved lip rather than a separate part.
// Front edge as a full bullnose: a half-circle whose diameter equals the
// slab's own thickness, tangent to the top surface at its top and the
// underside at its bottom — the whole front face becomes the curve, instead
// of a small radius hung off an otherwise-flat vertical edge (which read as
// a lopsided, cut-off curve rather than a proper rounded-over edge).
export function CountertopDropEdge({ W, bottomY, thickness, flatZ, color, map, roughness, metalness, wireframe = false }: {
  W: number; bottomY: number; thickness: number; flatZ: number;
  color: string; map?: Texture | null; roughness?: number; metalness?: number; wireframe?: boolean;
}) {
  const radius = thickness / 2;
  return (
    <mesh position={[0, bottomY + radius, flatZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, W, 24, 1, false, -Math.PI / 2, Math.PI]} />
      <meshStandardMaterial
        key={mapKey(map)}
        color={map ? "#ffffff" : color}
        map={map ?? undefined}
        roughness={roughness}
        metalness={metalness}
        wireframe={wireframe}
        side={2}
      />
    </mesh>
  );
}

// ─── Countertop ───────────────────────────────────────────────────────────────
function Countertop({
  W, H, D, ctThick, ctOverhang, hasSink, hasGrill, ctColor = "#8e8070", ctMap = null, ctRoughness = 0.35, ctMetalness = 0.08,
  backOverhang = 0, wireframe = false,
}: {
  W: number; H: number; D: number; ctThick: number; ctOverhang: number;
  hasSink: boolean; hasGrill?: boolean; ctColor?: string; ctMap?: Texture | null; ctRoughness?: number; ctMetalness?: number;
  // Desayunador only — extra slab depth added on the BACK side (unsupported
  // overhang toward the seating side), on top of the carcass's own depth.
  backOverhang?: number;
  wireframe?: boolean;
}) {
  // Basin sits 2mm above countertop top — eliminates z-fighting; depth is realistic 18cm
  const basinH = 0.18;
  const basinTopY = H + ctThick + 0.002;
  const basinY = basinTopY - basinH / 2;
  // The bullnose radius equals the slab thickness — its top half rounds over
  // the countertop itself (tangent to the top surface), and its bottom half
  // keeps curving past the underside to cover a bit of the cabinet face below.
  const dropR = ctThick;
  const frontZ = D / 2 + ctOverhang;
  const flatZ = frontZ - dropR;
  const backZ = -D / 2 - backOverhang;
  // Slab pokes ~1cm proud of the carcass on each side.
  const PAD = 0.01;
  const slabW = W + PAD * 2;
  const slabX = 0;
  return (
    <group>
      <Box
        pos={[slabX, H + ctThick / 2, (flatZ + backZ) / 2]}
        size={[slabW, ctThick, flatZ - backZ]}
        color={ctColor}
        map={ctMap}
        roughness={ctRoughness}
        metalness={ctMetalness}
        wireframe={wireframe}
      />
      <group position={[slabX, 0, 0]}>
        <CountertopDropEdge W={slabW} bottomY={H - dropR} thickness={2 * dropR} flatZ={flatZ} color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe} />
      </group>
      {hasSink && !wireframe && (
        <>
          {/* Sink basin */}
          <Box
            pos={[0, basinY, ctOverhang / 2]}
            size={[W * 0.62, basinH, D * 0.58]}
            color="#606868"
            roughness={0.3}
            metalness={0.6}
          />
          {/* Drain */}
          <mesh position={[0, basinTopY - basinH + 0.003, ctOverhang / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.005, 16]} />
            <meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Faucet stem */}
          <mesh position={[0, H + ctThick + 0.06, -D / 2 + 0.08]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
            <meshStandardMaterial color="#aaa" metalness={0.9} roughness={0.15} />
          </mesh>
          {/* Faucet spout */}
          <mesh position={[0, H + ctThick + 0.12, -D / 2 + 0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.009, 0.009, 0.16, 8]} />
            <meshStandardMaterial color="#aaa" metalness={0.9} roughness={0.15} />
          </mesh>
        </>
      )}
      {hasGrill && !wireframe && (
        <>
          {/* Recessed opening the built-in grill drops into */}
          <Box
            pos={[0, basinY, ctOverhang / 2]}
            size={[W * 0.6, basinH, D * 0.55]}
            color="#2a2a2a"
            roughness={0.6}
            metalness={0.2}
          />
          {/* Stainless rim flush with the countertop top, framing the opening */}
          <mesh position={[0, basinTopY - 0.002, ctOverhang / 2]}>
            <boxGeometry args={[W * 0.64, 0.004, D * 0.59]} />
            <meshStandardMaterial color="#b5b5b5" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Grill grates — a couple of cast-iron bars sitting in the opening */}
          {[-D * 0.14, 0, D * 0.14].map((gz, i) => (
            <mesh key={i} position={[0, basinTopY - basinH * 0.3, ctOverhang / 2 + gz]}>
              <boxGeometry args={[W * 0.52, 0.014, 0.03]} />
              <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.7} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

// ─── Drawer Face Mesh ─────────────────────────────────────────────────────────
function DrawerFace({
  drawer, W, D, toeKick, color, map, roughness, hardware = "Acero inoxidable", wireframe = false, onSelect, interiorColor,
}: {
  drawer: DrawerDef; W: number; D: number; toeKick: number; color: string;
  map?: Texture | null; roughness?: number; hardware?: HardwareFinish; wireframe?: boolean; onSelect?: () => void;
  /** Interior-board tone for the drawer box (sides/back/bottom) revealed when open. */
  interiorColor?: string;
}) {
  const iW = W - T * 2;
  const fW = (drawer.widthPct / 100) * iW - 0.003;
  const fH = drawer.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (drawer.offsetPct / 100) * iW + fW / 2;
  const cy = toeKick + T + drawer.fromBottomCm / 100 + fH / 2;
  const cz = D / 2 + 0.009;

  const faceColor = drawer.isGhost ? shiftColor(color, 0.02) : shiftColor(color, 0.05);
  const faceMap = drawer.isGhost ? null : map; // ghost drawers stay flat-shaded, they're not a real visible front
  const openDist = Math.min(D * 0.65, 0.42);
  const handleLook = hardware === "Sin jaladores" ? null : HARDWARE_LOOKS[hardware];

  const canOpen = !drawer.isGhost;
  const [open, setOpen] = useState(false);
  const slideRef = useRef<Group>(null);
  const target = open ? openDist : 0;

  useFrame((_, delta) => {
    if (!slideRef.current) return;
    slideRef.current.position.z = MathUtils.damp(slideRef.current.position.z, target, DAMP_SPEED, delta);
  });

  // The box behind a real drawer's front — sides, back and bottom — so
  // sliding it open reveals an actual drawer instead of a bare floating
  // panel. Narrower/shorter than the face opening (board thickness on each
  // side, a bit of vertical clearance) and set back from the carcass' true
  // rear to leave room for the slide mechanism, mirroring the same box
  // dimensions the cost/cut-list calc already assumes.
  const boxW = Math.max(fW - 2 * T, 0.02);
  const boxH = Math.max(fH - 0.01, 0.02);
  const boxD = Math.max(D - 0.1, 0.1);
  const boxFrontZ = D / 2 - 0.005;
  const boxCenterZ = boxFrontZ - boxD / 2;
  const boxTone = shiftColor(interiorColor ?? color, -0.03);

  return (
    <group ref={slideRef}>
      <mesh
        position={[cx, cy, cz]}
        castShadow
        receiveShadow
        onPointerDown={canOpen ? (e) => e.stopPropagation() : undefined}
        onContextMenu={canOpen ? (e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); } : undefined}
        onDoubleClick={canOpen ? (e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); } : undefined}
        onPointerOver={canOpen ? (e) => { e.stopPropagation(); setGrabCursor(true); } : undefined}
        onPointerOut={canOpen ? () => setGrabCursor(false) : undefined}
      >
        <boxGeometry args={[fW, fH, 0.017]} />
        <meshStandardMaterial
          key={mapKey(faceMap)}
          color={faceMap ? "#ffffff" : faceColor}
          map={faceMap ?? undefined}
          transparent={drawer.isGhost}
          opacity={drawer.isGhost ? 0.72 : 1}
          roughness={roughness ?? (drawer.isGhost ? 0.8 : 0.65)}
          wireframe={wireframe}
        />
      </mesh>
      {!wireframe && handleLook && (
        <>
          {/* Handle — same for real and ghost, ghost handle slightly dimmer */}
          {drawer.orientation === "vertical"
            ? <Box pos={[cx, cy, cz + 0.01]} size={[0.007, Math.min(fH * 0.25, 0.065), 0.006]} color={handleLook.color} roughness={drawer.isGhost ? handleLook.roughness + 0.2 : handleLook.roughness} metalness={handleLook.metalness} />
            : <Box pos={[cx, cy, cz + 0.01]} size={[Math.min(fW * 0.38, 0.095), 0.007, 0.006]} color={handleLook.color} roughness={drawer.isGhost ? handleLook.roughness + 0.2 : handleLook.roughness} metalness={handleLook.metalness} />
          }
        </>
      )}
      {canOpen && (
        <>
          <Box pos={[cx - boxW / 2 + T / 2, cy, boxCenterZ]} size={[T, boxH, boxD]} color={boxTone} wireframe={wireframe} />
          <Box pos={[cx + boxW / 2 - T / 2, cy, boxCenterZ]} size={[T, boxH, boxD]} color={boxTone} wireframe={wireframe} />
          <Box pos={[cx, cy, boxFrontZ - boxD + T / 2]} size={[boxW, boxH, T]} color={boxTone} wireframe={wireframe} />
          <Box pos={[cx, cy - boxH / 2 + T / 2, boxCenterZ]} size={[boxW, T, boxD]} color={boxTone} wireframe={wireframe} />
        </>
      )}
    </group>
  );
}

// ─── Door Panel Mesh ──────────────────────────────────────────────────────────
function DoorPanel({
  door, W, D, toeKick, color, map, roughness, hardware = "Acero inoxidable", wireframe = false, onSelect,
}: {
  door: DoorDef; W: number; D: number; toeKick: number; color: string;
  map?: Texture | null; roughness?: number; hardware?: HardwareFinish; wireframe?: boolean; onSelect?: () => void;
}) {
  const iW = W - T * 2;
  const dW = (door.widthPct / 100) * iW - 0.003;
  const dH = door.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (door.offsetPct / 100) * iW + dW / 2;
  const cy = toeKick + T + door.fromBottomCm / 100 + dH / 2;
  const cz = D / 2 + 0.01;
  const upOpening = !!door.hingeTop;

  // Pivot (hinge) sits at the group origin — the door panel is offset from it
  // so that rotating the group swings the door around the hinge edge. A
  // normal door pivots around Y at its left/right edge; an upward-opening
  // (flap/awning) door — upper cabinets only — hinges along its TOP edge and
  // pivots around X instead, so the offset moves to Y rather than X. The
  // door hangs flush below the pivot when closed; opening it swings the
  // bottom (free) edge outward and up, away from the cabinet — never down or
  // back into the carcass.
  const hx = upOpening ? cx : door.hingeLeft ? cx - dW / 2 + 0.012 : cx + dW / 2 - 0.012;
  const hy = upOpening ? cy + dH / 2 - 0.012 : cy;
  const localX = upOpening ? 0 : cx - hx;
  const localY = upOpening ? cy - hy : 0;
  const handleLocalX = upOpening ? 0 : door.hingeLeft ? localX + dW / 2 - 0.04 : localX - dW / 2 + 0.04;
  const handleLocalY = upOpening ? localY - dH / 2 + 0.04 : 0;
  const handleLook = hardware === "Sin jaladores" ? null : HARDWARE_LOOKS[hardware];
  // Real cabinet doors carry a small hinge plate near the top and bottom
  // edges (or, for an upward-opening door, near the two ends of its top
  // edge) rather than one strip running down the middle — a third one is
  // added at the center once the door reaches 1m, matching typical hardware.
  const hingeCount = door.heightCm >= 100 ? 3 : 2;
  const hingeSpan = upOpening ? dW : dH;
  const hingeInset = Math.min(hingeSpan * 0.42, 0.1);
  const hingeOffsets = hingeCount === 3 ? [hingeSpan / 2 - hingeInset, 0, -hingeSpan / 2 + hingeInset] : [hingeSpan / 2 - hingeInset, -hingeSpan / 2 + hingeInset];

  const [open, setOpen] = useState(false);
  const pivotRef = useRef<Group>(null);
  // Side doors always swing outward (+Z, toward the room) regardless of
  // hinge side. A top-hinged door swings outward too — its free (bottom)
  // edge rises and moves toward the room as it opens, ending up roughly
  // horizontal like an awning, never dipping down or into the carcass.
  const target = open ? (upOpening || door.hingeLeft ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE) : 0;

  // A pull-out nested behind this door (canasta/basurero/soporte garrafón —
  // see PullOutAccessoryMesh) slides straight out on its own rails in sync
  // with the SAME open/close state, independent of the door's hinge swing —
  // it doesn't rotate with the door, just extends forward while it's open.
  const pullOutRef = useRef<Group>(null);
  const accessoryExtractDistance = Math.min(0.4, D * 0.7);
  const accessoryTargetZ = open ? accessoryExtractDistance : 0;

  useFrame((_, delta) => {
    if (pivotRef.current) {
      if (upOpening) {
        pivotRef.current.rotation.x = MathUtils.damp(pivotRef.current.rotation.x, target, DAMP_SPEED, delta);
      } else {
        pivotRef.current.rotation.y = MathUtils.damp(pivotRef.current.rotation.y, target, DAMP_SPEED, delta);
      }
    }
    if (pullOutRef.current) {
      pullOutRef.current.position.z = MathUtils.damp(pullOutRef.current.position.z, accessoryTargetZ, DAMP_SPEED, delta);
    }
  });

  return (
    <>
      <group ref={pivotRef} position={[hx, hy, cz]}>
        {/* Right-click (desktop) / double-tap (touch, no right-click there)
            toggles it open — a plain single click/tap used to do this and
            ate the drag-to-orbit gesture starting from a door. */}
        <mesh
          position={[localX, localY, 0]}
          castShadow
          receiveShadow
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
          onDoubleClick={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
          onPointerOver={(e) => { e.stopPropagation(); setGrabCursor(true); }}
          onPointerOut={() => setGrabCursor(false)}
        >
          <boxGeometry args={[dW, dH, 0.019]} />
          <meshStandardMaterial
            key={mapKey(map)}
            color={map ? "#ffffff" : shiftColor(color, 0.04)}
            map={map ?? undefined}
            roughness={roughness ?? 0.62}
            wireframe={wireframe}
          />
        </mesh>
        {!wireframe && (
          <>
            {/* Concealed cup hinges — mounted on the door's back face at the
                hinge edge, like real European-style hinges, so they're hidden
                behind the door when closed and only show if you look at it
                from the side/inside once it's open. */}
            {hingeOffsets.map((ho, i) => (
              <Box
                key={`hinge${i}`}
                pos={upOpening ? [ho, 0, -0.013] : [0, ho, -0.013]}
                size={upOpening ? [0.032, 0.014, 0.006] : [0.014, 0.032, 0.006]}
                color="#888" roughness={0.4} metalness={0.4}
              />
            ))}
            {/* Handle bar */}
            {handleLook && (
              <Box
                pos={upOpening ? [0, handleLocalY, 0.012] : [handleLocalX, 0, 0.012]}
                size={upOpening ? [dW * 0.22, 0.008, 0.006] : [0.008, dH * 0.22, 0.006]}
                color={handleLook.color} roughness={handleLook.roughness} metalness={handleLook.metalness}
              />
            )}
          </>
        )}
      </group>
      {door.pullOutAccessory && (
        <group ref={pullOutRef} position={[cx, cy, 0]}>
          <PullOutAccessoryMesh type={door.pullOutAccessory} W={dW * 0.85} H={dH * 0.7} D={D * 0.75} wireframe={wireframe} />
        </group>
      )}
    </>
  );
}

// ─── Pull-out larder door ──────────────────────────────────────────────────────
// Opens by sliding straight forward on rails, like a drawer front — not by
// swinging around a hinge — since real pull-out larder units extend on
// telescopic slides. The shelves mount rigidly to this same sliding group so
// they travel with the door.
const PULL_OUT_DISTANCE = 0.42;

function PullOutLarderDoor({
  door, W, D, toeKick, color, map, roughness, hardware = "Acero inoxidable", wireframe = false, onSelect,
  shelfCount, shelfColor, accessory,
}: {
  door: DoorDef; W: number; D: number; toeKick: number; color: string;
  map?: Texture | null; roughness?: number; hardware?: HardwareFinish; wireframe?: boolean; onSelect?: () => void;
  shelfCount: number; shelfColor?: string;
  // A specific pull-out (canasta/basurero/soporte garrafón) rides on this
  // sliding door instead of the module's own fixed shelves, when set.
  accessory?: PullOutAccessoryType | null;
}) {
  const iW = W - T * 2;
  const dW = (door.widthPct / 100) * iW - 0.003;
  const dH = door.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (door.offsetPct / 100) * iW + dW / 2;
  const cy = toeKick + T + door.fromBottomCm / 100 + dH / 2;
  const closedZ = D / 2 + 0.01;
  const handleLook = hardware === "Sin jaladores" ? null : HARDWARE_LOOKS[hardware];

  // Shelves ride just behind the door face, shallower than the full cabinet
  // depth so they clear the fixed carcass sides/back when retracted.
  const shelfDepth = Math.max(D - 0.06, 0.1);
  const shelfZ = -(0.02 + shelfDepth / 2);
  const shelfWidth = dW - 0.02;
  const shelfTone = shiftColor(shelfColor ?? color, -0.04);
  // This door has no carcass sides/bottom of its own — the bottommost shelf
  // sits right at floor level and effectively serves as the unit's own base
  // rather than floating above it like an evenly-spaced fixed shelf would.
  // The rest are evenly spaced in the space that's left above it, same as a
  // normal cabinet's shelves — leaving headroom below the top instead of the
  // topmost one landing flush against it like a ceiling.
  const shelfFloorY = -dH / 2 + T / 2;
  const shelfTopY = dH / 2 - T / 2;
  const shelfYs = shelfCount <= 1
    ? [shelfFloorY]
    : [
        shelfFloorY,
        ...Array.from({ length: shelfCount - 1 }, (_, i) => shelfFloorY + ((i + 1) / shelfCount) * (shelfTopY - shelfFloorY)),
      ];

  const [open, setOpen] = useState(false);
  const groupRef = useRef<Group>(null);
  const pullDistance = Math.min(PULL_OUT_DISTANCE, D * 0.75);
  const target = closedZ + (open ? pullDistance : 0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.z = MathUtils.damp(groupRef.current.position.z, target, DAMP_SPEED, delta);
  });

  return (
    <group ref={groupRef} position={[cx, cy, closedZ]}>
      <mesh
        castShadow
        receiveShadow
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
        onDoubleClick={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); setGrabCursor(true); }}
        onPointerOut={() => setGrabCursor(false)}
      >
        <boxGeometry args={[dW, dH, 0.019]} />
        <meshStandardMaterial
          key={mapKey(map)}
          color={map ? "#ffffff" : shiftColor(color, 0.04)}
          map={map ?? undefined}
          roughness={roughness ?? 0.62}
          wireframe={wireframe}
        />
      </mesh>
      {/* A centered horizontal pull — no hinge side to bias it toward on a sliding front */}
      {!wireframe && handleLook && (
        <Box pos={[0, 0, 0.012]} size={[dW * 0.5, 0.008, 0.006]} color={handleLook.color} roughness={handleLook.roughness} metalness={handleLook.metalness} />
      )}
      {accessory ? (
        <group position={[0, 0, shelfZ]}>
          <PullOutAccessoryMesh type={accessory} W={shelfWidth} H={dH * 0.85} D={shelfDepth} wireframe={wireframe} />
        </group>
      ) : (
        shelfYs.map((y, i) => (
          <Box key={`shelf-${i}`} pos={[0, y, shelfZ]} size={[shelfWidth, T, shelfDepth]} color={shelfTone} wireframe={wireframe} />
        ))
      )}
    </group>
  );
}

// ─── Cava de vinos (20-hole bottle grid) — full carcass, no doors, with cut
// dividers forming a fixed 4-column × 5-row grid. Row/column counts mirror
// CAVA_VINOS_COLS/ROWS in kitchenData.ts's materials calculator. ─────────────
const CAVA_VINOS_COLS = 4;
const CAVA_VINOS_ROWS = 5;
function CavaVinosMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  const iW = W - T * 2;
  const rowH = H / CAVA_VINOS_ROWS;
  const colW = iW / CAVA_VINOS_COLS;
  const dividerColor = shiftColor(color, -0.04);

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} leftColor={color} rightColor={color} wireframe={wireframe} />
      {Array.from({ length: CAVA_VINOS_ROWS - 1 }, (_, i) => (
        <Box key={`h${i}`} pos={[0, rowH * (i + 1), 0]} size={[iW, T, D - 0.01]} color={dividerColor} wireframe={wireframe} />
      ))}
      {Array.from({ length: CAVA_VINOS_ROWS }, (_, r) =>
        Array.from({ length: CAVA_VINOS_COLS - 1 }, (_, c) => (
          <Box
            key={`v${r}-${c}`}
            pos={[-iW / 2 + colW * (c + 1), rowH * r + rowH / 2, 0]}
            size={[T, rowH - T, D - 0.01]}
            color={dividerColor}
            wireframe={wireframe}
          />
        ))
      )}
      {/* A handful of bottle hints (sparse — not every cell) for visual flavor */}
      {!wireframe &&
        Array.from({ length: CAVA_VINOS_ROWS }, (_, r) =>
          Array.from({ length: CAVA_VINOS_COLS }, (_, c) => {
            if ((r + c) % 2 === 0) return null;
            const cx = -iW / 2 + colW * c + colW / 2;
            const cy = rowH * r + rowH / 2;
            const bottleR = Math.min(rowH, colW) * 0.32;
            return (
              <mesh key={`b${r}-${c}`} position={[cx, cy, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[bottleR, bottleR, D * 0.85, 12]} />
                <meshStandardMaterial color="#2b3a2c" roughness={0.3} metalness={0.1} />
              </mesh>
            );
          })
        )}
    </group>
  );
}

// ─── Aéreo con hueco inferior — two abatible doors cover the full top zone;
// the bottom is left fully open (no door), split into two cubbies by one
// shelf. AEREO_HUECO_DOOR_ZONE_PCT mirrors kitchenData.ts's materials
// calculator. ──────────────────────────────────────────────────────────────
const AEREO_HUECO_DOOR_ZONE_PCT = 0.55;
function AereoHuecoInferiorMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" || module.options.leftSidePanel === "alambrin" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" || module.options.rightSidePanel === "alambrin" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;

  const doorZoneH = H * AEREO_HUECO_DOOR_ZONE_PCT;
  const openZoneH = H - doorZoneH;
  const cubbyMidY = openZoneH / 2;
  const dividerColor = shiftColor(color, -0.04);

  const doorDefs: DoorDef[] = [
    { id: "aereo-d0", label: "Puerta 1", widthPct: 50, offsetPct: 0, fromBottomCm: openZoneH * 100, heightCm: doorZoneH * 100, hingeLeft: true, doorStyle: module.options.doorStyle },
    { id: "aereo-d1", label: "Puerta 2", widthPct: 50, offsetPct: 50, fromBottomCm: openZoneH * 100, heightCm: doorZoneH * 100, hingeLeft: false, doorStyle: module.options.doorStyle },
  ];

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />
      {/* Divider between the closed door zone (top) and the open cubby zone below */}
      <Box pos={[0, openZoneH, 0]} size={[W - T * 2, T, D]} color={dividerColor} wireframe={wireframe} />
      {/* Divider splitting the open zone into two cubbies */}
      <Box pos={[0, cubbyMidY, 0]} size={[W - T * 2, T, D]} color={dividerColor} wireframe={wireframe} />
      {module.options.leftSidePanel === "alambrin" && (
        <AlambrinPanel pos={[-W / 2 + T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel === "alambrin" && (
        <AlambrinPanel pos={[W / 2 - T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} wireframe={wireframe} />
      )}
      {module.options.leftSidePanel !== "exterior" && (
        <SideFiller side="left" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel !== "exterior" && (
        <SideFiller side="right" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {doorDefs.map((d) => (
        <DoorPanel
          key={d.id} door={d} W={W} D={D} toeKick={0} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
          hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
        />
      ))}
    </group>
  );
}

// ─── Librero giratorio con espejo — fixed gray housing framing a second,
// separate body that spins 180° on a vertical axis through its own center.
// The housing's DEPTH sizes the rotating unit's front-facing WIDTH (has to
// clear the housing's side walls as it swings through), and the housing's
// WIDTH sizes the unit's THICKNESS (its usable shelf depth) — that's why the
// catalog default is narrow × deep, not square. At rest, a grid of shelves
// (LIBRERO_ROWS rows × 2 columns, one center divider) faces front; a
// full-size mirror closes the unit's back, so rotating 180° swaps which one
// faces the room. LIBRERO_ROWS/CLEARANCE mirror the constants of the same
// name in kitchenData.ts's materials calculator.
const LIBRERO_ROWS = 10;
const LIBRERO_CLEARANCE = 0.08;
function LibreroGiratorioMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const D = module.dimensions.depth / 100;
  const H = module.dimensions.height / 100;
  // Fixed housing is always gray, regardless of the module's own board
  // color — it's the defining look of this piece, not a finish choice.
  const housingColor = "#9a9a9a";
  const exteriorColor = module.options.exteriorColor || module.options.color || "#d4c5b0";
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const dividerColor = shiftColor(exteriorColor, -0.04);

  const unitW = Math.max(D - LIBRERO_CLEARANCE, 0.1);
  const unitThick = Math.max(W - LIBRERO_CLEARANCE, 0.05);
  const unitH = Math.max(H - LIBRERO_CLEARANCE, 0.1);
  const rowH = unitH / LIBRERO_ROWS;

  const [open, setOpen] = useState(false);
  const rotorRef = useRef<Group>(null);
  const target = open ? Math.PI : 0;

  useFrame((_, delta) => {
    if (!rotorRef.current) return;
    rotorRef.current.rotation.y = MathUtils.damp(rotorRef.current.rotation.y, target, DAMP_SPEED, delta);
  });

  return (
    <group>
      {/* Fixed outer housing — open front, just frames the rotating unit */}
      <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={housingColor} wireframe={wireframe} />
      <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={housingColor} wireframe={wireframe} />
      <Box pos={[0, H - T / 2, 0]} size={[W, T, D]} color={housingColor} wireframe={wireframe} />
      <Box pos={[0, T / 2, 0]} size={[W, T, D]} color={housingColor} wireframe={wireframe} />

      {/* Rotating unit — pivots on its own vertical center axis, at the
          housing's own horizontal/depth center. */}
      <group ref={rotorRef} position={[0, H / 2, 0]}>
        {/* Invisible hit target — click anywhere on the unit to spin it. */}
        <mesh
          visible={false}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
          onDoubleClick={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); setOpen((v) => !v); onSelect?.(); }}
          onPointerOver={(e) => { e.stopPropagation(); setGrabCursor(true); }}
          onPointerOut={() => setGrabCursor(false)}
        >
          <boxGeometry args={[unitW, unitH, Math.max(unitThick, 0.02)]} />
        </mesh>
        {/* Shelf grid — open front (local +Z), LIBRERO_ROWS rows × 2 columns */}
        <Box pos={[-unitW / 2 + T / 2, 0, 0]} size={[T, unitH, unitThick]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        <Box pos={[unitW / 2 - T / 2, 0, 0]} size={[T, unitH, unitThick]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        <Box pos={[0, unitH / 2 - T / 2, 0]} size={[unitW, T, unitThick]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        <Box pos={[0, -unitH / 2 + T / 2, 0]} size={[unitW, T, unitThick]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        <Box pos={[0, 0, 0]} size={[T, unitH, unitThick]} color={dividerColor} wireframe={wireframe} />
        {Array.from({ length: LIBRERO_ROWS - 1 }, (_, i) => {
          const y = -unitH / 2 + rowH * (i + 1);
          return <Box key={i} pos={[0, y, 0]} size={[unitW - T * 2, T, unitThick - 0.01]} color={dividerColor} wireframe={wireframe} />;
        })}
        {/* Mirror — closes the unit's back (local -Z); faces the room once spun
            180°. A real live reflection (drei's MeshReflectorMaterial — a second
            camera renders the room onto this surface each frame), not just a
            shiny flat material, so it actually shows whatever's in front of it. */}
        {wireframe ? (
          <Box pos={[0, 0, -unitThick / 2 - 0.004]} size={[unitW, unitH, 0.008]} color="#dfe8ec" wireframe />
        ) : (
          <mesh position={[0, 0, -unitThick / 2 - 0.004]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[unitW, unitH]} />
            <MeshReflectorMaterial
              resolution={512}
              mirror={1}
              blur={[0, 0]}
              mixBlur={0}
              mixStrength={5}
              depthScale={0}
              metalness={0.2}
              roughness={0.06}
              color="#c4d3d6"
            />
          </mesh>
        )}
      </group>

      {/* Pivot/bearing hint — small turntable disc at the base, a slim pin at the top */}
      {!wireframe && (
        <>
          <mesh position={[0, 0.016, 0]}>
            <cylinderGeometry args={[Math.min(unitThick, unitW) * 0.14, Math.min(unitThick, unitW) * 0.14, 0.016, 20]} />
            <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, H - 0.02, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.03, 12]} />
            <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ─── Corona de luz (light valance) — no doors/drawers/shelves, just a shallow
// box with a pure-MDF front and underside, and indirect lighting recessed
// into the underside: either a continuous LED strip or a row of round bulbs
// spread evenly across the width. ──────────────────────────────────────────
function CoronaLuzMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  // Front and underside are always exterior board (see the catalog entry —
  // exteriorMaterial is pinned to MDF and excluded from the global-material
  // sync in useKitchenStore.ts), unlike every other module's exterior.
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;

  const lightColor = module.options.lightColor || "#fff2d0";
  const lightMode = module.options.lightMode || "tira";
  // Front-to-back width of the flat strip (not thickness — it stays flat
  // regardless, see the fixed FLAT_LIGHT_THICKNESS below).
  const stripWidth = Math.max((module.options.lightStripWidth ?? 3) / 100, 0.01);
  const bulbCount = Math.max(module.options.bulbCount ?? 6, 1);
  const FLAT_LIGHT_THICKNESS = 0.003;

  return (
    <group>
      {/* Front — exterior board, same as every other module */}
      <Box pos={[0, H / 2, D / 2 - T / 2]} size={[W, H, T]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      {/* Top — closed, rarely seen (against the wall/soffit above) */}
      <Box pos={[0, H - T / 2, 0]} size={[W - T * 2, T, D]} color={color} wireframe={wireframe} />
      {/* Underside — also exterior board; the light sits recessed just below it */}
      <Box pos={[0, T / 2, 0]} size={[W - T * 2, T, D]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      {leftColor && <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={leftColor} map={leftMap} wireframe={wireframe} />}
      {rightColor && <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={rightColor} map={rightMap} wireframe={wireframe} />}

      {/* Indirect light, recessed near the front edge of the underside so it
          washes down the face of whatever's mounted below — flat (a strip or
          a row of round bulbs, never a chunky 3D shape), with a real emissive
          material (glows even unlit) plus one soft point light so it
          actually illuminates the scene, not just itself. */}
      {!wireframe && (
        <group position={[0, -0.002, D / 2 - 0.04]}>
          {lightMode === "tira" ? (
            <mesh castShadow={false}>
              <boxGeometry args={[Math.max(W - 0.06, 0.02), FLAT_LIGHT_THICKNESS, stripWidth]} />
              <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={2.2} />
            </mesh>
          ) : (
            Array.from({ length: bulbCount }, (_, i) => {
              const x = -W / 2 + (W * (i + 0.5)) / bulbCount;
              const r = Math.min((0.6 * W) / bulbCount, 0.02);
              return (
                <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[r, 24]} />
                  <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={2.5} side={2} />
                </mesh>
              );
            })
          )}
          <pointLight color={lightColor} intensity={0.7} distance={1.6} decay={2} />
        </group>
      )}
    </group>
  );
}

// ─── Blind corner cabinet — base cabinet + a blind fondo×fondo extension ─────
// gabinete_bajo_esquinero_puertas: reuses gabinete_bajo_puertas's own options,
// materials, door-count/hinge resolution (getEffectiveDoors, untouched) and
// shelf count exactly as-is — dimensions.width still means only the
// door-covered front. The only thing that changes is the carcass/countertop/
// shelves growing a blind D-wide extension to the left (Wt = W + D), closed
// off by a fixed non-opening panel instead of a door, like a real blind
// corner base cabinet tucked against the return wall.
function CornerBlindCabinetMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const Wt = W + D;
  const toeKick = module.options.hasToeKick ? module.options.toeKickHeight / 100 : 0;
  const ctThick = module.options.includesCountertop ? module.options.countertopThickness / 100 : 0;
  const ctOverhang = (module.options.countertopOverhang || 2) / 100;
  const color = module.options.color || "#d4c5b0";
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  // leftSidePanel means the extension's own outer edge here (the true
  // outer-left of the widened Wt carcass). There is no divider between the
  // original cabinet and the extension — they always share one open cavity;
  // leftFrontSidePanel only controls the extension's own front face below.
  const leftColor = module.options.leftSidePanel === "ninguno" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;

  const ctColorMap: Record<string, string> = {
    "Granito natural": "#5c5c5c", "Granito reconstituido": "#7a7a7a", "Cuarzo engineered": "#e8e0d4",
    "Mármol": "#f0ece4", "Acero inoxidable": "#b0b0b0", "Postformado": "#c8b89a", "Cemento pulido": "#909090", "Corian": "#efe8dc",
  };
  const ctColor = module.options.countertopColor || ctColorMap[module.options.countertopMaterial] || "#8e8070";
  const ctTextureId = module.options.countertopTexture !== "ninguna" ? module.options.countertopTexture : undefined;
  const ctMap = ctTextureId ? getWoodTexture(ctTextureId) : null;
  const ctRoughness = ctTextureId ? getWoodRoughness(ctTextureId) : 0.35;
  const ctMetalness = ctTextureId ? 0.04 : 0.08;

  // Untouched — same door count/width%/hinge-side resolution as any other
  // lower cabinet, still expressed relative to W (the original ancho).
  const doors = getEffectiveDoors(module);
  const shelves = module.options.shelves || 0;
  const topMarginH = TOP_FACE_MARGIN_CM / 100;
  const facesTop = toeKick + Math.max(H - toeKick - ctThick - topMarginH, 0);
  // Shifts the doors' own W-wide local frame so it lands flush with the
  // RIGHT edge of the wider Wt carcass — the blind D-wide extension sits
  // untouched to its left.
  const doorGroupX = D / 2;

  return (
    <group>
      <Carcass W={Wt} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} hasTop={ctThick === 0} wireframe={wireframe} />
      {module.options.leftSidePanel !== "exterior" && (
        <SideFiller side="left" W={Wt} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel !== "exterior" && (
        <SideFiller side="right" W={Wt} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {doors.length > 0 && (
        <TopFiller
          W={Wt} D={D}
          yCenter={facesTop + topMarginH / 2}
          marginH={topMarginH}
          color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe}
        />
      )}
      {toeKick > 0 && (
        <ToeKick W={Wt} D={D} height={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} aluminum={module.options.zocaloMaterial === "Aluminio"} wireframe={wireframe} />
      )}
      {shelves > 0 && (
        <Shelves W={Wt} H={H} D={D} count={shelves} toeKick={toeKick} ctThick={ctThick} color={color} wireframe={wireframe} />
      )}
      {/* Countertop — the rounded postformado bullnose belongs only on the
          original cabinet's own visible front; the extension's front edge
          is a joint where another cabinet's countertop butts up against it,
          so it stays perfectly flat instead of curling into a bullnose. */}
      {ctThick > 0 && (() => {
        const dropR = ctThick;
        const frontZ = D / 2 + ctOverhang;
        const flatZ = frontZ - dropR;
        // Slab pokes ~1cm proud of the carcass on each side.
        const PAD = 0.01;
        const slabW = Wt + PAD * 2;
        // The bullnose only covers the door-fronted W zone; its own left
        // edge is the internal seam with the extension (not a placement
        // boundary), its right edge the cabinet's true outer-right.
        const bullnoseW = W + PAD * 2;
        const bullnoseX = doorGroupX;
        return (
          <>
            <Box
              pos={[0, H + ctThick / 2, (flatZ - D / 2) / 2]}
              size={[slabW, ctThick, flatZ + D / 2]}
              color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe}
            />
            <group position={[bullnoseX, 0, 0]}>
              <CountertopDropEdge W={bullnoseW} bottomY={H - dropR} thickness={2 * dropR} flatZ={flatZ} color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe} />
            </group>
            <Box
              pos={[-Wt / 2 + D / 2, H + ctThick / 2, (flatZ + frontZ) / 2]}
              size={[D, ctThick, frontZ - flatZ]}
              color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe}
            />
          </>
        );
      })()}
      <group position={[doorGroupX, 0, 0]}>
        {doors.map((d) => (
          <DoorPanel
            key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
            hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
          />
        ))}
      </group>
      {/* Extension's own front face ("costado frontal izquierdo") — fixed,
          no hinge, no door. Open by default (you reach straight into the
          extension from the front); "interior" closes it with a plain
          interior-board filler. Never exterior-finished — that would read
          as a fake door front that doesn't open. */}
      {module.options.leftFrontSidePanel === "interior" && (
        <Box
          pos={[-Wt / 2 + D / 2, toeKick + (facesTop - toeKick) / 2, D / 2 + 0.01]}
          size={[D - 0.006, Math.max(facesTop - toeKick, 0), 0.019]}
          color={color} roughness={0.72} wireframe={wireframe}
        />
      )}
    </group>
  );
}

// ─── Full Cabinet — shared by ModulePreview3D and KitchenAssemblyScene ────────
export function CabinetMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  // Wall cabinets never get a toe-kick strip — it'd render as a stray trim
  // box floating near the bottom of the box, up on the wall.
  const isUpper = module.category === "upper" || module.type === "gabinete_superior_esquinero_puertas";
  const toeKick = !isUpper && module.options.hasToeKick ? module.options.toeKickHeight / 100 : 0;
  const ctThick = module.options.includesCountertop ? module.options.countertopThickness / 100 : 0;
  const ctOverhang = (module.options.countertopOverhang || 2) / 100;
  const color = module.options.color || "#d4c5b0";
  // Doors/drawer fronts are the visible/finished faces — always the exterior board,
  // rendered with its wood-grain texture rather than a flat color.
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" || module.options.leftSidePanel === "alambrin" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" || module.options.rightSidePanel === "alambrin" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;
  // Back panel — plain interior board by default, but a desayunador's back
  // (exposed toward the seating side, not hidden against a wall) or a
  // librero giratorio's back (mirror) need a different finish entirely.
  const backMode = module.options.backPanelMaterial ?? "interior";
  const hasCustomBack = module.type !== "bajo_tarja" && backMode !== "interior";
  const hasSink =
    module.type === "bajo_tarja" ||
    module.type === "cubierta_tarja" ||
    module.type === "tarja";
  // bajo_parrilla carries a real countertop (unlike bajo_estufa's bare
  // stainless plate spanning the whole top) with the grill inset into it —
  // same idea as hasSink's basin, just shaped like a built-in grill. (Only
  // this cabinet type reaches CabinetMesh — cubierta_parrilla is a separate,
  // category-"countertop" module rendered by CountertopPreviewMesh instead.)
  const hasGrill = module.type === "bajo_parrilla";

  const ctColorMap: Record<string, string> = {
    "Granito natural": "#5c5c5c",
    "Granito reconstituido": "#7a7a7a",
    "Cuarzo engineered": "#e8e0d4",
    "Mármol": "#f0ece4",
    "Acero inoxidable": "#b0b0b0",
    "Postformado": "#c8b89a",
    "Cemento pulido": "#909090",
    "Corian": "#efe8dc",
  };
  const ctColor = module.options.countertopColor || ctColorMap[module.options.countertopMaterial] || "#8e8070";
  const ctTextureId = module.options.countertopTexture !== "ninguna" ? module.options.countertopTexture : undefined;
  const ctMap = ctTextureId ? getWoodTexture(ctTextureId) : null;
  // A wood texture needs matte, non-metallic shading — the default glossy
  // stone-like values (tuned for granite/quartz) blow a wood grain out to a
  // washed-out near-white specular highlight instead of showing its color.
  const ctRoughness = ctTextureId ? getWoodRoughness(ctTextureId) : 0.35;
  const ctMetalness = ctTextureId ? 0.04 : 0.08;

  const drawers = getEffectiveDrawers(module);
  const doors = getEffectiveDoors(module);
  // bajo_estufa's stove sits on a bare stainless plate spanning the whole
  // top (no countertop at all) — bajo_parrilla instead gets a real
  // countertop with the grill recessed into it, see hasGrill above.
  const isStoveCabinet = module.type === "bajo_estufa";
  const isCampanero   = module.type === "campanero";
  // Mirrors getEffectiveDrawers/getEffectiveDoors' own usableH math so the
  // filler rail lines up exactly with wherever the top-most face actually ends.
  const topMarginH = isUpper ? 0 : TOP_FACE_MARGIN_CM / 100;
  const facesTop = toeKick + Math.max(H - toeKick - ctThick - topMarginH, 0);

  // Campanero has its own dedicated mesh — no doors/drawers/carcass
  if (isCampanero) {
    return <CampaneroMesh W={W} H={H} D={D} color={color} wireframe={wireframe} />;
  }

  // Corona de luz has its own dedicated mesh too — no doors/drawers/carcass,
  // just a lit valance box.
  if (module.type === "corona_luz") {
    return <CoronaLuzMesh module={module} wireframe={wireframe} />;
  }

  // 20-hole bottle grid — open front, dividers instead of shelves/doors.
  if (module.type === "cava_vinos") {
    return <CavaVinosMesh module={module} wireframe={wireframe} />;
  }

  // Two doors covering only the top zone, open cubby zone below.
  if (module.type === "aereo_hueco_inferior") {
    return <AereoHuecoInferiorMesh module={module} wireframe={wireframe} onSelect={onSelect} />;
  }

  // Fixed gray housing + a separate body that spins 180° between a shelf
  // grid and a full-size mirror — no carcass/doors/shelves of its own here.
  if (module.type === "librero_giratorio_espejo") {
    return <LibreroGiratorioMesh module={module} wireframe={wireframe} onSelect={onSelect} />;
  }

  // Blind corner cabinet — same options/doors/shelves as any lower/upper
  // cabinet, just a wider carcass with a blind extension; see
  // CornerBlindCabinetMesh (shared by both the floor and wall variants).
  if (module.type === "gabinete_bajo_esquinero_puertas" || module.type === "gabinete_superior_esquinero_puertas") {
    return <CornerBlindCabinetMesh module={module} wireframe={wireframe} onSelect={onSelect} />;
  }

  return (
    <group>
      {isStoveCabinet
        ? <StoveCarcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />
        : <Carcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} hasTop={ctThick === 0} hasBack={module.type !== "bajo_tarja" && !hasCustomBack} wireframe={wireframe} />}
      {hasCustomBack && (
        backMode === "alambrin" ? (
          <AlambrinPanel pos={[0, H / 2, -D / 2 + T / 2]} faceW={W - T * 2} faceH={H - T * 2} horizontal wireframe={wireframe} />
        ) : backMode === "espejo" ? (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color="#dfe8ec" metalness={0.9} roughness={0.05} wireframe={wireframe} />
        ) : (
          <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[W - T * 2, H - T * 2, T]} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        )
      )}
      {module.options.leftSidePanel === "alambrin" && (
        <AlambrinPanel pos={[-W / 2 + T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel === "alambrin" && (
        <AlambrinPanel pos={[W / 2 - T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} wireframe={wireframe} />
      )}
      {module.options.leftSidePanel !== "exterior" && (
        <SideFiller side="left" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel !== "exterior" && (
        <SideFiller side="right" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {(drawers.length > 0 || doors.length > 0) && (
        <TopFiller
          W={W} D={D}
          yCenter={facesTop + topMarginH / 2}
          marginH={topMarginH}
          color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe}
        />
      )}
      {toeKick > 0 && (
        <ToeKick W={W} D={D} height={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} aluminum={module.options.zocaloMaterial === "Aluminio"} wireframe={wireframe} />
      )}
      {/* A plain pull-out door (no accessory of its own) takes the module's
          fixed shelves with it — see PullOutLarderDoor — so they're skipped
          here to avoid a duplicate, non-sliding set floating in the carcass. */}
      {!isStoveCabinet && !doors.some((d) => d.pullOut && !d.pullOutAccessory) && module.options.shelves > 0 && (
        <Shelves W={W} H={H} D={D} count={module.options.shelves} toeKick={toeKick} ctThick={ctThick} color={color} wireframe={wireframe} />
      )}
      {!isStoveCabinet && ctThick > 0 && (
        <Countertop
          W={W} H={H} D={D} ctThick={ctThick} ctOverhang={ctOverhang} hasSink={hasSink} hasGrill={hasGrill}
          ctColor={ctColor} ctMap={ctMap} ctRoughness={ctRoughness} ctMetalness={ctMetalness}
          backOverhang={(module.options.barOverhangCm || 0) / 100} wireframe={wireframe}
        />
      )}
      {isStoveCabinet && !wireframe && <StoveSurface W={W} H={H} D={D} />}
      {drawers.map((d) => (
        <DrawerFace key={d.id} drawer={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect} interiorColor={color} />
      ))}
      {doors.map((d) => (
        d.pullOut ? (
          <PullOutLarderDoor
            key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
            hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
            shelfCount={module.options.shelves} shelfColor={color} accessory={d.pullOutAccessory}
          />
        ) : (
          <DoorPanel
            key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
            hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
          />
        )
      ))}
    </group>
  );
}

// ─── Color utility ────────────────────────────────────────────────────────────
export function shiftColor(hex: string, amount: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return hex;
  const d = Math.round(amount * 255);
  return `#${clamp(r + d).toString(16).padStart(2, "0")}${clamp(g + d).toString(16).padStart(2, "0")}${clamp(b + d).toString(16).padStart(2, "0")}`;
}

// ─── Countertop preview (cubierta, isla_central, peninsula, barra, cubierta_tarja) ─
// CabinetMesh assumes a cabinet — carcass, doors, drawers — which doesn't
// apply to a standalone countertop. Rendering one through it anyway used to
// mostly work by accident (the carcass's "interior board" color was a neutral
// beige that blended with typical countertop tones); now that interior board
// is always white, that carcass reads as a stark white slab overpowering the
// actual (correctly colored) countertop sitting right above it. This mirrors
// KitchenAssemblyScene's own CountertopMesh, just centered for a close-up.
function CountertopPreviewMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const ctThick = (module.options.countertopThickness || 3) / 100;

  const ctColorMap: Record<string, string> = {
    "Granito natural": "#5c5c5c",
    "Granito reconstituido": "#7a7a7a",
    "Cuarzo engineered": "#e8e0d4",
    "Mármol": "#f0ece4",
    "Acero inoxidable": "#b0b0b0",
    "Postformado": "#c8b89a",
    "Cemento pulido": "#909090",
    "Corian": "#efe8dc",
  };
  const ctColor = module.options.countertopColor || ctColorMap[module.options.countertopMaterial] || "#8e8070";
  const ctTextureId = module.options.countertopTexture !== "ninguna" ? module.options.countertopTexture : undefined;
  const ctMap = ctTextureId ? getWoodTexture(ctTextureId) : null;
  const ctRoughness = ctTextureId ? getWoodRoughness(ctTextureId) : 0.35;
  const ctMetalness = ctTextureId ? 0.04 : 0.08;

  const isIsland = module.type === "isla_central" || module.type === "peninsula" || module.type === "barra_desayunadora";
  const bodyColor = module.options.exteriorColor || module.options.color || "#d4c5b0";
  const bodyMap = getWoodTexture(module.options.exteriorTexture);
  const bodyRoughness = getWoodRoughness(module.options.exteriorTexture);
  const bodyH = isIsland ? Math.max(H - ctThick, 0) : 0;

  return (
    <group>
      {isIsland && bodyH > 0 && (
        <Box pos={[0, bodyH / 2, 0]} size={[W, bodyH, D]} color={bodyColor} map={bodyMap} roughness={bodyRoughness} wireframe={wireframe} />
      )}
      <Box pos={[0, bodyH + ctThick / 2, -ctThick / 2]} size={[W, ctThick, D - ctThick]} color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe} />
      <CountertopDropEdge
        W={W} bottomY={bodyH - ctThick} thickness={2 * ctThick} flatZ={D / 2 - ctThick}
        color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe}
      />
    </group>
  );
}

// ─── Accessory preview (tarja, estufa, parrilla, campana, zócalo, paneles) ────
// Same problem as countertops: CabinetMesh doesn't know these aren't cabinets,
// so it used to build a carcass + doors out of their (irrelevant) default
// options — a sink or hood rendered as a generic cabinet. Shapes here mirror
// KitchenAssemblyScene's AccessoryMesh, just centered around the module's own
// mid-height instead of the room-specific absolute mount heights.
function AccessoryPreviewMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#c0c0c0";

  if (module.type === "tarja") {
    return (
      <group position={[0, H / 2, 0]}>
        <Box pos={[0, 0, 0]} size={[W, Math.min(H, 0.03), D]} color="#b0b0b0" wireframe={wireframe} />
        {!wireframe && (
          <>
            <mesh position={[0, -H * 0.4, 0]}>
              <boxGeometry args={[W * 0.7, H * 1.2, D * 0.58]} />
              <meshStandardMaterial color="#808080" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, H * 1.4, -D / 2 + 0.08]}>
              <cylinderGeometry args={[0.012, 0.012, H * 3, 8]} />
              <meshStandardMaterial color="#aaa" metalness={0.9} roughness={0.15} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  if (module.type === "estufa" || module.type === "parrilla") {
    const burnerR = Math.min(W, D) * 0.12;
    return (
      <group position={[0, H / 2, 0]}>
        <Box pos={[0, 0, 0]} size={[W, Math.min(H, 0.02), D]} color="#202020" wireframe={wireframe} />
        {!wireframe && [[-W * 0.25, D * 0.22], [W * 0.25, D * 0.22], [-W * 0.25, -D * 0.22], [W * 0.25, -D * 0.22]].map(([bx, bz], i) => (
          <mesh key={i} position={[bx, H * 0.6, bz]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[burnerR, burnerR * 0.24, 8, 16]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        ))}
      </group>
    );
  }

  if (module.type === "campana_extractora") {
    const chimneyH = Math.min(H * 0.7, 0.45);
    return (
      <group position={[0, H / 2, 0]}>
        <Box pos={[0, 0, 0]} size={[W, H, D * 0.85]} color="#161616" wireframe={wireframe} />
        <Box pos={[0, H / 2 + chimneyH / 2, -D * 0.18]} size={[W * 0.38, chimneyH, D * 0.45]} color="#161616" wireframe={wireframe} />
        {!wireframe && (
          <mesh position={[0, -H / 2 + 0.01, D * 0.2]}>
            <boxGeometry args={[W * 0.85, 0.015, D * 0.3]} />
            <meshStandardMaterial color="#e8e8e8" emissive="#fff6df" emissiveIntensity={0.6} />
          </mesh>
        )}
      </group>
    );
  }

  if (module.type === "panel_lateral" || module.type === "panel_remate" || module.type === "panel_decorativo") {
    return <Box pos={[0, H / 2, 0]} size={[0.018, H, D]} color={color} wireframe={wireframe} />;
  }

  if (module.type === "especiero_aluminio") {
    // A couple of thin aluminum shelf bars mounted to a back rail.
    return (
      <group position={[0, H / 2, 0]}>
        <Box pos={[0, H / 2 - 0.01, -D / 2 + 0.01]} size={[W, 0.02, 0.02]} color="#b8bcbe" metalness={0.8} roughness={0.25} wireframe={wireframe} />
        {[0.3, -0.1].map((y, i) => (
          <Box key={i} pos={[0, y, 0]} size={[W, 0.012, D]} color="#c9cdd1" metalness={0.75} roughness={0.3} wireframe={wireframe} />
        ))}
      </group>
    );
  }


  return null; // Herrajes, organizadores, etc. have no meaningful 3D shape
}

// ─── Appliance niche preview ───────────────────────────────────────────────────
// An empty frame for a built-in appliance — no doors, no shelves — mirroring
// KitchenAssemblyScene's ApplianceMesh. CabinetMesh would otherwise draw this
// with whatever door/shelf counts happen to be sitting in the default options.
function AppliancePreviewMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  return (
    <group>
      <Box pos={[-W / 2 + 0.018, H / 2, 0]} size={[0.036, H, D]} color={color} wireframe={wireframe} />
      <Box pos={[W / 2 - 0.018, H / 2, 0]} size={[0.036, H, D]} color={color} wireframe={wireframe} />
      <Box pos={[0, H - 0.018, 0]} size={[W, 0.036, D]} color={color} wireframe={wireframe} />
      <Box pos={[0, 0.018, 0]} size={[W, 0.036, D]} color={color} wireframe={wireframe} />
    </group>
  );
}

// ─── Preview router — picks the right mesh for a module's category ───────────
// Shared by the live inspector preview (below) and the off-screen catalog
// thumbnail generator, so both ever only need to know "give me a preview of
// this module," not which of several unrelated mesh functions applies.
export function PreviewMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  switch (module.category) {
    case "countertop": return <CountertopPreviewMesh module={module} wireframe={wireframe} />;
    case "accessory":  return <AccessoryPreviewMesh module={module} wireframe={wireframe} />;
    case "appliance":  return <AppliancePreviewMesh module={module} wireframe={wireframe} />;
    default:           return <CabinetMesh module={module} wireframe={wireframe} />;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function ModulePreview3D({ module }: { module: KitchenModule }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;

  // Position camera to frame the module nicely at ~3/4 angle. A flat object
  // (countertop slab, sink, cooktop, zócalo strip…) is only a few cm tall, so
  // scaling the camera's height off its own H (as for a normal cabinet) puts
  // it almost edge-on — tall enough here to actually see the top surface
  // (and whatever material/texture is on it) instead of a sliver of side face.
  const dist = Math.max(W, H, D) * 2.4 + 0.4;
  const isFlatObject = H < Math.max(W, D) * 0.3;
  const cameraY = isFlatObject ? Math.max(W, D) * 0.55 : H * 0.62;
  const initPos: [number, number, number] = [W * 0.55, cameraY, dist];
  const target: [number, number, number] = [0, H / 2, 0];

  // This preview mounts alongside the main assembly scene's own Canvas (e.g.
  // opening a module's inspector in Vista 3D) — two WebGL contexts appearing
  // in the same tick can lose one of them (see useContextRecovery), which
  // otherwise showed up as this preview rendering flat white regardless of
  // the material/texture actually selected.
  const { instanceKey, handleCreated } = useContextRecovery();

  return (
    <div className="h-55 w-full overflow-hidden rounded-xl border border-ivory/8 bg-surface">
      <Canvas
        key={instanceKey}
        camera={{ position: initPos, fov: 38, near: 0.01, far: 50 }}
        // preserveDrawingBuffer lets the PDF export (ModuleSnapshotRig) read the
        // canvas back out with toDataURL() after a frame has painted.
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={handleCreated}
        shadows
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.5, 4, 5]} intensity={0.85} castShadow />
        <directionalLight position={[-1.5, 1, -3]} intensity={0.18} color="#8899ff" />
        <PreviewMesh module={module} />
        <OrbitControls
          target={target}
          enablePan={false}
          minDistance={0.25}
          maxDistance={6}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI * 0.72}
        />
      </Canvas>
    </div>
  );
}
