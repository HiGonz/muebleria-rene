"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls } from "@react-three/drei";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import * as THREE from "three";
import { Home, Eye, EyeOff, MoveHorizontal, ArrowUp, Box as BoxIcon, Tag, Ruler, ChevronDown, ChevronUp, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CabinetMesh, CountertopDropEdge, mapKey } from "./ModulePreview3D";
import { Camera3DControls, type CameraAction } from "./Camera3DControls";
import { SelectionToolbar, type NudgeDirection } from "./SelectionToolbar";
import { getWoodTexture, getWoodRoughness } from "./woodTextures";
import { useContextRecovery } from "./useContextRecovery";
import { CATEGORY_ICONS } from "@/services/kitchenData";
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
// Perimeter wall thickness (meters) — walls are centered ON the room's x=0/
// roomWidthM/z=0/roomDepthM boundary lines, so each one's actual room-facing
// surface sits half a thickness INSIDE that line, not on it. Anything that
// treats those boundary lines as the usable interior (the drag clamp below)
// has to shrink the usable area by this much per side, or modules pushed
// flush against a wall end up with their back panel buried half a wall
// thickness into it instead of touching its inner face.
const WALL_THICKNESS_M = 0.05;

// ─── Adjacent-cabinet drag snap ─────────────────────────────────────────────
// While dragging, pulls a cabinet the rest of the way to an exact, gapless
// touch against a compatible neighbor once it's dragged close — flush runs
// are fiddly to land by hand otherwise. Purely a drag-positioning aid: it
// does not change how either cabinet renders (no shared/hidden side panels).
const SNAP_ELIGIBLE_CATEGORIES = new Set<KitchenModule["category"]>(["lower", "upper", "tower", "corner"]);
const SNAP_MIN_OVERLAP_M = 0.15;

// Both blind-corner types (floor and wall) are wider than dimensions.width by
// a full depth — their blind extension (see CornerBlindCabinetMesh) — grown
// symmetrically around the module's own x/z, so footprint math just needs
// this widened width, not an off-center box.
const BLIND_CORNER_TYPES = new Set<KitchenModule["type"]>(["gabinete_bajo_esquinero_puertas", "gabinete_superior_esquinero_puertas"]);
function blindCornerFootprintWidth(mod: KitchenModule): number {
  return BLIND_CORNER_TYPES.has(mod.type) ? mod.dimensions.width + mod.dimensions.depth : mod.dimensions.width;
}

function moduleFootprint(mod: KitchenModule): { halfW: number; halfD: number } {
  const footprintWidth = blindCornerFootprintWidth(mod);
  return { halfW: footprintWidth / 200, halfD: mod.dimensions.depth / 200 };
}

// ─── Overlap prevention ─────────────────────────────────────────────────────
// Only floor-standing cabinetry (lower/tower/corner-on-the-floor, plus
// appliance niches — a "Nicho para..." stands in a run right next to real
// cabinets, so it needs to block them exactly the same way) collides with
// itself, and only wall-mounted cabinetry (upper/corner-on-the-wall) collides
// with itself — the two bands sit at different heights (see ModulePlacement's
// mountY), so one band crossing over the other in plan view (an upper
// cabinet above a lower one) is normal, not a collision. Countertop/accessory
// modules are overlays by design (a countertop spans the tops of a cabinet
// run; an accessory dropped into its matching niche — see
// NICHE_ACCESSORY_MATCH — is *meant* to sit exactly inside one) and stay out
// of the check entirely.
function placementBand(mod: KitchenModule): "floor" | "wall" | null {
  const isWallMounted = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
  if (isWallMounted) return "wall";
  if (mod.category === "lower" || mod.category === "tower" || mod.category === "corner" || mod.category === "appliance") return "floor";
  return null;
}

// World-space AABB (meters) for a candidate position/rotation — same
// rotation-aware half-extent swap clampModuleToRoom uses, parameterized so a
// not-yet-committed drag/nudge target can be checked before it's applied.
function moduleBox(mod: KitchenModule, x: number, z: number, rotation: KitchenModule["rotation"]) {
  const footprintWidth = blindCornerFootprintWidth(mod);
  const isRotated = rotation === 90 || rotation === 270;
  const halfW = (isRotated ? mod.dimensions.depth : footprintWidth) / 200;
  const halfD = (isRotated ? footprintWidth : mod.dimensions.depth) / 200;
  return { minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD };
}

// Just enough tolerance to absorb floating-point noise so two modules
// snapped flush edge-to-edge (see snapToNeighbor) don't read as "overlapping"
// — 2cm here used to let a real, visible sliver of interpenetration through
// as "not overlapping yet".
const OVERLAP_TOLERANCE_M = 0.003;

function boxesOverlap(a: ReturnType<typeof moduleBox>, b: ReturnType<typeof moduleBox>): boolean {
  return (
    a.minX < b.maxX - OVERLAP_TOLERANCE_M &&
    a.maxX > b.minX + OVERLAP_TOLERANCE_M &&
    a.minZ < b.maxZ - OVERLAP_TOLERANCE_M &&
    a.maxZ > b.minZ + OVERLAP_TOLERANCE_M
  );
}

// Vertical extent (meters) a module's cabinet body actually occupies. Wall
// band modules (see placementBand) start at their own mountHeight — not
// necessarily the catalog default of 144 — rather than the floor, which is
// what lets a "puente" cabinet or a corona_luz sit directly above a regular
// upper at the same x/z: their footprints overlap in plan view, but their
// bodies don't actually occupy the same space in the room.
function moduleYRange(mod: KitchenModule): { minY: number; maxY: number } {
  const isWallMounted = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
  const minY = isWallMounted ? (mod.options.mountHeight || 144) / 100 : 0;
  return { minY, maxY: minY + mod.dimensions.height / 100 };
}

function yRangesOverlap(a: { minY: number; maxY: number }, b: { minY: number; maxY: number }): boolean {
  return a.minY < b.maxY - OVERLAP_TOLERANCE_M && a.maxY > b.minY + OVERLAP_TOLERANCE_M;
}

// Returns the first same-band module a candidate placement would overlap, or
// null if it's clear. Position/rotation are explicit (not read from `mod`) so
// a drag/nudge target can be checked before committing it to the store. Two
// same-band modules only count as colliding if their footprints AND their
// vertical extents overlap — same-band alone isn't enough once mountHeight
// lets two wall-mounted modules (e.g. a base upper row and a bridge/"puente"
// row above it) share x/z at different heights.
function findOverlap(mod: KitchenModule, x: number, z: number, rotation: KitchenModule["rotation"], modules: KitchenModule[]): KitchenModule | null {
  const band = placementBand(mod);
  if (!band) return null;
  const candidate = moduleBox(mod, x, z, rotation);
  const candidateYRange = moduleYRange(mod);
  for (const other of modules) {
    if (other.id === mod.id || placementBand(other) !== band) continue;
    const otherBox = moduleBox(other, other.x / 100, other.z / 100, other.rotation);
    if (!boxesOverlap(candidate, otherBox)) continue;
    if (!yRangesOverlap(candidateYRange, moduleYRange(other))) continue;
    return other;
  }
  return null;
}

// A blocked move doesn't snap all the way back to where the drag/nudge
// started — it slides as far as it can along the straight line toward the
// target and stops right at the obstacle, the way sliding a real cabinet
// across the floor until it bumps into its neighbor would. Binary search
// along that line for the furthest still-clear point; 20 iterations is
// sub-millimeter precision, cheap enough to run on every drag release/nudge.
function slideToClosestFree(
  mod: KitchenModule, startX: number, startZ: number, targetX: number, targetZ: number,
  rotation: KitchenModule["rotation"], modules: KitchenModule[],
): { x: number; z: number } {
  if (!findOverlap(mod, targetX, targetZ, rotation, modules)) return { x: targetX, z: targetZ };
  if (findOverlap(mod, startX, startZ, rotation, modules)) return { x: startX, z: startZ };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const mx = startX + (targetX - startX) * mid;
    const mz = startZ + (targetZ - startZ) * mid;
    if (findOverlap(mod, mx, mz, rotation, modules)) hi = mid; else lo = mid;
  }
  return { x: startX + (targetX - startX) * lo, z: startZ + (targetZ - startZ) * lo };
}

// Keeps a module's actual footprint (accounting for its rotation and, for
// blind-corner types, the extra depth-wide extension) fully inside the
// room's walls — shared by both drag (handleDragStart) and the toolbar/
// keyboard nudge (nudgeSelected) so neither can push a module through a
// wall. Walls are centered ON the x=0/roomWidthM/z=0/roomDepthM boundary
// lines (see RoomBoundary), so their room-facing surface sits half a
// thickness inside those lines — clamping straight to the lines would let a
// module's back/side sink half a wall thickness into the wall instead of
// landing flush against its inner face.
function clampModuleToRoom(mod: KitchenModule, x: number, z: number, roomWidthM: number, roomDepthM: number): { x: number; z: number } {
  const footprintWidth = blindCornerFootprintWidth(mod);
  const isRotated = mod.rotation === 90 || mod.rotation === 270;
  const halfW = (isRotated ? mod.dimensions.depth : footprintWidth) / 200;
  const halfD = (isRotated ? footprintWidth : mod.dimensions.depth) / 200;
  const wallInset = WALL_THICKNESS_M / 2;
  const minX = Math.min(halfW + wallInset, roomWidthM / 2);
  const maxX = Math.max(minX, roomWidthM - halfW - wallInset);
  const minZ = Math.min(halfD + wallInset, roomDepthM / 2);
  const maxZ = Math.max(minZ, roomDepthM - halfD - wallInset);
  return { x: Math.min(Math.max(x, minX), maxX), z: Math.min(Math.max(z, minZ), maxZ) };
}

interface SideEdgeSeg {
  axis: "x" | "z"; // which world coordinate is constant along this edge
  at: number;      // that constant coordinate
  min: number;     // range of the other coordinate
  max: number;
}

function rotateLocal(lx: number, lz: number, rotationDeg: number): { x: number; z: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos };
}

// The module's own local left/right edge (its width-axis sides — the ones
// leftSidePanel/rightSidePanel already control), converted to a world-space
// segment. Rotation is always a multiple of 90°, so the result is always
// axis-aligned (constant x, or constant z), never diagonal. Position is an
// explicit (meters) override rather than always mod.x/mod.z so the drag
// handler can evaluate a candidate position before it's committed.
function moduleSideEdgeAt(mod: KitchenModule, side: "left" | "right", px: number, pz: number): SideEdgeSeg {
  const { halfW, halfD } = moduleFootprint(mod);
  const lx = side === "left" ? -halfW : halfW;
  const c0 = rotateLocal(lx, -halfD, mod.rotation);
  const c1 = rotateLocal(lx, halfD, mod.rotation);
  const x0 = px + c0.x, z0 = pz + c0.z;
  const x1 = px + c1.x, z1 = pz + c1.z;
  if (Math.abs(x0 - x1) < 1e-4) {
    return { axis: "x", at: (x0 + x1) / 2, min: Math.min(z0, z1), max: Math.max(z0, z1) };
  }
  return { axis: "z", at: (z0 + z1) / 2, min: Math.min(x0, x1), max: Math.max(x0, x1) };
}

// A genuine side-by-side join has each module's own center on the OPPOSITE
// side of the shared edge line from the other module. Matching purely on
// "same axis, close, overlapping" isn't enough — e.g. rotation 0 and 180
// mirror which local side ends up on which world side, so a "left" edge can
// legitimately touch another module's "left" edge (not just "right"), and
// without this check that same test also happily "matches" two modules that
// are simply overlapping, snapping one on top of the other instead of
// beside it.
function edgeStraddledByBoth(edgeAt: number, aCenter: number, bCenter: number): boolean {
  return (aCenter - edgeAt) * (bCenter - edgeAt) < 0;
}

// Same category and height — close enough that snapping them flush reads as
// a deliberate run rather than jamming together two unrelated cabinets.
function cabinetsSnapCompatible(a: KitchenModule, b: KitchenModule): boolean {
  if (a.category !== b.category || !SNAP_ELIGIBLE_CATEGORIES.has(a.category)) return false;
  if (a.dimensions.height !== b.dimensions.height) return false;
  return true;
}

// Snapping a cabinet within a couple cm of a compatible neighbor by hand is
// impractical — once a candidate position brings one of the module's own
// left/right edges within SNAP_THRESHOLD_M of a compatible neighbor's edge
// (and they overlap enough to be a real join, not a corner nick), pull it
// the rest of the way to an exact, gapless touch and line up the
// perpendicular axis too, so the two carcasses land flush instead of merely
// close. Silently falls through to the unsnapped position when nothing
// qualifies (mismatched height, or just not close enough).
const SNAP_THRESHOLD_M = 0.12;

function snapToNeighbor(mod: KitchenModule, x: number, z: number, modules: KitchenModule[]): { x: number; z: number } {
  for (const other of modules) {
    if (other.id === mod.id || !cabinetsSnapCompatible(mod, other)) continue;
    for (const mySide of ["left", "right"] as const) {
      const myEdge = moduleSideEdgeAt(mod, mySide, x, z);
      for (const otherSide of ["left", "right"] as const) {
        const otherEdge = moduleSideEdgeAt(other, otherSide, other.x / 100, other.z / 100);
        if (myEdge.axis !== otherEdge.axis) continue;
        const gap = Math.abs(myEdge.at - otherEdge.at);
        if (gap > SNAP_THRESHOLD_M) continue;
        const overlap = Math.min(myEdge.max, otherEdge.max) - Math.max(myEdge.min, otherEdge.min);
        if (overlap < SNAP_MIN_OVERLAP_M) continue;
        const myCenter = myEdge.axis === "x" ? x : z;
        const otherCenter = myEdge.axis === "x" ? other.x / 100 : other.z / 100;
        if (!edgeStraddledByBoth(myEdge.at, myCenter, otherCenter)) continue;
        // Shift by exactly the remaining gap along the edge's own constant
        // axis (independent of rotation/side sign — the edge's offset from
        // the module's own x/z doesn't change as it translates), then align
        // the perpendicular coordinate to the neighbor's too — otherwise the
        // edges could touch at one end while fanned open at the other.
        if (myEdge.axis === "x") {
          return { x: x + (otherEdge.at - myEdge.at), z: other.z / 100 };
        }
        return { x: other.x / 100, z: z + (otherEdge.at - myEdge.at) };
      }
    }
  }
  return { x, z };
}

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
// True while any module is being actively hand-dragged — read by
// ModulePlacement below to skip its own smoothing for the module that's
// tracking the pointer live (adding lag there would make dragging feel
// sluggish) while still smoothing everything else (toolbar/keyboard nudges,
// undo). A single scene-wide flag is enough since only one module can be
// dragged at a time and nothing else moves mid-drag anyway.
const DragActiveContext = createContext(false);

function ModulePlacement({ mod, children, drag }: { mod: KitchenModule; children: ReactNode; drag?: DragHandleProps }) {
  const mountY = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas" ? (mod.options.mountHeight || 144) / 100 : 0;
  const dragActive = useContext(DragActiveContext);
  const groupRef = useRef<THREE.Group>(null);
  const target = [mod.x / 100, mountY, mod.z / 100] as const;
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (dragActive) {
      g.position.set(target[0], target[1], target[2]);
    } else {
      // Exponential ease toward the target — frame-rate independent, settles
      // in ~150-200ms. Used for toolbar/keyboard nudges and undo; a live
      // drag (above) always snaps straight to the pointer-driven position.
      const t = 1 - Math.exp(-delta * 18);
      g.position.set(
        THREE.MathUtils.lerp(g.position.x, target[0], t),
        THREE.MathUtils.lerp(g.position.y, target[1], t),
        THREE.MathUtils.lerp(g.position.z, target[2], t)
      );
    }
  });
  return (
    <group ref={groupRef} position={target} rotation={[0, THREE.MathUtils.degToRad(mod.rotation), 0]} {...drag}>
      {children}
    </group>
  );
}

// ─── Cabinet wrapper (lower / upper / tower) ────────────────────────────────────
// Reuses the exact same CabinetMesh as the constructor preview — same carcass, doors,
// drawers, hinges, handles and countertop material color.
function CabinetWrapper({ mod, wireframe, drag, onSelect }: {
  mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps; onSelect?: () => void;
}) {
  const w = mod.dimensions.width / 100;
  const d = mod.dimensions.depth / 100;
  return (
    <ModulePlacement mod={mod} drag={drag}>
      <CabinetMesh module={mod} wireframe={wireframe} onSelect={onSelect} />
      {/* Under-cabinet light strip (upper cabinets only) */}
      {(mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas") && mod.options.hasUnderLight && !wireframe && (
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
      {/* Frame panels (sides, top, bottom but hollow in front) — an empty
          opening, not a filled box, since the appliance that goes here is
          its own module (see NICHE_ACCESSORY_MATCH / "Colocar aquí"). */}
      <Panel position={[-w / 2 + 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[w / 2 - 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, h - 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
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

  if (mod.type === "especiero_aluminio") {
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    return (
      <ModulePlacement mod={mod}>
        <group position={[0, h / 2, 0]}>
          <Panel position={[0, h / 2 - 0.01, -d / 2 + 0.01]} size={[w, 0.02, 0.02]} color="#b8bcbe" metalness={0.8} roughness={0.25} wireframe={wireframe} />
          {[0.3, -0.1].map((y, i) => (
            <Panel key={i} position={[0, y * h, 0]} size={[w, 0.012, d]} color="#c9cdd1" metalness={0.75} roughness={0.3} wireframe={wireframe} />
          ))}
        </group>
      </ModulePlacement>
    );
  }

  return null; // Other accessories (herrajes, organizadores, etc.) are not 3D rendered — pull-outs (canasta/basurero/soporte garrafón) are nested behind a door instead, see DoorPanel in ModulePreview3D.tsx
}

// Categories whose bodies can be grabbed and dragged around the room floor.
// Structural accessories (zócalos, trim panels) stay put — see
// DRAGGABLE_ACCESSORY_TYPES for the freestanding ones that are the exception.
const DRAGGABLE_CATEGORIES: KitchenModule["category"][] = ["lower", "upper", "tower", "corner", "countertop", "appliance"];

function isDraggableModule(mod: KitchenModule): boolean {
  if (mod.category === "accessory") return DRAGGABLE_ACCESSORY_TYPES.has(mod.type);
  return DRAGGABLE_CATEGORIES.includes(mod.category);
}

// A module already facing a wall keeps that facing as long as it's still
// roughly as close to it as to any other wall — otherwise sliding one flush
// along, say, the south wall toward a corner would flip it to face the west
// wall the moment that corner's other wall edges out slightly closer, even
// though the drag was only ever "along the south wall". Only a drag that
// commits clearly closer to a different wall (by more than this margin)
// re-orients it.
const WALL_ROTATION_STICKY_MARGIN_M = 0.35;

// Rotation that turns a module's back (its local -Z side, where the carcass'
// back panel sits) toward whichever of the room's four walls is closest to
// (x, z) — dragging a module near a wall snaps its facing automatically,
// the way it would end up placed by hand in a real kitchen. `currentRotation`
// makes that sticky near corners — see WALL_ROTATION_STICKY_MARGIN_M.
function nearestWallRotation(
  x: number, z: number, roomWidthM: number, roomDepthM: number, currentRotation: KitchenModule["rotation"],
): KitchenModule["rotation"] {
  const distanceByRotation: Record<KitchenModule["rotation"], number> = {
    0: z,                  // north wall, z = 0
    180: roomDepthM - z,   // south wall, z = roomDepthM
    90: x,                 // west wall, x = 0
    270: roomWidthM - x,   // east wall, x = roomWidthM
  };
  const [bestRotation, bestDistance] = (Object.entries(distanceByRotation) as [`${KitchenModule["rotation"]}`, number][])
    .map(([r, d]) => [Number(r) as KitchenModule["rotation"], d] as const)
    .sort((a, b) => a[1] - b[1])[0];
  const currentDistance = distanceByRotation[currentRotation];
  if (currentDistance <= bestDistance + WALL_ROTATION_STICKY_MARGIN_M) return currentRotation;
  return bestRotation;
}

// ─── Module renderer router ───────────────────────────────────────────────────
function ModuleMesh({ mod, wireframe, drag, onSelect }: {
  mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps; onSelect?: () => void;
}) {
  switch (mod.category) {
    case "lower":
    case "upper":
    case "tower":
    case "corner":     return <CabinetWrapper mod={mod} wireframe={wireframe} drag={drag} onSelect={onSelect} />;
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
  const labelY = moduleTopY(mod) + 0.16;
  return (
    <Html position={[mod.x / 100, labelY, mod.z / 100]} center distanceFactor={6} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-full border border-ivory/25 bg-black/80 px-2.5 py-1 text-xs font-semibold text-ivory shadow-[0_2px_10px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        {mod.label}
      </span>
    </Html>
  );
}

// ─── Dimensions badge ──────────────────────────────────────────────────────────
// Toggled independently from the name label (can be shown alone, or stacked
// just under it) so every module's width is readable at a glance across the
// whole room at once — the one number that actually matters for lining up a
// run of cabinets against a wall — without opening each one's inspector.
function ModuleDimensionsLabel({ mod }: { mod: KitchenModule }) {
  const labelY = moduleTopY(mod) + 0.02;
  return (
    <Html position={[mod.x / 100, labelY, mod.z / 100]} center distanceFactor={6} zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-full border border-sage/40 bg-black/80 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-sage shadow-[0_2px_10px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        {mod.dimensions.width} cm
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
        className="flex h-8 w-8 items-center justify-center rounded-full border border-ivory/20 bg-brass text-ink shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95"
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
  if (mod.category === "upper" || mod.type === "campana_extractora" || mod.type === "gabinete_superior_esquinero_puertas") return (mod.options.mountHeight || 144) / 100;
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
  id: string;
  type: "window" | "door";
  offset: number; // meters, from the wall's start corner
  width: number;
  height: number;
  sillHeight: number;
}

// ─── "Sims" wall: tall when it's on the far side from the camera, low when it
// would otherwise block the view (i.e. the camera is looking over/through it).
// A single solid slab — doors and windows are no longer holes cut into it,
// just flat, thicknessless rectangles (like a module) sitting on its inner
// face, so they ride along in the same animated group and drop/rise with the
// wall instead of being left floating in place.
function SimsWall({ center, normal, length, thickness, wallHeight, openings, controlsRef, onOpeningMove }: {
  center: [number, number]; // room-space (x, z) of the wall's midpoint
  normal: [number, number]; // outward-facing unit normal (x, z)
  length: number;
  thickness: number;
  wallHeight: number; // meters — the room's ceiling height
  openings: WallOpeningM[];
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  onOpeningMove?: (id: string, offsetCm: number) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentH = useRef(0.15);
  const tallH = wallHeight;
  const lowH = 0.15;
  // Live position while a marker is being dragged — overrides that opening's
  // offset for rendering only; the store isn't touched until pointer-up (same
  // local-preview pattern module dragging uses).
  const [dragPreview, setDragPreview] = useState<{ id: string; offset: number } | null>(null);
  const dragPlane = useRef(new THREE.Plane()).current;

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
  const size: [number, number, number] = isNorthSouth ? [length, tallH, thickness] : [thickness, tallH, length];
  // Markers sit just proud of the wall's inner face so they never z-fight with it.
  const proud = thickness / 2 + 0.004;
  const markerRotationY = isNorthSouth ? 0 : Math.PI / 2;

  // Raycasts the pointer against a vertical plane running along the wall
  // (instead of the floor plane modules use) — the hit's world x (north/south
  // walls) or z (east/west walls) is directly the "along the wall" coordinate.
  const getWallHit = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(dragPlane, point) ? point : null;
  };

  const handleOpeningDragStart = (o: WallOpeningM, e: ThreeEvent<PointerEvent>) => {
    if (!onOpeningMove) return;
    dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(normal[0], 0, normal[1]),
      new THREE.Vector3(center[0], 0, center[1])
    );
    const pointerId = e.nativeEvent.pointerId;
    const halfWidth = o.width / 2;
    const offsetFromHit = (hit: THREE.Vector3) => {
      const along = isNorthSouth ? hit.x : hit.z;
      const wallOrigin = isNorthSouth ? center[0] : center[1];
      const raw = along - wallOrigin + length / 2;
      return length <= o.width ? length / 2 : Math.min(Math.max(raw, halfWidth), length - halfWidth);
    };

    const handleMove = (ev: PointerEvent) => {
      const hit = getWallHit(ev.clientX, ev.clientY);
      if (hit) setDragPreview({ id: o.id, offset: offsetFromHit(hit) });
    };
    const handleUp = (ev: PointerEvent) => {
      const hit = getWallHit(ev.clientX, ev.clientY);
      if (hit) onOpeningMove(o.id, offsetFromHit(hit) * 100);
      setDragPreview(null);
      if (controlsRef?.current) controlsRef.current.enabled = true;
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    if (controlsRef?.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* pointer already captured */ }
    setDragPreview({ id: o.id, offset: o.offset });
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <group ref={groupRef}>
      <mesh position={[center[0], tallH / 2, center[1]]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#c9c7d4" />
      </mesh>
      {openings.map((o) => {
        const effectiveOffset = dragPreview?.id === o.id ? dragPreview.offset : o.offset;
        const [wx, wz] = toWorld(effectiveOffset - length / 2);
        const wy = o.sillHeight + o.height / 2;
        const px = wx - normal[0] * proud;
        const pz = wz - normal[1] * proud;
        return (
          <group key={o.id} position={[px, wy, pz]} rotation={[0, markerRotationY, 0]}>
            <mesh
              onPointerDown={onOpeningMove ? (e) => { e.stopPropagation(); handleOpeningDragStart(o, e); } : undefined}
              onPointerOver={onOpeningMove ? (e) => { e.stopPropagation(); setGrabCursor(true); } : undefined}
              onPointerOut={onOpeningMove ? () => setGrabCursor(false) : undefined}
            >
              <planeGeometry args={[o.width, o.height]} />
              {o.type === "window" ? (
                <meshStandardMaterial color="#dceefa" transparent opacity={0.55} emissive="#dbe9ff" emissiveIntensity={0.5} side={2} />
              ) : (
                <meshStandardMaterial color="#8b6142" side={2} />
              )}
            </mesh>
            {/* Soft daylight glow just inside each window, so it visibly lights the room */}
            {o.type === "window" && (
              <pointLight position={[0, 0, 0.4]} intensity={0.6} distance={5} decay={2} color="#fff3df" />
            )}
          </group>
        );
      })}
    </group>
  );
}

// ─── Room boundary (floor + 4 perimeter walls that drop down "Sims style"
// when they'd block the camera's view of the room) ──────────────────────────
function RoomBoundary({ roomWidthM, roomDepthM, ceilingHeightM, openings, controlsRef, onOpeningMove, hiddenIds, isolatedId }: {
  roomWidthM: number; roomDepthM: number; ceilingHeightM: number; openings: WallOpening[];
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  onOpeningMove?: (id: string, offsetCm: number) => void;
  hiddenIds?: Set<string>; isolatedId?: string | null;
}) {
  const t = WALL_THICKNESS_M;
  const centerX = roomWidthM / 2;
  const centerZ = roomDepthM / 2;
  const visibleOpenings = openings.filter((o) => (isolatedId ? o.id === isolatedId : !hiddenIds?.has(o.id)));
  const forWall = (wall: WallSide): WallOpeningM[] =>
    visibleOpenings.filter((o) => o.wall === wall).map((o) => ({
      id: o.id, type: o.type, offset: o.offset / 100, width: o.width / 100, height: o.height / 100, sillHeight: o.sillHeight / 100,
    }));
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[roomWidthM / 2, -0.003, roomDepthM / 2]} receiveShadow>
        <planeGeometry args={[roomWidthM, roomDepthM]} />
        <meshStandardMaterial color="#c8c2b6" />
      </mesh>
      <Grid position={[roomWidthM / 2, -0.001, roomDepthM / 2]} args={[roomWidthM, roomDepthM]} cellColor="#9a9488" sectionColor="#7a7468" fadeDistance={30} fadeStrength={1.5} />
      {/* North wall (z=0) */}
      <SimsWall center={[centerX, 0]} normal={[0, -1]} length={roomWidthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("north")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} />
      {/* South wall */}
      <SimsWall center={[centerX, roomDepthM]} normal={[0, 1]} length={roomWidthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("south")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} />
      {/* West wall */}
      <SimsWall center={[0, centerZ]} normal={[-1, 0]} length={roomDepthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("west")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} />
      {/* East wall */}
      <SimsWall center={[roomWidthM, centerZ]} normal={[1, 0]} length={roomDepthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("east")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} />
    </>
  );
}

// ─── Nudge reference frame ──────────────────────────────────────────────────
// A floor-plane (y=0) right/forward pair, always unit length — nudging always
// follows the module's own front/right, rotated by its placed `rotation`, so
// an arrow means the same thing regardless of camera angle. Reuses the same
// rotateLocal used for merge/snap footprint math, so both agree on what "the
// module's own front" means.
interface FloorAxes { right: { x: number; z: number }; forward: { x: number; z: number } }


function localAxesXZ(mod: KitchenModule): FloorAxes {
  return { right: rotateLocal(1, 0, mod.rotation), forward: rotateLocal(0, 1, mod.rotation) };
}

// ─── Drag-to-reposition controller ─────────────────────────────────────────────
// Lives inside the Canvas (needs useThree for camera/gl/raycaster). Raycasts the
// pointer against an infinite floor plane — the hit point's world x/z *is* the
// room-space position (the room has no wrapping rotation/offset), clamped to the
// room's bounds accounting for the module's rotated footprint.
function AssemblyContent({
  modules, roomWidthM, roomDepthM, wireframe, showLabels, showDimensions, controlsRef, onModuleMove, onModuleActivate, onModuleNudge, hiddenIds, isolatedId, hoveredId,
  selectedId, onSelectModule, keyboardStepCm, registerNudgeHandler,
}: {
  modules: KitchenModule[]; roomWidthM: number; roomDepthM: number; wireframe: boolean; showLabels: boolean; showDimensions: boolean;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"]) => void;
  onModuleActivate?: (id: string | null) => void;
  onModuleNudge?: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  hiddenIds: Set<string>; isolatedId: string | null; hoveredId: string | null;
  selectedId: string | null; onSelectModule: (id: string | null) => void;
  keyboardStepCm: number;
  registerNudgeHandler: (fn: ((direction: NudgeDirection, stepCm: number) => void) | null) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)).current;

  // Nudges the selected module by NUDGE_STEP_CM (well, by whatever step the
  // toolbar has active — see the store's nudgeModule) along the module's own
  // rotated axes — always relative to the module itself (not the camera), so
  // an arrow means the same thing regardless of where you're looking from.
  const nudgeSelected = (direction: NudgeDirection, stepCm: number) => {
    const mod = modules.find((m) => m.id === selectedId);
    if (!mod || !onModuleNudge) return;
    if (direction === "up" || direction === "down") {
      onModuleNudge(mod.id, 0, 0, direction === "up" ? stepCm : -stepCm);
      return;
    }
    const { right, forward } = localAxesXZ(mod);
    const axis = direction === "left" || direction === "right" ? right : forward;
    const sign = direction === "right" || direction === "forward" ? 1 : -1;
    // Same wall-aware clamp the drag handler uses (clampModuleToRoom) — a
    // nudge that would push the module's footprint through a wall gets
    // capped at the wall's inner face instead, same as dragging into one.
    const rawX = mod.x / 100 + (axis.x * sign * stepCm) / 100;
    const rawZ = mod.z / 100 + (axis.z * sign * stepCm) / 100;
    const clamped = clampModuleToRoom(mod, rawX, rawZ, roomWidthM, roomDepthM);
    // Slides as far as the step allows instead of refusing the whole nudge —
    // see slideToClosestFree.
    const { x, z } = slideToClosestFree(mod, mod.x / 100, mod.z / 100, clamped.x, clamped.z, mod.rotation, modules);
    onModuleNudge(mod.id, x * 100 - mod.x, z * 100 - mod.z, 0);
  };
  const nudgeSelectedRef = useRef(nudgeSelected);
  nudgeSelectedRef.current = nudgeSelected;

  // Bridges the toolbar (plain DOM, outside the Canvas — see
  // KitchenAssemblyScene) to this closure. Re-registered whenever the
  // callback's own identity would meaningfully change; reading through a ref
  // means callers never hold a stale `modules`/`selectedId` snapshot.
  useEffect(() => {
    registerNudgeHandler((direction, stepCm) => nudgeSelectedRef.current(direction, stepCm));
    return () => registerNudgeHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerNudgeHandler]);

  // Arrow keys nudge the selection the same way the toolbar buttons do —
  // ignored while focus is in a text field, and while nothing is selected.
  useEffect(() => {
    const KEY_TO_DIRECTION: Record<string, NudgeDirection> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "forward", ArrowDown: "back",
      PageUp: "up", PageDown: "down",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      nudgeSelectedRef.current(direction, keyboardStepCm);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, keyboardStepCm]);

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

    const clamp = (x: number, z: number) => clampModuleToRoom(mod, x, z, roomWidthM, roomDepthM);

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const hit = getFloorHit(ev.clientX, ev.clientY);
      if (!hit) return;
      const clamped = clamp(state.startX + (hit.x - state.startPointerX), state.startZ + (hit.z - state.startPointerZ));
      // Pulls flush against a compatible neighbor once dragged close — see
      // snapToNeighbor. Re-clamped afterward since a snap target right by a
      // wall could otherwise push the module a hair past it.
      const snapped = snapToNeighbor(mod, clamped.x, clamped.z, modules);
      const { x, z } = clamp(snapped.x, snapped.z);
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
          // Mirrors handleMove's clamp → snap → clamp pipeline exactly — this
          // used to only clamp, so the live preview would visibly snap flush
          // against a neighbor but the committed position reverted to the
          // raw unsnapped drag on release.
          const clamped = clamp(state.startX + (hit.x - state.startPointerX), state.startZ + (hit.z - state.startPointerZ));
          const snapped = snapToNeighbor(mod, clamped.x, clamped.z, modules);
          const { x, z } = clamp(snapped.x, snapped.z);
          const rotation = nearestWallRotation(x, z, roomWidthM, roomDepthM, mod.rotation);
          const blocker = findOverlap(mod, x, z, rotation, modules);
          if (blocker) {
            // Doesn't snap all the way back to where the drag started —
            // slides as far toward the drop point as it can and stops right
            // at the obstacle, see slideToClosestFree.
            const landed = slideToClosestFree(mod, state.startX, state.startZ, x, z, rotation, modules);
            onModuleMove?.(state.id, landed.x * 100, landed.z * 100, rotation);
            toast(`Se detuvo junto a "${blocker.label}"`, { description: "No se pudo mover más sin empalmarse.", duration: 1800 });
          } else {
            onModuleMove?.(state.id, x * 100, z * 100, rotation);
          }
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
    <DragActiveContext.Provider value={dragPreview !== null}>
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
            {showDimensions && <ModuleDimensionsLabel mod={effective} />}
            {hoveredId === mod.id && <ModuleHighlight mod={effective} />}
            {selectedId === mod.id && onModuleActivate && (
              <ModuleGearButton mod={effective} onClick={() => onModuleActivate(mod.id)} />
            )}
          </group>
        );
      })}
    </DragActiveContext.Provider>
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
  onModuleActivate?: (id: string | null) => void;
  onModuleNudge?: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  // Deletes straight from the module list — the only reliable way to remove
  // a module whose type has no 3D geometry at all (e.g. "organizador de
  // especias" — some small accessories intentionally return null from
  // AccessoryMesh, see its fallback case), since there's nothing there to
  // click and select in Vista 3D in the first place.
  onModuleRemove?: (id: string) => void;
  onOpeningMove?: (id: string, offset: number) => void;
  onUndo?: () => void;
  undoCount?: number;
  // The public "share with client" viewer passes this and nothing else —
  // every editing prop above is already optional and simply omitted there,
  // so this is the only new capability flag needed: it hides the module
  // list (isolate/hide/delete controls), which has no editing callback of
  // its own to gate on.
  readOnly?: boolean;
}

export function KitchenAssemblyScene({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onOpeningMove, onUndo, undoCount = 0, readOnly = false,
}: KitchenAssemblySceneProps) {
  const [wireframe, setWireframe] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stepCm, setStepCm] = useState(5);
  // Toolbar buttons live outside the Canvas (fixed to the viewport, not the
  // module — see SelectionToolbar), but the screen-relative math needs the
  // live camera, which only exists inside it. This ref is the bridge:
  // AssemblyContent registers the actual handler once mounted; clicks call
  // through it instead of duplicating camera access out here.
  const nudgeHandlerRef = useRef<((direction: NudgeDirection, stepCm: number) => void) | null>(null);
  const registerNudgeHandler = useCallback((fn: ((direction: NudgeDirection, stepCm: number) => void) | null) => {
    nudgeHandlerRef.current = fn;
  }, []);
  // Starts collapsed to a small pill on every device — the full list
  // otherwise sits right where the module inspector panel slides in from
  // (see the wrapper's fixed bottom-left position below), so it stays out
  // of the way until the chevron is clicked open.
  const [listCollapsed, setListCollapsed] = useState(true);
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
    { key: "dimensions", icon: Ruler, label: showDimensions ? "Ocultar medidas" : "Mostrar medidas", active: showDimensions, onClick: () => setShowDimensions((v) => !v) },
  ];
  const selectedModule = modules.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="relative h-full overflow-hidden bg-surface">
      <Camera3DControls
        presets={presets} toggles={toggles}
        onZoomIn={() => zoom(0.8)} onZoomOut={() => zoom(1.25)}
        onUndo={() => onUndo?.()} undoCount={undoCount}
      />

      {/* Fixed to the viewport, not the module — see SelectionToolbar and
          ModulePlacement's DragActiveContext for why this replaced the old
          in-scene floating D-pad (it used to overlap the gear button and
          could land on top of the model depending on camera angle). */}
      {selectedModule && onModuleNudge && (
        <SelectionToolbar
          module={selectedModule}
          stepCm={stepCm}
          onStepChange={setStepCm}
          onNudge={(direction) => nudgeHandlerRef.current?.(direction, stepCm)}
        />
      )}

      {/* Module list — always bottom-left. Used to move to bottom-right on
          desktop, which is exactly where the module inspector/selector panel
          (right-anchored) slides in from and blocked it while configuring a
          module — pinned left on every breakpoint now instead. Not rendered
          at all in the read-only public viewer — there's no editing
          callback to gate isolate/hide/delete on in there. */}
      {!readOnly && (
      <div className={`absolute bottom-3 left-3 z-10 flex flex-col rounded-xl border border-ivory/8 bg-black/60 backdrop-blur-sm text-xs text-warmgray ${listCollapsed ? "" : "w-60"}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            onClick={() => setListCollapsed((v) => !v)}
            aria-label={listCollapsed ? "Mostrar lista de módulos" : "Minimizar lista de módulos"}
            title={listCollapsed ? "Mostrar módulos" : "Minimizar"}
            className="flex items-center gap-1.5 font-semibold text-ivory/80 text-[10px] uppercase tracking-wide hover:text-ivory"
          >
            {listCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Módulos ({modules.length + openings.length})
          </button>
          {!listCollapsed && (isolatedId || hiddenIds.size > 0) && (
            <button
              onClick={() => { setIsolatedId(null); setHiddenIds(new Set()); }}
              className="text-[10px] font-medium text-brass-soft hover:text-brass"
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
                    className={`flex items-center justify-between gap-1 rounded-lg px-1.5 py-1 transition-colors ${isIsolated ? "bg-brass/20" : ""}`}
                  >
                    <span
                      onMouseEnter={() => setHoveredId(mod.id)}
                      onMouseLeave={() => setHoveredId((cur) => (cur === mod.id ? null : cur))}
                      className={`truncate text-[11px] ${isHidden ? "text-warmgray/70 line-through" : "text-ivory/80"}`}
                      title={mod.label}
                    >
                      {CATEGORY_ICONS[mod.category]} {mod.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => toggleIsolate(mod.id)}
                        aria-label="Ver solo este"
                        title="Ver solo este"
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isIsolated ? "bg-brass text-ink" : "text-warmgray hover:bg-ivory/10 hover:text-ivory"}`}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={() => toggleHidden(mod.id)}
                        aria-label={isHidden ? "Mostrar" : "Ocultar"}
                        title={isHidden ? "Mostrar" : "Ocultar"}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isHidden ? "bg-terracotta/70 text-ivory" : "text-warmgray hover:bg-ivory/10 hover:text-ivory"}`}
                      >
                        <EyeOff size={12} />
                      </button>
                      {onModuleRemove && (
                        <button
                          onClick={() => {
                            if (selectedId === mod.id) setSelectedId(null);
                            onModuleRemove(mod.id);
                          }}
                          aria-label="Eliminar mueble"
                          title="Eliminar mueble"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-warmgray transition-colors hover:bg-terracotta/70 hover:text-ivory"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {openings.map((o) => {
                const isIsolated = isolatedId === o.id;
                const isHidden = hiddenIds.has(o.id);
                const label = o.type === "door" ? "Puerta" : "Ventana";
                const icon = o.type === "door" ? "🚪" : "🪟";
                return (
                  <div
                    key={o.id}
                    className={`flex items-center justify-between gap-1 rounded-lg px-1.5 py-1 transition-colors ${isIsolated ? "bg-brass/20" : ""}`}
                  >
                    <span
                      onMouseEnter={() => setHoveredId(o.id)}
                      onMouseLeave={() => setHoveredId((cur) => (cur === o.id ? null : cur))}
                      className={`truncate text-[11px] ${isHidden ? "text-warmgray/70 line-through" : "text-ivory/80"}`}
                      title={label}
                    >
                      {icon} {label}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => toggleIsolate(o.id)}
                        aria-label="Ver solo este"
                        title="Ver solo este"
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isIsolated ? "bg-brass text-ink" : "text-warmgray hover:bg-ivory/10 hover:text-ivory"}`}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={() => toggleHidden(o.id)}
                        aria-label={isHidden ? "Mostrar" : "Ocultar"}
                        title={isHidden ? "Mostrar" : "Ocultar"}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isHidden ? "bg-terracotta/70 text-ivory" : "text-warmgray hover:bg-ivory/10 hover:text-ivory"}`}
                      >
                        <EyeOff size={12} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-ivory/8 px-3 py-1.5 text-[10px] text-warmgray hidden lg:block">Arrastra un módulo para moverlo · pasa el mouse sobre su nombre para ubicarlo</p>
          </>
        )}
      </div>
      )}

      <Canvas
        key={instanceKey}
        shadows
        camera={{ position: cameraTarget, fov: 45 }}
        onCreated={handleCanvasCreated}
        onPointerMissed={() => { setSelectedId(null); onModuleActivate?.(null); }}
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

        {/* Invisible floor click-catcher — a click on a module's own surface
            (nearer the camera along that ray) always wins the raycast first,
            so this only fires for a genuine click on open floor. Needed
            because onPointerMissed alone never fires there: the floor/walls
            are real geometry the ray does hit, so it isn't a "miss". */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[centerX, -0.002, centerZ]}
          onClick={(e) => { e.stopPropagation(); setSelectedId(null); onModuleActivate?.(null); }}
        >
          <planeGeometry args={[roomWidthM, roomDepthM]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        <RoomBoundary
          roomWidthM={roomWidthM} roomDepthM={roomDepthM} ceilingHeightM={ceilingHeight / 100} openings={openings}
          controlsRef={controlsRef} onOpeningMove={onOpeningMove}
          hiddenIds={hiddenIds} isolatedId={isolatedId}
        />

        <AssemblyContent
          modules={modules} roomWidthM={roomWidthM} roomDepthM={roomDepthM}
          wireframe={wireframe} showLabels={showLabels} showDimensions={showDimensions} controlsRef={controlsRef} onModuleMove={onModuleMove}
          onModuleActivate={onModuleActivate} onModuleNudge={onModuleNudge}
          hiddenIds={hiddenIds} isolatedId={isolatedId} hoveredId={hoveredId}
          selectedId={selectedId} onSelectModule={setSelectedId}
          keyboardStepCm={stepCm} registerNudgeHandler={registerNudgeHandler}
        />
      </Canvas>
    </div>
  );
}
