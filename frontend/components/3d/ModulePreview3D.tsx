"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useState } from "react";
import { MathUtils, type Group, type Texture } from "three";
import type { KitchenModule, DrawerDef, DoorDef } from "@/types/kitchen";
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
  const toeKick = mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const usableH = Math.max(mod.dimensions.height - toeKick - ctThick - TOP_FACE_MARGIN_CM, 0);
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
  const toeKick = mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const usableH = Math.max(mod.dimensions.height - toeKick - ctThick - TOP_FACE_MARGIN_CM, 0);
  const drawerCount = mod.options.drawers || 0;
  const drawerZoneH = drawerCount > 0 ? Math.max(usableH - Math.max(usableH * 0.55, 40), 0) : 0;
  const doorZoneH = usableH - drawerZoneH;
  const doorW = 100 / count;

  return Array.from({ length: count }, (_, i) => ({
    id: `auto-dr${i}`,
    label: `Puerta ${i + 1}`,
    widthPct: doorW,
    offsetPct: i * doorW,
    fromBottomCm: 0,
    heightCm: doorZoneH,
    hingeLeft: i % 2 === 0,
    doorStyle: mod.options.doorStyle,
  }));
}

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
function Carcass({ W, H, D, color, leftColor, rightColor, leftMap, rightMap, wireframe = false }: {
  W: number; H: number; D: number; color: string; leftColor: string | null; rightColor: string | null;
  leftMap?: Texture | null; rightMap?: Texture | null; wireframe?: boolean;
}) {
  const iW = W - T * 2;
  const iH = H - T * 2;
  const darkColor = shiftColor(color, -0.12);
  return (
    <group>
      {leftColor && <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={leftColor} map={leftMap} wireframe={wireframe} />}
      {rightColor && <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={rightColor} map={rightMap} wireframe={wireframe} />}
      <Box pos={[0, H - T / 2, 0]} size={[iW, T, D]} color={color} wireframe={wireframe} />
      <Box pos={[0, T / 2, 0]} size={[iW, T, D]} color={color} wireframe={wireframe} />
      <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[iW, iH, T]} color={darkColor} roughness={0.85} wireframe={wireframe} />
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
function ToeKick({ W, D, height, wireframe = false }: { W: number; D: number; height: number; wireframe?: boolean }) {
  if (height <= 0) return null;
  return <Box pos={[0, height / 2, D / 2 - 0.03]} size={[W, height, 0.04]} color="#141414" wireframe={wireframe} />;
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

// ─── Countertop ───────────────────────────────────────────────────────────────
function Countertop({
  W, H, D, ctThick, ctOverhang, hasSink, ctColor = "#8e8070", ctMap = null, wireframe = false,
}: {
  W: number; H: number; D: number; ctThick: number; ctOverhang: number;
  hasSink: boolean; ctColor?: string; ctMap?: Texture | null; wireframe?: boolean;
}) {
  // Basin sits 2mm above countertop top — eliminates z-fighting; depth is realistic 18cm
  const basinH = 0.18;
  const basinTopY = H + ctThick + 0.002;
  const basinY = basinTopY - basinH / 2;
  return (
    <group>
      <Box
        pos={[0, H + ctThick / 2, ctOverhang / 2]}
        size={[W + 0.02, ctThick, D + ctOverhang]}
        color={ctColor}
        map={ctMap}
        roughness={0.35}
        metalness={0.08}
        wireframe={wireframe}
      />
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
    </group>
  );
}

// ─── Drawer Face Mesh ─────────────────────────────────────────────────────────
function DrawerFace({
  drawer, W, D, toeKick, color, map, roughness, wireframe = false, onSelect,
}: {
  drawer: DrawerDef; W: number; D: number; toeKick: number; color: string;
  map?: Texture | null; roughness?: number; wireframe?: boolean; onSelect?: () => void;
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

  const canOpen = !drawer.isGhost;
  const [open, setOpen] = useState(false);
  const slideRef = useRef<Group>(null);
  const target = open ? openDist : 0;

  useFrame((_, delta) => {
    if (!slideRef.current) return;
    slideRef.current.position.z = MathUtils.damp(slideRef.current.position.z, target, DAMP_SPEED, delta);
  });

  return (
    <group ref={slideRef}>
      <mesh
        position={[cx, cy, cz]}
        castShadow
        receiveShadow
        onPointerDown={canOpen ? (e) => e.stopPropagation() : undefined}
        onClick={canOpen ? (e) => { e.stopPropagation(); setOpen((v) => !v); onSelect?.(); } : undefined}
        onPointerOver={canOpen ? (e) => { e.stopPropagation(); setGrabCursor(true); } : undefined}
        onPointerOut={canOpen ? () => setGrabCursor(false) : undefined}
      >
        <boxGeometry args={[fW, fH, 0.017]} />
        <meshStandardMaterial
          color={faceMap ? "#ffffff" : faceColor}
          map={faceMap ?? undefined}
          transparent={drawer.isGhost}
          opacity={drawer.isGhost ? 0.72 : 1}
          roughness={roughness ?? (drawer.isGhost ? 0.8 : 0.65)}
          wireframe={wireframe}
        />
      </mesh>
      {!wireframe && (
        <>
          {/* Handle — same for real and ghost, ghost handle slightly dimmer */}
          {drawer.orientation === "vertical"
            ? <Box pos={[cx, cy, cz + 0.01]} size={[0.007, Math.min(fH * 0.25, 0.065), 0.006]} color={drawer.isGhost ? "#777" : "#bbb"} roughness={0.3} metalness={0.6} />
            : <Box pos={[cx, cy, cz + 0.01]} size={[Math.min(fW * 0.38, 0.095), 0.007, 0.006]} color={drawer.isGhost ? "#777" : "#bbb"} roughness={0.3} metalness={0.6} />
          }
        </>
      )}
    </group>
  );
}

// ─── Door Panel Mesh ──────────────────────────────────────────────────────────
function DoorPanel({
  door, W, D, toeKick, color, map, roughness, wireframe = false, onSelect,
}: {
  door: DoorDef; W: number; D: number; toeKick: number; color: string;
  map?: Texture | null; roughness?: number; wireframe?: boolean; onSelect?: () => void;
}) {
  const iW = W - T * 2;
  const dW = (door.widthPct / 100) * iW - 0.003;
  const dH = door.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (door.offsetPct / 100) * iW + dW / 2;
  const cy = toeKick + T + door.fromBottomCm / 100 + dH / 2;
  const cz = D / 2 + 0.01;

  // Pivot (hinge) sits at the group origin — the door panel is offset from it
  // so that rotating the group swings the door around the hinge edge.
  const hx = door.hingeLeft ? cx - dW / 2 + 0.012 : cx + dW / 2 - 0.012;
  const localX = cx - hx;
  const handleLocalX = door.hingeLeft ? localX + dW / 2 - 0.04 : localX - dW / 2 + 0.04;

  const [open, setOpen] = useState(false);
  const pivotRef = useRef<Group>(null);
  // Doors always swing outward (+Z, toward the room) regardless of hinge side.
  const target = open ? (door.hingeLeft ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE) : 0;

  useFrame((_, delta) => {
    if (!pivotRef.current) return;
    pivotRef.current.rotation.y = MathUtils.damp(pivotRef.current.rotation.y, target, DAMP_SPEED, delta);
  });

  return (
    <group ref={pivotRef} position={[hx, cy, cz]}>
      <mesh
        position={[localX, 0, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); onSelect?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); setGrabCursor(true); }}
        onPointerOut={() => setGrabCursor(false)}
      >
        <boxGeometry args={[dW, dH, 0.019]} />
        <meshStandardMaterial
          color={map ? "#ffffff" : shiftColor(color, 0.04)}
          map={map ?? undefined}
          roughness={roughness ?? 0.62}
          wireframe={wireframe}
        />
      </mesh>
      {!wireframe && (
        <>
          {/* Hinge */}
          <Box pos={[0, 0, 0.012]} size={[0.009, dH * 0.45, 0.006]} color="#888" roughness={0.4} metalness={0.4} />
          {/* Handle bar */}
          <Box pos={[handleLocalX, 0, 0.012]} size={[0.008, dH * 0.22, 0.006]} color="#ccc" roughness={0.25} metalness={0.7} />
        </>
      )}
    </group>
  );
}

// ─── Full Cabinet — shared by ModulePreview3D and KitchenAssemblyScene ────────
export function CabinetMesh({ module, wireframe = false, onSelect }: { module: KitchenModule; wireframe?: boolean; onSelect?: () => void }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const toeKick = module.options.hasToeKick ? module.options.toeKickHeight / 100 : 0;
  const ctThick = module.options.includesCountertop ? module.options.countertopThickness / 100 : 0;
  const ctOverhang = (module.options.countertopOverhang || 2) / 100;
  const color = module.options.color || "#d4c5b0";
  // Doors/drawer fronts are the visible/finished faces — always the exterior board,
  // rendered with its wood-grain texture rather than a flat color.
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;
  const hasSink =
    module.type === "bajo_tarja" ||
    module.type === "cubierta_tarja" ||
    module.type === "tarja";

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
  const ctMap = module.options.countertopTexture && module.options.countertopTexture !== "ninguna"
    ? getWoodTexture(module.options.countertopTexture)
    : null;

  const drawers = getEffectiveDrawers(module);
  const doors = getEffectiveDoors(module);
  const isStoveCabinet = module.type === "bajo_estufa" || module.type === "bajo_parrilla";
  const isCampanero   = module.type === "campanero";

  // Campanero has its own dedicated mesh — no doors/drawers/carcass
  if (isCampanero) {
    return <CampaneroMesh W={W} H={H} D={D} color={color} wireframe={wireframe} />;
  }

  return (
    <group>
      {isStoveCabinet
        ? <StoveCarcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />
        : <Carcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />}
      {toeKick > 0 && <ToeKick W={W} D={D} height={toeKick} wireframe={wireframe} />}
      {!isStoveCabinet && module.options.shelves > 0 && (
        <Shelves W={W} H={H} D={D} count={module.options.shelves} toeKick={toeKick} ctThick={ctThick} color={color} wireframe={wireframe} />
      )}
      {!isStoveCabinet && ctThick > 0 && (
        <Countertop W={W} H={H} D={D} ctThick={ctThick} ctOverhang={ctOverhang} hasSink={hasSink} ctColor={ctColor} ctMap={ctMap} wireframe={wireframe} />
      )}
      {isStoveCabinet && !wireframe && <StoveSurface W={W} H={H} D={D} />}
      {drawers.map((d) => (
        <DrawerFace key={d.id} drawer={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} onSelect={onSelect} />
      ))}
      {doors.map((d) => (
        <DoorPanel key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} onSelect={onSelect} />
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

// ─── Main export ──────────────────────────────────────────────────────────────
export function ModulePreview3D({ module }: { module: KitchenModule }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;

  // Position camera to frame the cabinet nicely at ~3/4 angle
  const dist = Math.max(W, H, D) * 2.4 + 0.4;
  const initPos: [number, number, number] = [W * 0.55, H * 0.62, dist];
  const target: [number, number, number] = [0, H / 2, 0];

  // This preview mounts alongside the main assembly scene's own Canvas (e.g.
  // opening a module's inspector in Vista 3D) — two WebGL contexts appearing
  // in the same tick can lose one of them (see useContextRecovery), which
  // otherwise showed up as this preview rendering flat white regardless of
  // the material/texture actually selected.
  const { instanceKey, handleCreated } = useContextRecovery();

  return (
    <div className="h-55 w-full overflow-hidden rounded-xl border border-white/8 bg-[#080810]">
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
        <CabinetMesh module={module} />
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
