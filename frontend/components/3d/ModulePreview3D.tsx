"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { KitchenModule, DrawerDef, DoorDef } from "@/types/kitchen";

// ─── Board thickness (meters) ─────────────────────────────────────────────────
const T = 0.018;

// ─── Auto-generate layout from simple counts ─────────────────────────────────
export function getEffectiveDrawers(mod: KitchenModule): DrawerDef[] {
  if (mod.options.useDetailedLayout && mod.options.drawerDefs?.length) {
    return mod.options.drawerDefs;
  }
  const count = mod.options.drawers || 0;
  if (!count) return [];
  const toeKick = mod.options.hasToeKick ? mod.options.toeKickHeight : 0;
  const ctThick = mod.options.includesCountertop ? mod.options.countertopThickness : 0;
  const interiorH = mod.dimensions.height - toeKick - ctThick;
  const doorCount = mod.options.doors || 0;
  const doorZoneH = doorCount > 0 ? Math.max(interiorH * 0.55, 40) : 0;
  const drawerH = count > 0 ? (interiorH - doorZoneH) / count : 0;
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
  const interiorH = mod.dimensions.height - toeKick - ctThick;
  const drawerCount = mod.options.drawers || 0;
  const drawerZoneH = drawerCount > 0 ? Math.max(interiorH - Math.max(interiorH * 0.55, 40), 0) : 0;
  const doorZoneH = interiorH - drawerZoneH;
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
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

// ─── Carcass (5 panels) ────────────────────────────────────────────────────────
function Carcass({ W, H, D, color }: { W: number; H: number; D: number; color: string }) {
  const iW = W - T * 2;
  const iH = H - T * 2;
  const darkColor = shiftColor(color, -0.12);
  return (
    <group>
      <Box pos={[-W / 2 + T / 2, H / 2, 0]} size={[T, H, D]} color={color} />
      <Box pos={[W / 2 - T / 2, H / 2, 0]} size={[T, H, D]} color={color} />
      <Box pos={[0, H - T / 2, 0]} size={[iW, T, D]} color={color} />
      <Box pos={[0, T / 2, 0]} size={[iW, T, D]} color={color} />
      <Box pos={[0, H / 2, -D / 2 + T / 2]} size={[iW, iH, T]} color={darkColor} roughness={0.85} />
    </group>
  );
}

// ─── Toe Kick ─────────────────────────────────────────────────────────────────
function ToeKick({ W, D, height }: { W: number; D: number; height: number }) {
  if (height <= 0) return null;
  return <Box pos={[0, height / 2, D / 2 - 0.03]} size={[W, height, 0.04]} color="#141414" />;
}

// ─── Countertop ───────────────────────────────────────────────────────────────
function Countertop({
  W, H, D, ctThick, ctOverhang, hasSink,
}: {
  W: number; H: number; D: number; ctThick: number; ctOverhang: number; hasSink: boolean;
}) {
  return (
    <group>
      <Box
        pos={[0, H + ctThick / 2, ctOverhang / 2]}
        size={[W + 0.02, ctThick, D + ctOverhang]}
        color="#8e8070"
        roughness={0.35}
        metalness={0.08}
      />
      {hasSink && (
        /* Sink basin (simulated inset — sits on top of countertop to imply cutout) */
        <Box
          pos={[0, H + ctThick * 0.65, 0]}
          size={[W * 0.62, ctThick * 0.8, D * 0.6]}
          color="#444"
          roughness={0.4}
          metalness={0.25}
        />
      )}
    </group>
  );
}

// ─── Drawer Face Mesh ─────────────────────────────────────────────────────────
function DrawerFace({
  drawer, W, D, toeKick, color,
}: {
  drawer: DrawerDef; W: number; D: number; toeKick: number; color: string;
}) {
  const iW = W - T * 2;
  const fW = (drawer.widthPct / 100) * iW - 0.003;
  const fH = drawer.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (drawer.offsetPct / 100) * iW + fW / 2;
  const cy = toeKick + T + drawer.fromBottomCm / 100 + fH / 2;
  const cz = D / 2 + 0.009;

  const faceColor = drawer.isGhost ? "#252533" : shiftColor(color, 0.05);

  return (
    <group>
      <Box
        pos={[cx, cy, cz]}
        size={[fW, fH, 0.017]}
        color={faceColor}
        opacity={drawer.isGhost ? 0.52 : 1}
        roughness={0.65}
      />
      {/* Ghost X-mark lines */}
      {drawer.isGhost && (
        <>
          <Box pos={[cx, cy, cz + 0.001]} size={[fW * 0.6, 0.002, 0.001]} color="#554" opacity={0.6} />
          <Box pos={[cx, cy, cz + 0.001]} size={[0.002, fH * 0.6, 0.001]} color="#554" opacity={0.6} />
        </>
      )}
      {/* Drawer handle */}
      {!drawer.isGhost && (
        <Box
          pos={[cx, cy, cz + 0.01]}
          size={[Math.min(fW * 0.38, 0.095), 0.007, 0.006]}
          color="#bbb"
          roughness={0.3}
          metalness={0.6}
        />
      )}
    </group>
  );
}

// ─── Door Panel Mesh ──────────────────────────────────────────────────────────
function DoorPanel({
  door, W, D, toeKick, color,
}: {
  door: DoorDef; W: number; D: number; toeKick: number; color: string;
}) {
  const iW = W - T * 2;
  const dW = (door.widthPct / 100) * iW - 0.003;
  const dH = door.heightCm / 100 - 0.003;
  const cx = -iW / 2 + (door.offsetPct / 100) * iW + dW / 2;
  const cy = toeKick + T + door.fromBottomCm / 100 + dH / 2;
  const cz = D / 2 + 0.01;

  const hx = door.hingeLeft ? cx - dW / 2 + 0.012 : cx + dW / 2 - 0.012;
  const handleX = door.hingeLeft ? cx + dW / 2 - 0.04 : cx - dW / 2 + 0.04;

  return (
    <group>
      <Box pos={[cx, cy, cz]} size={[dW, dH, 0.019]} color={shiftColor(color, 0.04)} roughness={0.62} />
      {/* Hinge */}
      <Box pos={[hx, cy, cz + 0.012]} size={[0.009, dH * 0.45, 0.006]} color="#888" roughness={0.4} metalness={0.4} />
      {/* Handle bar */}
      <Box pos={[handleX, cy, cz + 0.012]} size={[0.008, dH * 0.22, 0.006]} color="#ccc" roughness={0.25} metalness={0.7} />
    </group>
  );
}

// ─── Full Cabinet ─────────────────────────────────────────────────────────────
function CabinetMesh({ module }: { module: KitchenModule }) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const toeKick = module.options.hasToeKick ? module.options.toeKickHeight / 100 : 0;
  const ctThick = module.options.includesCountertop ? module.options.countertopThickness / 100 : 0;
  const ctOverhang = (module.options.countertopOverhang || 2) / 100;
  const color = module.options.color || "#d4c5b0";
  const hasSink =
    module.type === "bajo_tarja" ||
    module.type === "cubierta_tarja" ||
    module.type === "tarja";

  const drawers = getEffectiveDrawers(module);
  const doors = getEffectiveDoors(module);

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} />
      {toeKick > 0 && <ToeKick W={W} D={D} height={toeKick} />}
      {ctThick > 0 && (
        <Countertop W={W} H={H} D={D} ctThick={ctThick} ctOverhang={ctOverhang} hasSink={hasSink} />
      )}
      {drawers.map((d) => (
        <DrawerFace key={d.id} drawer={d} W={W} D={D} toeKick={toeKick} color={color} />
      ))}
      {doors.map((d) => (
        <DoorPanel key={d.id} door={d} W={W} D={D} toeKick={toeKick} color={color} />
      ))}
    </group>
  );
}

// ─── Color utility ────────────────────────────────────────────────────────────
function shiftColor(hex: string, amount: number): string {
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

  return (
    <div className="h-55 w-full overflow-hidden rounded-xl border border-white/8 bg-[#080810]">
      <Canvas
        camera={{ position: initPos, fov: 38, near: 0.01, far: 50 }}
        gl={{ antialias: true }}
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
