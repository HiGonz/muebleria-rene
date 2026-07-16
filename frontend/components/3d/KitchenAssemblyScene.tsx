"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import * as THREE from "three";
import { Home, Eye, EyeOff, MoveHorizontal, ArrowUp, Box as BoxIcon, Tag, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { CabinetMesh, CountertopDropEdge, mapKey } from "./ModulePreview3D";
import { Camera3DControls, type CameraAction } from "./Camera3DControls";
import { getWoodTexture, getWoodRoughness } from "./woodTextures";
import { useContextRecovery } from "./useContextRecovery";
import { CATEGORY_ICONS } from "@/services/kitchenData";
import { useIsMobile } from "@/lib/useIsMobile";
import type { KitchenModule, WallOpening, WallSide } from "@/types/kitchen";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// ─── Drag-to-reposition types ──────────────────────────────────────────────────
// The room has no rotation/offset of its own, so raycasting the pointer against
// the floor plane (y=0) gives room-space (x,z) directly — no per-wall local-space
// conversion needed (unlike the old per-wall-rotated-group scheme).
interface DragState {
  id: string;
  startPointerX: number;
  startPointerZ: number;
  startX: number;
  startZ: number;
  pointerId: number;
  // Screen-space start, used only to tell a click (select) apart from an
  // actual drag (move) — world-space floor deltas are too easy to trigger
  // by a hair's worth of mouse jitter on a plain click.
  startClientX: number;
  startClientY: number;
}
// Below this many CSS pixels of pointer travel, a press+release counts as a
// click (select the module) rather than a drag (move it).
const CLICK_DISTANCE_PX = 5;
interface DragPreview {
  id: string;
  x: number; // cm
  z: number; // cm
}

function setGrabCursor(hover: boolean) {
  if (typeof document !== "undefined") document.body.style.cursor = hover ? "grab" : "auto";
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────
function CameraRig({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...target);
  }, [camera, target]);
  return null;
}

// ─── Box with edge lines ───────────────────────────────────────────────────────
function Panel({ position, size, color, wireframe, opacity = 1, map = null, roughness, metalness }: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  wireframe?: boolean;
  opacity?: number;
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        key={mapKey(map)}
        color={map ? "#ffffff" : color}
        map={map ?? undefined}
        roughness={roughness}
        metalness={metalness}
        wireframe={wireframe}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

// ─── Drag handle props threaded onto each draggable module's outer group ──────
interface DragHandleProps {
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

// ─── Module placement wrapper ──────────────────────────────────────────────────
// Every module is positioned directly by its stored (x,z) room-space center and
// rotated in place around that same center — no cursor/offset math needed since
// x/z already represent the footprint's center (matching how CabinetMesh and the
// other category meshes already center their own geometry around local origin).
function ModulePlacement({ mod, children, drag }: { mod: KitchenModule; children: ReactNode; drag?: DragHandleProps }) {
  const mountY = mod.category === "upper" ? (mod.options.mountHeight || 144) / 100 : 0;
  return (
    <group position={[mod.x / 100, mountY, mod.z / 100]} rotation={[0, THREE.MathUtils.degToRad(mod.rotation), 0]} {...drag}>
      {children}
    </group>
  );
}

// ─── Cabinet wrapper (lower / upper / tower) ────────────────────────────────────
// Reuses the exact same CabinetMesh as the constructor preview — same carcass, doors,
// drawers, hinges, handles and countertop material color.
function CabinetWrapper({ mod, wireframe, drag, onSelect }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps; onSelect?: () => void }) {
  const w = mod.dimensions.width / 100;
  const d = mod.dimensions.depth / 100;
  return (
    <ModulePlacement mod={mod} drag={drag}>
      <CabinetMesh module={mod} wireframe={wireframe} onSelect={onSelect} />
      {/* Under-cabinet light strip (upper cabinets only) */}
      {mod.category === "upper" && mod.options.hasUnderLight && !wireframe && (
        <mesh position={[0, 0.02, d / 2 - 0.01]}>
          <boxGeometry args={[w * 0.8, 0.01, 0.02]} />
          <meshStandardMaterial color="#ffffe0" emissive="#ffffe0" emissiveIntensity={2} />
        </mesh>
      )}
    </ModulePlacement>
  );
}

// ─── Countertop Module ────────────────────────────────────────────────────────
function CountertopMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  const w = mod.dimensions.width / 100;
  const d = mod.dimensions.depth / 100;
  const y = mod.dimensions.height / 100; // height = 87cm for islands
  const ctH = mod.options.countertopThickness / 100;

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
  const ctColor = mod.options.countertopColor || ctColorMap[mod.options.countertopMaterial] || "#c8b89a";
  const ctTextureId = mod.options.countertopTexture !== "ninguna" ? mod.options.countertopTexture : undefined;
  const ctMap = ctTextureId ? getWoodTexture(ctTextureId) : null;
  // A wood texture needs matte, non-metallic shading — glossy stone-tuned
  // values would blow it out to a washed-out near-white specular highlight.
  const ctRoughness = ctTextureId ? getWoodRoughness(ctTextureId) : 0.35;
  const ctMetalness = ctTextureId ? 0.04 : 0.08;
  const bodyColor = mod.options.exteriorColor || mod.options.color || "#d4c5b0";
  const bodyMap = getWoodTexture(mod.options.exteriorTexture);
  const bodyRoughness = getWoodRoughness(mod.options.exteriorTexture);

  const isIsland = mod.type === "isla_central" || mod.type === "peninsula" || mod.type === "barra_desayunadora";
  const bodyH = isIsland ? y - ctH : 0;
  // Bullnose radius equals the slab thickness — its top half rounds over the
  // countertop itself, its bottom half keeps curving past the underside to
  // cover a bit of the cabinet face below.
  const dropR = ctH;
  const flatZ = isIsland ? d / 2 - dropR : d * 0.02 + (d + 0.04) / 2 - dropR;
  const panelDepth = isIsland ? d - dropR : d + 0.04 - dropR;
  const panelCenterZ = isIsland ? -dropR / 2 : d * 0.02 - dropR / 2;

  return (
    <ModulePlacement mod={mod} drag={drag}>
      {isIsland && bodyH > 0 && (
        <Panel position={[0, bodyH / 2, 0]} size={[w, bodyH, d]} color={bodyColor} map={bodyMap} roughness={bodyRoughness} wireframe={wireframe} />
      )}
      <Panel position={[0, (isIsland ? bodyH : 0.87) + ctH / 2, panelCenterZ]}
        size={[w + (isIsland ? 0 : 0.02), ctH, panelDepth]}
        color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe} />
      <CountertopDropEdge
        W={w + (isIsland ? 0 : 0.02)}
        bottomY={(isIsland ? bodyH : 0.87) - dropR}
        thickness={2 * dropR}
        flatZ={flatZ}
        color={ctColor} map={ctMap} roughness={ctRoughness} metalness={ctMetalness} wireframe={wireframe}
      />
      {/* Backsplash */}
      {mod.options.hasBacksplash && (
        <Panel position={[0, (isIsland ? bodyH : 0.87) + 0.3, -(d / 2) + 0.01]}
          size={[w, mod.options.backsplashHeight / 100, 0.015]}
          color="#e0d8cc" wireframe={wireframe} />
      )}
    </ModulePlacement>
  );
}

// ─── Appliance Space ──────────────────────────────────────────────────────────
function ApplianceMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const color = mod.options.color || "#d4c5b0";

  return (
    <ModulePlacement mod={mod} drag={drag}>
      {/* Frame panels (sides, top, bottom but hollow in front) */}
      <Panel position={[-w / 2 + 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[w / 2 - 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, h - 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
      {/* Appliance placeholder */}
      {!wireframe && (
        <Panel position={[0, h / 2, 0]} size={[w - 0.05, h - 0.05, d - 0.05]} color="#1a1a1a" wireframe={false} />
      )}
    </ModulePlacement>
  );
}

// ─── Accessory Mesh ───────────────────────────────────────────────────────────
// Most accessories are structural fillers (zócalos, trim/side panels) that stay
// put wherever they were auto-placed relative to a cabinet. The freestanding
// ones — sink, stove/grill, hood — are real objects a shop still needs to
// reposition like anything else, so those accept the drag handle too.
const DRAGGABLE_ACCESSORY_TYPES = new Set(["tarja", "estufa", "parrilla", "campana_extractora", "refrigerador", "microondas", "lavavajillas"]);

function AccessoryMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  const w = mod.dimensions.width / 100;
  const color = mod.options.color || "#c0c0c0";

  if (mod.type === "zoclo") {
    // Front strip is the visible exterior finish; the short side returns at
    // each end use the interior board instead, matching how a real zócalo is
    // built (only the front face needs to look "finished").
    const h = mod.dimensions.height / 100;
    const returnDepth = 0.06;
    const exteriorMap = getWoodTexture(mod.options.exteriorTexture);
    const exteriorRoughness = getWoodRoughness(mod.options.exteriorTexture);
    const interiorColor = mod.options.color || "#ffffff";
    return (
      <ModulePlacement mod={mod}>
        <Panel position={[0, 0, 0]} size={[w, h, 0.02]} color={mod.options.exteriorColor || color} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
        <Panel position={[-w / 2 + 0.01, 0, returnDepth / 2 - 0.01]} size={[0.02, h, returnDepth]} color={interiorColor} wireframe={wireframe} />
        <Panel position={[w / 2 - 0.01, 0, returnDepth / 2 - 0.01]} size={[0.02, h, returnDepth]} color={interiorColor} wireframe={wireframe} />
      </ModulePlacement>
    );
  }
  if (mod.type === "tarja") {
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, 0.9, 0]}>
          <Panel position={[0, 0, 0]} size={[w, 0.03, 0.5]} color="#b0b0b0" wireframe={wireframe} />
          {!wireframe && (
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[w * 0.7, 0.15, 0.35]} />
              <meshStandardMaterial color="#808080" metalness={0.8} roughness={0.2} />
            </mesh>
          )}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "estufa") {
    // Freestanding range with its own oven body — the norm in Mexican
    // kitchens is to leave a gap in the cabinet run and drop in a
    // store-bought stove rather than build a cooktop into a cabinet, so
    // this needs the full floor-to-counter body, not just a cooktop insert
    // (that's what "parrilla" below still is — a built-in surface).
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    const bodyColor = mod.options.color || "#e8e8e8";
    const knobXs = [-w * 0.28, -w * 0.09, w * 0.09, w * 0.28];
    const panelY = h - 0.05;
    const doorH = h * 0.66;
    const doorY = doorH / 2 + 0.04;
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <Panel position={[0, h / 2, 0]} size={[w, h, d]} color={bodyColor} roughness={0.4} metalness={0.25} wireframe={wireframe} />
        <Panel position={[0, h + 0.006, 0]} size={[w * 0.97, 0.012, d * 0.93]} color="#0d0d0d" roughness={0.15} metalness={0.1} wireframe={wireframe} />
        {!wireframe && (
          <>
            {([[-w * 0.24, -d * 0.22], [w * 0.24, -d * 0.22], [-w * 0.24, d * 0.22], [w * 0.24, d * 0.22]] as [number, number][]).map(([bx, bz], i) => (
              <group key={i} position={[bx, h + 0.013, bz]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.05, 0.075, 32]} />
                  <meshStandardMaterial color="#3a3a3a" roughness={0.5} side={2} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.05, 32]} />
                  <meshStandardMaterial color="#1a1a1a" roughness={0.4} side={2} />
                </mesh>
              </group>
            ))}
            {/* Control panel strip, just under the cooktop */}
            <mesh position={[0, panelY, d / 2 + 0.006]}>
              <boxGeometry args={[w * 0.92, 0.07, 0.012]} />
              <meshStandardMaterial color="#d5d5d5" metalness={0.3} roughness={0.4} />
            </mesh>
            {knobXs.map((bx, i) => (
              <mesh key={`knob${i}`} position={[bx, panelY, d / 2 + 0.013]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.014, 0.014, 0.012, 16]} />
                <meshStandardMaterial color="#ddd" metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
            {/* Oven door */}
            <mesh position={[0, doorY, d / 2 + 0.008]}>
              <boxGeometry args={[w * 0.92, doorH, 0.016]} />
              <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.35} />
            </mesh>
            {/* Oven window */}
            <mesh position={[0, doorY + doorH * 0.08, d / 2 + 0.017]}>
              <boxGeometry args={[w * 0.68, doorH * 0.55, 0.006]} />
              <meshStandardMaterial color="#0d0d0d" metalness={0.5} roughness={0.2} />
            </mesh>
            {/* Handle */}
            <mesh position={[0, doorY + doorH * 0.42, d / 2 + 0.03]}>
              <boxGeometry args={[w * 0.78, 0.02, 0.02]} />
              <meshStandardMaterial color="#999" metalness={0.7} roughness={0.25} />
            </mesh>
          </>
        )}
      </ModulePlacement>
    );
  }
  if (mod.type === "parrilla") {
    // Built-in cooktop insert (no body) — sits in a counter cutout, unlike
    // the freestanding "estufa" above.
    const knobXs = [-w * 0.32, -w * 0.11, w * 0.11, w * 0.32];
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, 0.87, 0]}>
          <Panel position={[0, 0.006, 0]} size={[w, 0.012, 0.56]} color="#0d0d0d" roughness={0.15} metalness={0.1} wireframe={wireframe} />
          {!wireframe && [[-w * 0.24, -0.13], [w * 0.24, -0.13], [-w * 0.24, 0.13], [w * 0.24, 0.13]].map(([bx, bz], i) => (
            <group key={i} position={[bx, 0.013, bz]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.05, 0.075, 32]} />
                <meshStandardMaterial color="#3a3a3a" roughness={0.5} side={2} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.05, 32]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.4} side={2} />
              </mesh>
            </group>
          ))}
          {!wireframe && knobXs.map((bx, i) => (
            <mesh key={`knob${i}`} position={[bx, 0.02, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.012, 16]} />
              <meshStandardMaterial color="#ddd" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "refrigerador") {
    // Freestanding French-door fridge: a body box plus two slightly-proud
    // door panels with a seam and vertical handles down the middle.
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    const bodyColor = mod.options.color || "#c9cdd1";
    const doorW = w / 2 - 0.01;
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, h / 2, 0]}>
          <Panel position={[0, 0, 0]} size={[w, h, d]} color={bodyColor} roughness={0.35} metalness={0.5} wireframe={wireframe} />
          {!wireframe && (
            <>
              <Panel position={[-w / 4 - 0.005, 0, d / 2 + 0.006]} size={[doorW, h * 0.97, 0.012]} color={bodyColor} roughness={0.3} metalness={0.55} />
              <Panel position={[w / 4 + 0.005, 0, d / 2 + 0.006]} size={[doorW, h * 0.97, 0.012]} color={bodyColor} roughness={0.3} metalness={0.55} />
              <mesh position={[-0.035, 0, d / 2 + 0.018]}>
                <boxGeometry args={[0.018, h * 0.45, 0.025]} />
                <meshStandardMaterial color="#888" metalness={0.7} roughness={0.25} />
              </mesh>
              <mesh position={[0.035, 0, d / 2 + 0.018]}>
                <boxGeometry args={[0.018, h * 0.45, 0.025]} />
                <meshStandardMaterial color="#888" metalness={0.7} roughness={0.25} />
              </mesh>
            </>
          )}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "microondas") {
    // Countertop microwave: dark body, glass door window, side control
    // strip with a small handle — sits on the counter like a real unit.
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    const bodyColor = mod.options.color || "#2a2a2a";
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, 0.87 + h / 2, 0]}>
          <Panel position={[0, 0, 0]} size={[w, h, d]} color={bodyColor} roughness={0.4} metalness={0.3} wireframe={wireframe} />
          {!wireframe && (
            <>
              <mesh position={[-w * 0.08, 0, d / 2 + 0.003]}>
                <boxGeometry args={[w * 0.62, h * 0.7, 0.008]} />
                <meshStandardMaterial color="#111" metalness={0.6} roughness={0.15} />
              </mesh>
              <mesh position={[w * 0.36, 0, d / 2 + 0.003]}>
                <boxGeometry args={[w * 0.2, h * 0.85, 0.006]} />
                <meshStandardMaterial color="#151515" metalness={0.3} roughness={0.5} />
              </mesh>
              <mesh position={[w * 0.22, 0, d / 2 + 0.02]}>
                <boxGeometry args={[0.012, h * 0.55, 0.02]} />
                <meshStandardMaterial color="#999" metalness={0.7} roughness={0.25} />
              </mesh>
            </>
          )}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "lavavajillas") {
    // Under-counter dishwasher: stainless front, a dark top control strip
    // with a status light, and a handle bar just below it.
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    const bodyColor = mod.options.color || "#c8c8c8";
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, h / 2, 0]}>
          <Panel position={[0, 0, 0]} size={[w, h, d]} color={bodyColor} roughness={0.35} metalness={0.55} wireframe={wireframe} />
          {!wireframe && (
            <>
              <mesh position={[0, h / 2 - 0.025, d / 2 + 0.004]}>
                <boxGeometry args={[w * 0.94, 0.03, 0.01]} />
                <meshStandardMaterial color="#111" metalness={0.4} roughness={0.4} />
              </mesh>
              <mesh position={[w * 0.4, h / 2 - 0.025, d / 2 + 0.011]}>
                <boxGeometry args={[0.015, 0.01, 0.004]} />
                <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={1.2} />
              </mesh>
              <mesh position={[0, h / 2 - 0.07, d / 2 + 0.015]}>
                <boxGeometry args={[w * 0.85, 0.02, 0.02]} />
                <meshStandardMaterial color="#999" metalness={0.7} roughness={0.25} />
              </mesh>
            </>
          )}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "campana_extractora") {
    // A standalone wall-mount chimney hood — dark metal body + light strip +
    // a narrower duct rising toward the ceiling — no cabinet housing around
    // it, so it reads as a factory-bought unit rather than a melamine box.
    const h = mod.dimensions.height / 100;
    const mount = (mod.options.mountHeight || 144) / 100;
    const bodyColor = "#161616";
    const chimneyH = 0.55;
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, mount, 0]}>
          <Panel position={[0, h / 2, 0]} size={[w, h, 0.42]} color={bodyColor} wireframe={wireframe} />
          <Panel position={[0, h + chimneyH / 2, -0.09]} size={[w * 0.38, chimneyH, 0.22]} color={bodyColor} wireframe={wireframe} />
          {!wireframe && (
            <mesh position={[0, 0.01, 0.1]}>
              <boxGeometry args={[w * 0.85, 0.015, 0.16]} />
              <meshStandardMaterial color="#e8e8e8" emissive="#fff6df" emissiveIntensity={0.6} />
            </mesh>
          )}
        </group>
      </ModulePlacement>
    );
  }
  if (mod.type === "panel_lateral" || mod.type === "panel_remate" || mod.type === "panel_decorativo") {
    return (
      <ModulePlacement mod={mod}>
        <Panel position={[0, mod.dimensions.height / 200, 0]} size={[0.018, mod.dimensions.height / 100, mod.dimensions.depth / 100]} color={color} wireframe={wireframe} />
      </ModulePlacement>
    );
  }

  return null; // Other accessories (herrajes, organizadores, etc.) are not 3D rendered
}

// Categories whose bodies can be grabbed and dragged around the room floor.
// Structural accessories (zócalos, trim panels) stay put — see
// DRAGGABLE_ACCESSORY_TYPES for the freestanding ones that are the exception.
const DRAGGABLE_CATEGORIES: KitchenModule["category"][] = ["lower", "upper", "tower", "countertop", "appliance"];

function isDraggableModule(mod: KitchenModule): boolean {
  if (mod.category === "accessory") return DRAGGABLE_ACCESSORY_TYPES.has(mod.type);
  return DRAGGABLE_CATEGORIES.includes(mod.category);
}

// Rotation that turns a module's back (its local -Z side, where the carcass'
// back panel sits) toward whichever of the room's four walls is closest to
// (x, z) — dragging a module near a wall snaps its facing automatically,
// the way it would end up placed by hand in a real kitchen.
function nearestWallRotation(x: number, z: number, roomWidthM: number, roomDepthM: number): KitchenModule["rotation"] {
  const distances: [KitchenModule["rotation"], number][] = [
    [0, z],                  // north wall, z = 0
    [180, roomDepthM - z],   // south wall, z = roomDepthM
    [90, x],                 // west wall, x = 0
    [270, roomWidthM - x],   // east wall, x = roomWidthM
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

// ─── Module renderer router ───────────────────────────────────────────────────
function ModuleMesh({ mod, wireframe, drag, onSelect }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps; onSelect?: () => void }) {
  switch (mod.category) {
    case "lower":
    case "upper":
    case "tower":      return <CabinetWrapper mod={mod} wireframe={wireframe} drag={drag} onSelect={onSelect} />;
    case "countertop": return <CountertopMesh mod={mod} wireframe={wireframe} drag={drag} />;
    case "appliance":  return <ApplianceMesh  mod={mod} wireframe={wireframe} drag={drag} />;
    case "accessory":  return <AccessoryMesh  mod={mod} wireframe={wireframe} drag={drag} />;
    default: return null;
  }
}

// Y where a module's own top surface sits — floor-relative base (accounting
// for wall-mounted pieces like uppers *and* the accessory-category campana
// extractora, which also hangs on mountHeight) plus its own height and, for
// lower cabinets, the countertop on top of it.
function moduleTopY(mod: KitchenModule): number {
  return baseY(mod) + mod.dimensions.height / 100 + (mod.options.includesCountertop ? (mod.options.countertopThickness || 3) / 100 : 0);
}

// ─── Label ─────────────────────────────────────────────────────────────────────
// A DOM pill badge instead of in-scene 3D text — crisp at any distance/angle
// and legible against both light walls and dark floors, unlike the old muted
// gray Text mesh that all but disappeared against the room. pointer-events
// none so it never steals a click from the module underneath (the gear
// button already owns that interaction).
function ModuleLabel({ mod }: { mod: KitchenModule }) {
  const labelY = moduleTopY(mod) + 0.1;
  return (
    <Html position={[mod.x / 100, labelY, mod.z / 100]} center distanceFactor={6} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-full border border-white/25 bg-black/80 px-2.5 py-1 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        {mod.label}
      </span>
    </Html>
  );
}

// ─── Gear button (click a module → shows this → opens the inspector) ─────────
function ModuleGearButton({ mod, onClick }: { mod: KitchenModule; onClick: () => void }) {
  const labelY = moduleTopY(mod) + 0.12;
  return (
    <Html position={[mod.x / 100, labelY, mod.z / 100]} center distanceFactor={6} zIndexRange={[20, 0]}>
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Editar mueble"
        title="Editar mueble"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-indigo-500 text-white shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95"
      >
        <Settings2 size={15} />
      </button>
    </Html>
  );
}

// Vertical anchor a module's mesh actually renders from — mirrors the fixed
// y-offsets each mesh function below uses (mountHeight for wall-mounted
// pieces, counter height for sink/stove/plain countertops, floor otherwise).
function baseY(mod: KitchenModule): number {
  if (mod.category === "upper" || mod.type === "campana_extractora") return (mod.options.mountHeight || 144) / 100;
  if (mod.type === "tarja") return 0.82;
  // "estufa" is a floor-standing range now (its own height reaches the
  // cooktop), unlike "parrilla"/"microondas" which still sit on a counter.
  if (mod.type === "parrilla" || mod.type === "microondas") return 0.87;
  if (mod.category === "countertop" && !["isla_central", "peninsula", "barra_desayunadora"].includes(mod.type)) return 0.87;
  return 0;
}

// ─── Highlight overlay ─────────────────────────────────────────────────────────
// A pulsing, slightly-oversized wireframe-free box around a module — rendered
// while its row in the module list is hovered, so it's easy to spot in the
// scene regardless of which mesh type it is (cabinet, countertop, accessory…).
function ModuleHighlight({ mod }: { mod: KitchenModule }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 5) * 0.15;
  });
  const w = mod.dimensions.width / 100 + 0.06;
  const d = mod.dimensions.depth / 100 + 0.06;
  const h = mod.dimensions.height / 100 + 0.06;
  const mountY = baseY(mod);
  return (
    <group position={[mod.x / 100, mountY, mod.z / 100]} rotation={[0, THREE.MathUtils.degToRad(mod.rotation), 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial ref={matRef} color="#ffd400" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

// An opening's dimensions converted to meters and localized to a single wall
// (the wall's own type/offset/width/height/sillHeight, unit-converted).
interface WallOpeningM {
  type: "window" | "door";
  offset: number; // meters, from the wall's start corner
  width: number;
  height: number;
  sillHeight: number;
}

// ─── "Sims" wall: tall when it's on the far side from the camera, low when it
// would otherwise block the view (i.e. the camera is looking over/through it).
// Openings punch the wall into several boxes (jambs + header/sill "trim" +
// a glass pane for windows) instead of one solid slab. Every piece is built
// at its full ("tall") height and the whole group is rescaled on the Y axis
// each frame, which is far cheaper than rebuilding geometry to change height
// and keeps openings proportionally correct as the wall drops/rises.
function SimsWall({ center, normal, length, thickness, openings }: {
  center: [number, number]; // room-space (x, z) of the wall's midpoint
  normal: [number, number]; // outward-facing unit normal (x, z)
  length: number;
  thickness: number;
  openings: WallOpeningM[];
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentH = useRef(0.15);
  const tallH = 2.4;
  const lowH = 0.15;

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const dx = camera.position.x - center[0];
    const dz = camera.position.z - center[1];
    const dot = dx * normal[0] + dz * normal[1];
    const target = dot > 0 ? lowH : tallH;
    currentH.current += (target - currentH.current) * 0.12;
    group.scale.y = currentH.current / tallH;
  });

  const isNorthSouth = Math.abs(normal[0]) < Math.abs(normal[1]);
  const toWorld = (u: number): [number, number] =>
    isNorthSouth ? [center[0] + u, center[1]] : [center[0], center[1] + u];

  // Walk the openings left-to-right, carving the [-length/2, length/2] strip
  // into solid "wall" segments — including the header above every opening and
  // the sill below a raised one, both just plain wall — plus a glass pane for
  // windows.
  interface Piece { uStart: number; uEnd: number; yStart: number; yEnd: number; kind: "wall" | "glass"; }
  const pieces: Piece[] = [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  let cursor = -length / 2;
  for (const o of sorted) {
    const uStart = Math.max(o.offset - o.width / 2 - length / 2, -length / 2);
    const uEnd = Math.min(o.offset + o.width / 2 - length / 2, length / 2);
    if (uEnd <= uStart) continue;
    if (uStart > cursor) pieces.push({ uStart: cursor, uEnd: uStart, yStart: 0, yEnd: tallH, kind: "wall" });
    const lintelY = Math.min(o.sillHeight + o.height, tallH);
    if (lintelY < tallH) pieces.push({ uStart, uEnd, yStart: lintelY, yEnd: tallH, kind: "wall" });
    if (o.sillHeight > 0) pieces.push({ uStart, uEnd, yStart: 0, yEnd: o.sillHeight, kind: "wall" });
    if (o.type === "window") pieces.push({ uStart, uEnd, yStart: o.sillHeight, yEnd: lintelY, kind: "glass" });
    cursor = Math.max(cursor, uEnd);
  }
  if (cursor < length / 2) pieces.push({ uStart: cursor, uEnd: length / 2, yStart: 0, yEnd: tallH, kind: "wall" });

  return (
    <group ref={groupRef}>
      {pieces.map((p, i) => {
        const [wx, wz] = toWorld((p.uStart + p.uEnd) / 2);
        const uLen = p.uEnd - p.uStart;
        const yMid = (p.yStart + p.yEnd) / 2;
        const yLen = p.yEnd - p.yStart;
        const size: [number, number, number] = isNorthSouth ? [uLen, yLen, thickness] : [thickness, yLen, uLen];
        if (p.kind === "glass") {
          return (
            <mesh key={i} position={[wx, yMid, wz]}>
              <boxGeometry args={size} />
              <meshStandardMaterial color="#dceefa" transparent opacity={0.55} emissive="#dbe9ff" emissiveIntensity={0.5} />
            </mesh>
          );
        }
        return (
          <mesh key={i} position={[wx, yMid, wz]} castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#c9c7d4" />
          </mesh>
        );
      })}
      {/* Soft daylight glow just inside each window, so it visibly lights the room */}
      {sorted.filter((o) => o.type === "window").map((o, i) => {
        const [wx, wz] = toWorld(o.offset - length / 2);
        const wy = o.sillHeight + o.height / 2;
        const inward = 0.4;
        return (
          <pointLight key={`light-${i}`} position={[wx - normal[0] * inward, wy, wz - normal[1] * inward]}
            intensity={0.6} distance={5} decay={2} color="#fff3df" />
        );
      })}
    </group>
  );
}

// ─── Room boundary (floor + 4 perimeter walls that drop down "Sims style"
// when they'd block the camera's view of the room) ──────────────────────────
function RoomBoundary({ roomWidthM, roomDepthM, openings }: { roomWidthM: number; roomDepthM: number; openings: WallOpening[] }) {
  const t = 0.05;
  const centerX = roomWidthM / 2;
  const centerZ = roomDepthM / 2;
  const forWall = (wall: WallSide): WallOpeningM[] =>
    openings.filter((o) => o.wall === wall).map((o) => ({
      type: o.type, offset: o.offset / 100, width: o.width / 100, height: o.height / 100, sillHeight: o.sillHeight / 100,
    }));
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[roomWidthM / 2, -0.003, roomDepthM / 2]} receiveShadow>
        <planeGeometry args={[roomWidthM, roomDepthM]} />
        <meshStandardMaterial color="#c8c2b6" />
      </mesh>
      <Grid position={[roomWidthM / 2, -0.001, roomDepthM / 2]} args={[roomWidthM, roomDepthM]} cellColor="#9a9488" sectionColor="#7a7468" fadeDistance={30} fadeStrength={1.5} />
      {/* North wall (z=0) */}
      <SimsWall center={[centerX, 0]} normal={[0, -1]} length={roomWidthM} thickness={t} openings={forWall("north")} />
      {/* South wall */}
      <SimsWall center={[centerX, roomDepthM]} normal={[0, 1]} length={roomWidthM} thickness={t} openings={forWall("south")} />
      {/* West wall */}
      <SimsWall center={[0, centerZ]} normal={[-1, 0]} length={roomDepthM} thickness={t} openings={forWall("west")} />
      {/* East wall */}
      <SimsWall center={[roomWidthM, centerZ]} normal={[1, 0]} length={roomDepthM} thickness={t} openings={forWall("east")} />
    </>
  );
}

// ─── Drag-to-reposition controller ─────────────────────────────────────────────
// Lives inside the Canvas (needs useThree for camera/gl/raycaster). Raycasts the
// pointer against an infinite floor plane — the hit point's world x/z *is* the
// room-space position (the room has no wrapping rotation/offset), clamped to the
// room's bounds accounting for the module's rotated footprint.
function AssemblyContent({
  modules, roomWidthM, roomDepthM, wireframe, showLabels, controlsRef, onModuleMove, onModuleActivate, hiddenIds, isolatedId, hoveredId,
  selectedId, onSelectModule,
}: {
  modules: KitchenModule[]; roomWidthM: number; roomDepthM: number; wireframe: boolean; showLabels: boolean;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"]) => void;
  onModuleActivate?: (id: string) => void;
  hiddenIds: Set<string>; isolatedId: string | null; hoveredId: string | null;
  selectedId: string | null; onSelectModule: (id: string | null) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)).current;

  const getFloorHit = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(floorPlane, point) ? point : null;
  };

  const endDrag = (move: (e: PointerEvent) => void, up: (e: PointerEvent) => void, pointerId: number) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
    if (controlsRef.current) controlsRef.current.enabled = true;
    dragRef.current = null;
    setDragPreview(null);
  };

  const handleDragStart = (mod: KitchenModule, e: ThreeEvent<PointerEvent>) => {
    const hit = getFloorHit(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!hit) return;
    const pointerId = e.nativeEvent.pointerId;

    // A 90°/270° rotation swaps the visual footprint's width/depth for clamping.
    const isRotated = mod.rotation === 90 || mod.rotation === 270;
    const halfW = (isRotated ? mod.dimensions.depth : mod.dimensions.width) / 200;
    const halfD = (isRotated ? mod.dimensions.width : mod.dimensions.depth) / 200;
    const clamp = (x: number, z: number) => ({
      x: Math.min(Math.max(x, halfW), Math.max(halfW, roomWidthM - halfW)),
      z: Math.min(Math.max(z, halfD), Math.max(halfD, roomDepthM - halfD)),
    });

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const hit = getFloorHit(ev.clientX, ev.clientY);
      if (!hit) return;
      const { x, z } = clamp(state.startX + (hit.x - state.startPointerX), state.startZ + (hit.z - state.startPointerZ));
      setDragPreview({ id: state.id, x: x * 100, z: z * 100 });
    };
    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const traveled = Math.hypot(ev.clientX - state.startClientX, ev.clientY - state.startClientY);
      if (traveled < CLICK_DISTANCE_PX) {
        // A plain click, not a drag — (de)select the module instead of moving it.
        onSelectModule(selectedId === state.id ? null : state.id);
      } else {
        const hit = getFloorHit(ev.clientX, ev.clientY);
        if (hit) {
          const { x, z } = clamp(state.startX + (hit.x - state.startPointerX), state.startZ + (hit.z - state.startPointerZ));
          onModuleMove?.(state.id, x * 100, z * 100, nearestWallRotation(x, z, roomWidthM, roomDepthM));
        }
      }
      endDrag(handleMove, handleUp, pointerId);
    };

    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* pointer already captured */ }
    dragRef.current = {
      id: mod.id, startPointerX: hit.x, startPointerZ: hit.z, startX: mod.x / 100, startZ: mod.z / 100, pointerId,
      startClientX: e.nativeEvent.clientX, startClientY: e.nativeEvent.clientY,
    };
    setDragPreview({ id: mod.id, x: mod.x, z: mod.z });
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <>
      {modules.map((mod) => {
        const visible = isolatedId ? mod.id === isolatedId : !hiddenIds.has(mod.id);
        if (!visible) return null;
        const draggable = isDraggableModule(mod) && !!onModuleMove;
        const drag: DragHandleProps | undefined = draggable
          ? {
              onPointerDown: (e) => { e.stopPropagation(); handleDragStart(mod, e); },
              onPointerOver: (e) => { e.stopPropagation(); setGrabCursor(true); },
              onPointerOut: () => setGrabCursor(false),
            }
          : undefined;
        const effective = dragPreview?.id === mod.id ? { ...mod, x: dragPreview.x, z: dragPreview.z } : mod;
        // Clicking a drawer/door face toggles it open *and* selects the module —
        // its own click handler stops propagation (so it doesn't also start a
        // drag), which otherwise meant the module-level select-on-click never
        // fired for the most visually prominent part of a cabinet. Unlike a
        // plain click elsewhere (which toggles selection), this always selects
        // — re-opening/closing a drawer on an already-selected module shouldn't
        // deselect it out from under the gear button.
        const selectThis = () => onSelectModule(mod.id);
        return (
          <group
            key={mod.id}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSelectModule(mod.id);
              onModuleActivate?.(mod.id);
            }}
          >
            <ModuleMesh mod={effective} wireframe={wireframe} drag={drag} onSelect={selectThis} />
            {showLabels && !(selectedId === mod.id) && <ModuleLabel mod={effective} />}
            {hoveredId === mod.id && <ModuleHighlight mod={effective} />}
            {selectedId === mod.id && onModuleActivate && (
              <ModuleGearButton mod={effective} onClick={() => onModuleActivate(mod.id)} />
            )}
          </group>
        );
      })}
    </>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────
interface KitchenAssemblySceneProps {
  modules: KitchenModule[];
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings?: WallOpening[];
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"]) => void;
  onModuleActivate?: (id: string) => void;
  onUndo?: () => void;
  undoCount?: number;
}

export function KitchenAssemblyScene({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onUndo, undoCount = 0,
}: KitchenAssemblySceneProps) {
  const [wireframe, setWireframe] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    // Starts collapsed on phones — the full list otherwise covers most of the
    // viewport — but only auto-collapses once, so a manual re-open sticks
    // through orientation changes / resizes.
    if (isMobile && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setListCollapsed(true);
    }
  }, [isMobile]);
  const toggleIsolate = (id: string) => setIsolatedId((cur) => (cur === id ? null : id));
  const toggleHidden = (id: string) =>
    setHiddenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const roomWidthM = roomWidth / 100;
  const roomDepthM = roomDepth / 100;
  const centerX = roomWidthM / 2;
  const centerZ = roomDepthM / 2;
  const resetTarget: [number, number, number] = [centerX + 1, 2.8, roomDepthM + 3];
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>(resetTarget);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const { instanceKey, handleCreated: handleCanvasCreated } = useContextRecovery();

  // Moves the camera toward/away from the orbit target along its current view
  // direction — a simple, always-available zoom for touch users unfamiliar
  // with pinch/scroll gestures (OrbitControls' own dolly still works too).
  const zoom = (factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    dir.multiplyScalar(factor);
    camera.position.copy(controls.target).add(dir);
    controls.update();
  };

  const presets: CameraAction[] = [
    { key: "reset", icon: Home, label: "Reset", onClick: () => setCameraTarget(resetTarget) },
    { key: "front", icon: Eye, label: "Frontal", onClick: () => setCameraTarget([centerX, 1.5, roomDepthM + 2]) },
    { key: "side", icon: MoveHorizontal, label: "Lateral", onClick: () => setCameraTarget([roomWidthM + 2, 1.5, centerZ]) },
    { key: "top", icon: ArrowUp, label: "Superior", onClick: () => setCameraTarget([centerX, roomDepthM + 5, centerZ + 0.1]) },
  ];
  const toggles: CameraAction[] = [
    { key: "wireframe", icon: BoxIcon, label: wireframe ? "Sólido" : "Wireframe", active: wireframe, onClick: () => setWireframe((v) => !v) },
    { key: "labels", icon: Tag, label: showLabels ? "Ocultar etiquetas" : "Mostrar etiquetas", active: showLabels, onClick: () => setShowLabels((v) => !v) },
  ];

  return (
    <div className="relative h-full overflow-hidden bg-[#0d0d14]">
      <Camera3DControls
        presets={presets} toggles={toggles}
        onZoomIn={() => zoom(0.8)} onZoomOut={() => zoom(1.25)}
        onUndo={() => onUndo?.()} undoCount={undoCount}
      />

      {/* Controls legend — desktop gets the free bottom-left corner; mobile
          gets a compact one-liner above the (auto-collapsed) module list so
          it doesn't fight the control clusters stacked bottom-right there. */}
      <div className="absolute bottom-20 left-3 z-10 max-w-[13rem] rounded-xl border border-white/8 bg-black/60 px-3 py-2 text-[10px] leading-relaxed text-zinc-400 backdrop-blur-sm lg:bottom-3 lg:max-w-none">
        <p className="lg:hidden">👆 1 dedo: rotar · 2 dedos: mover y zoom</p>
        <p className="hidden lg:block">🖱️ Click: rotar · Click derecho: mover · Rueda: zoom</p>
      </div>

      {/* Module list — left on mobile (controls own the bottom-right corner there) */}
      <div className={`absolute bottom-3 left-3 z-10 flex flex-col rounded-xl border border-white/8 bg-black/60 backdrop-blur-sm text-xs text-zinc-400 lg:left-auto lg:right-3 ${listCollapsed ? "" : "w-60"}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            onClick={() => setListCollapsed((v) => !v)}
            aria-label={listCollapsed ? "Mostrar lista de módulos" : "Minimizar lista de módulos"}
            title={listCollapsed ? "Mostrar módulos" : "Minimizar"}
            className="flex items-center gap-1.5 font-semibold text-zinc-300 text-[10px] uppercase tracking-wide hover:text-white"
          >
            {listCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Módulos ({modules.length})
          </button>
          {!listCollapsed && (isolatedId || hiddenIds.size > 0) && (
            <button
              onClick={() => { setIsolatedId(null); setHiddenIds(new Set()); }}
              className="text-[10px] font-medium text-indigo-300 hover:text-indigo-200"
            >
              Mostrar todo
            </button>
          )}
        </div>
        {!listCollapsed && (
          <>
            <div className="max-h-[38vh] space-y-0.5 overflow-y-auto px-1.5 pb-2">
              {modules.map((mod) => {
                const isIsolated = isolatedId === mod.id;
                const isHidden = hiddenIds.has(mod.id);
                return (
                  <div
                    key={mod.id}
                    className={`flex items-center justify-between gap-1 rounded-lg px-1.5 py-1 transition-colors ${isIsolated ? "bg-indigo-500/20" : ""}`}
                  >
                    <span
                      onMouseEnter={() => setHoveredId(mod.id)}
                      onMouseLeave={() => setHoveredId((cur) => (cur === mod.id ? null : cur))}
                      className={`truncate text-[11px] ${isHidden ? "text-zinc-600 line-through" : "text-zinc-300"}`}
                      title={mod.label}
                    >
                      {CATEGORY_ICONS[mod.category]} {mod.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => toggleIsolate(mod.id)}
                        aria-label="Ver solo este"
                        title="Ver solo este"
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isIsolated ? "bg-indigo-500 text-white" : "text-zinc-500 hover:bg-white/10 hover:text-white"}`}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={() => toggleHidden(mod.id)}
                        aria-label={isHidden ? "Mostrar" : "Ocultar"}
                        title={isHidden ? "Mostrar" : "Ocultar"}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isHidden ? "bg-rose-500/70 text-white" : "text-zinc-500 hover:bg-white/10 hover:text-white"}`}
                      >
                        <EyeOff size={12} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-white/8 px-3 py-1.5 text-[10px] text-zinc-500 hidden lg:block">Arrastra un módulo para moverlo · pasa el mouse sobre su nombre para ubicarlo</p>
          </>
        )}
      </div>

      <Canvas
        key={instanceKey}
        shadows
        camera={{ position: cameraTarget, fov: 45 }}
        onCreated={handleCanvasCreated}
        onPointerMissed={() => setSelectedId(null)}
      >
        <color attach="background" args={["#1c1c28"]} />
        <CameraRig target={cameraTarget} />
        <OrbitControls
          ref={controlsRef}
          target={[centerX, 0.9, centerZ]}
          enableDamping
          dampingFactor={0.05}
          enablePan
          panSpeed={1.2}
          screenSpacePanning
        />

        <ambientLight intensity={1} />
        <directionalLight position={[centerX + 3, 6, centerZ + 3]} intensity={1.2} castShadow />
        <pointLight position={[centerX - 2, 3, centerZ - 2]} intensity={0.4} />
        <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />

        <RoomBoundary roomWidthM={roomWidthM} roomDepthM={roomDepthM} openings={openings} />

        <AssemblyContent
          modules={modules} roomWidthM={roomWidthM} roomDepthM={roomDepthM}
          wireframe={wireframe} showLabels={showLabels} controlsRef={controlsRef} onModuleMove={onModuleMove}
          onModuleActivate={onModuleActivate}
          hiddenIds={hiddenIds} isolatedId={isolatedId} hoveredId={hoveredId}
          selectedId={selectedId} onSelectModule={setSelectedId}
        />
      </Canvas>
    </div>
  );
}
