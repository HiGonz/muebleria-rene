"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls } from "@react-three/drei";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from "react";
import * as ReactDOM from "react-dom/client";
import * as THREE from "three";
import { Home, Eye, EyeOff, Move, MoveHorizontal, ArrowUp, Tag, Ruler, ChevronDown, ChevronUp, Settings2, Trash2, Lock, Unlock, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { CabinetMesh, CountertopDropEdge, mapKey, shiftColor, ModuleMoveArmedContext } from "./ModulePreview3D";
import { Camera3DControls, type CameraAction } from "./Camera3DControls";
import { SelectionToolbar, type NudgeDirection } from "./SelectionToolbar";
import { getWoodTexture, getWoodRoughness } from "./woodTextures";
import { useContextRecovery } from "./useContextRecovery";
import { CATEGORY_ICONS, WALL_GAP_TOLERANCE_M, cornerPerpendicularRotation, cornerExtensionWorldCenterCm } from "@/services/kitchenData";
import type { KitchenModule, WallOpening, WallSide } from "@/types/kitchen";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const SHOW_DIMENSIONS_KEY = "kitchen-show-dimensions";

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
  startMountHeightCm: number;
  // Wall-mounted modules only — see WallDragBasis and handleDragStart.
  wallDragBasis: WallDragBasis | null;
}

// A wall-mounted module can only ever move two ways: along its own wall's
// line, or up/down that wall — it's always kept flush, never free in the
// room. This basis represents exactly that 2-DOF freedom as a fixed linear
// map from screen pixels to world units, measured once at drag start by
// projecting the module's own position and points 1 world meter along each
// of those two directions into screen space. handleMove/handleUp then just
// solve a 2×2 system to decompose the pointer's screen movement into
// (meters along the wall, meters of height) — no raycasting against any
// plane at all, which is what let a shallow camera angle turn a small mouse
// movement into the module rocketing across the room: an almost-edge-on
// plane makes a raycast's hit point (and everything downstream computed
// from it, like which wall wallFlushXZ snaps back to) wildly unstable, in
// a way this fixed-basis approach structurally can't be.
interface WallDragBasis {
  tangent: [number, number]; // world XZ unit direction of "along-wall", fixed for the whole drag
  alongWallPx: { x: number; y: number }; // screen px per +1m along `tangent`
  heightPx: { x: number; y: number };    // screen px per +1m up
  det: number; // 2D cross product of the two basis vectors — near 0 is the (unreachable in practice) degenerate case
}

// Solves the 2×2 system screenDelta = a·alongWallPx + b·heightPx for (a, b)
// via Cramer's rule, returning the pointer's total screen movement since
// drag start as (meters along the wall, cm of height). Only null in the
// fully-degenerate case basis.det≈0, which handleDragStart already guards
// against before ever setting a non-null WallDragBasis.
function resolveWallDrag(basis: WallDragBasis, startClientX: number, startClientY: number, clientX: number, clientY: number): { alongWallM: number; heightCm: number } | null {
  if (Math.abs(basis.det) < 1e-6) return null;
  const dx = clientX - startClientX;
  const dy = clientY - startClientY;
  const alongWallM = (dx * basis.heightPx.y - basis.heightPx.x * dy) / basis.det;
  const heightM = (basis.alongWallPx.x * dy - dx * basis.alongWallPx.y) / basis.det;
  return { alongWallM, heightCm: heightM * 100 };
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

// How short a wall drops to in its "Sims" collapsed state (see SimsWall)
// when it's the near wall blocking the camera's view into the room — shared
// with ModulePlacement's wallShrink so a wall-mounted module (e.g. a
// decorative door) squashes in exact sync with the wall it's built into,
// instead of standing full-height once the wall around it has sunk away.
const SIMS_WALL_LOW_H_M = 0.15;

// Outward-facing normal for each of the 4 axis-aligned wall-flush rotations
// (matches wallFlushXZ's convention: 0=north/z=0, 180=south, 90=west/x=0,
// 270=east) — used by ModulePlacement's wallShrink to figure out which side
// of its own wall the camera is currently on.
const ROTATION_NORMALS: Record<number, [number, number]> = { 0: [0, -1], 90: [-1, 0], 180: [0, 1], 270: [1, 0] };

// Dimension-line/label colors — deliberately different between a module's
// own width measurement (ModuleDimensionsLabel) and a wall's length/height
// measurement (SimsWall), so the two don't read as the same kind of
// annotation at a glance. Wall lines are also drawn thicker (see SimsWall's
// own geometry sizes) for the same reason.
const MODULE_DIM_COLOR = "#a8d8b9";
const WALL_DIM_COLOR = "#e8b45a";

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
// The triangular esquineros are true triangles instead (esquinero_triangular/
// esquinero_triangular_puerta), whose plain width×depth bounding box already
// matches their footprint, no widening needed.
const BLIND_CORNER_TYPES = new Set<KitchenModule["type"]>(["gabinete_bajo_esquinero_puertas", "gabinete_pared_esquinero_puertas"]);
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
// Freestanding appliances (category "accessory") that actually stand on the
// floor — refrigerador, estufa, lavavajillas — unlike tarja/parrilla/
// microondas/campana_extractora, which are countertop/wall overlays meant
// to sit on top of or above whatever's underneath them (see baseY: those
// four render above y=0, these three at y=0 like any other floor module).
// Without this they had no placementBand at all, so nothing stopped one
// from being dragged straight through a cabinet or another appliance.
const FLOOR_STANDING_ACCESSORY_TYPES = new Set<KitchenModule["type"]>(["estufa", "refrigerador", "lavavajillas"]);

function placementBand(mod: KitchenModule): "floor" | "wall" | null {
  const isWallMounted = mod.category === "upper" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas";
  if (isWallMounted) return "wall";
  if (mod.category === "lower" || mod.category === "tower" || mod.category === "corner" || mod.category === "appliance") return "floor";
  if (mod.category === "accessory" && FLOOR_STANDING_ACCESSORY_TYPES.has(mod.type)) return "floor";
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
  const isWallMounted = mod.category === "upper" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas";
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
// wall. Walls now render entirely OUTSIDE the x=0/roomWidthM/z=0/roomDepthM
// boundary lines (see RoomBoundary/SimsWall) — their inner face sits
// exactly ON those lines — so clamping straight to the lines lands a
// module's back/side flush against that inner face with no inset needed.
// (Previously walls straddled the boundary, half inside — the inset that
// compensated for that quietly ate a full WALL_THICKNESS_M out of the
// room's nominal width/depth on top of the two end walls' own thickness,
// e.g. a "400cm" room only had ~395cm of actually placeable run. The room's
// stated dimensions are now the real interior clear span, matching how
// they're measured/quoted in practice.)
function clampModuleToRoom(mod: KitchenModule, x: number, z: number, roomWidthM: number, roomDepthM: number): { x: number; z: number } {
  const footprintWidth = blindCornerFootprintWidth(mod);
  const isRotated = mod.rotation === 90 || mod.rotation === 270;
  const halfW = (isRotated ? mod.dimensions.depth : footprintWidth) / 200;
  const halfD = (isRotated ? footprintWidth : mod.dimensions.depth) / 200;
  const minX = Math.min(halfW, roomWidthM / 2);
  const maxX = Math.max(minX, roomWidthM - halfW);
  const minZ = Math.min(halfD, roomDepthM / 2);
  const maxZ = Math.max(minZ, roomDepthM - halfD);
  return { x: Math.min(Math.max(x, minX), maxX), z: Math.min(Math.max(z, minZ), maxZ) };
}

// Aéreos (wall cabinets) — never free-floating: whichever wall `rotation`
// faces, the perpendicular axis is pinned exactly to that wall's flush
// position (same figure clampModuleToRoom already computes as its min/max
// for that axis), and only the along-wall axis is left free, clamped to
// the room-bounds range for that axis. Dragging one is then a single
// degree of freedom — slide along the wall — instead of two, which is the
// whole point: it can't be pulled away from the wall mid-drag.
function isWallMounted(mod: KitchenModule): boolean {
  return (
    mod.category === "upper" ||
    mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas" ||
    mod.type === "puerta_decorativa" || mod.type === "ventana_decorativa"
  );
}
function wallFlushXZ(
  mod: KitchenModule, x: number, z: number, roomWidthM: number, roomDepthM: number, rotation: KitchenModule["rotation"],
): { x: number; z: number } {
  const footprintWidth = blindCornerFootprintWidth(mod);
  const isRotated = rotation === 90 || rotation === 270;
  const halfW = (isRotated ? mod.dimensions.depth : footprintWidth) / 200;
  const halfD = (isRotated ? footprintWidth : mod.dimensions.depth) / 200;
  const minX = Math.min(halfW, roomWidthM / 2);
  const maxX = Math.max(minX, roomWidthM - halfW);
  const minZ = Math.min(halfD, roomDepthM / 2);
  const maxZ = Math.max(minZ, roomDepthM - halfD);
  if (rotation === 0) return { x: Math.min(Math.max(x, minX), maxX), z: minZ };   // north wall (z=0)
  if (rotation === 180) return { x: Math.min(Math.max(x, minX), maxX), z: maxZ }; // south wall
  if (rotation === 90) return { x: minX, z: Math.min(Math.max(z, minZ), maxZ) };  // west wall (x=0)
  return { x: maxX, z: Math.min(Math.max(z, minZ), maxZ) };                       // 270, east wall
}

// Corona de luz (and anything else that picks up options.wallOffset): unlike
// a real cabinet, it doesn't have to render flush against the wall — it's a
// visor mounted on top of and forward of the upper cabinets below. Its
// stored x/z stays the normal flush-to-wall anchor (dragging/snapping keep
// working exactly like any other aéreo); this returns a shifted copy for
// rendering only, pushed forward along whichever world direction its
// rotation faces (same front-facing convention wallFlushXZ/nearestWallRotation
// use). Applied once, before every overlay that reads mod.x/z (mesh, label,
// dimension line, highlight, gear button), so they all move together
// instead of the highlight box staying pinned to the wall while the crown
// itself renders forward of it.
function applyWallOffset(mod: KitchenModule): KitchenModule {
  const offset = mod.options.wallOffset || 0;
  if (!offset) return mod;
  const dx = mod.rotation === 90 ? offset : mod.rotation === 270 ? -offset : 0;
  const dz = mod.rotation === 0 ? offset : mod.rotation === 180 ? -offset : 0;
  return { ...mod, x: mod.x + dx, z: mod.z + dz };
}

// Stacking an aéreo directly over a floor cabinet on the same wall (the
// classic alacena-over-tarja case) by hand means landing its along-wall
// coordinate exactly on the other one's — fiddly to eyeball. Once dragged
// within SNAP_THRESHOLD_M of matching centers, on the same wall, and in
// the opposite band (floor vs wall-mounted) from whatever's being dragged,
// pulls the along-wall coordinate to match exactly. Independent of
// snapToNeighbor, which only joins same-band cabinets edge-to-edge — this
// centers one over/under the other instead, regardless of width.
function snapAlignAcrossBands(
  mod: KitchenModule, x: number, z: number, rotation: KitchenModule["rotation"], modules: KitchenModule[],
): { x: number; z: number } {
  const alongAxis = rotation === 0 || rotation === 180 ? "x" : "z";
  const myCoord = alongAxis === "x" ? x : z;
  const modIsWall = isWallMounted(mod);
  for (const other of modules) {
    if (other.id === mod.id || other.rotation !== rotation || isWallMounted(other) === modIsWall) continue;
    const otherCoord = alongAxis === "x" ? other.x / 100 : other.z / 100;
    if (Math.abs(myCoord - otherCoord) <= SNAP_THRESHOLD_M) {
      return alongAxis === "x" ? { x: otherCoord, z } : { x, z: otherCoord };
    }
  }
  return { x, z };
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
// a deliberate run rather than jamming together two unrelated cabinets. A
// corner cabinet is tagged its own "corner" category (for door/hinge
// defaults etc.), but for placement purposes it's really just a specialized
// lower or upper cabinet — floor esquineros belong in a lower run, wall
// esquineros in an upper one — so it's normalized to whichever of those it
// actually sits alongside before comparing. Without this, an esquinero never
// snaps flush against the straight cabinet next to it, leaving a small
// manual-placement gap that then reads as a real seam to the countertop
// run-merging logic (see WALL_GAP_TOLERANCE_M in kitchenData.ts).
function cabinetsSnapCompatible(a: KitchenModule, b: KitchenModule): boolean {
  if (a.dimensions.height !== b.dimensions.height) return false;
  const bandOf = (m: KitchenModule) => (m.category === "corner" ? (isWallMounted(m) ? "upper" : "lower") : m.category);
  const bandA = bandOf(a);
  const bandB = bandOf(b);
  if (bandA !== bandB || !SNAP_ELIGIBLE_CATEGORIES.has(bandA)) return false;
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
  rotation: KitchenModule["rotation"];
  // Only set while dragging a wall-mounted module — see handleDragStart's
  // vertical wall-plane raycast.
  mountHeightCm?: number;
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

// Id of the module currently armed via its own "Mover" button (see moveMode
// in AssemblyContent), or null — read by ModulePlacement below to re-provide
// a plain per-module boolean (ModuleMoveArmedContext, from ModulePreview3D.tsx)
// that door/drawer fronts consume so a click-drag starting on a door still
// moves the module once armed, instead of only working from a non-door panel.
const MoveArmedIdContext = createContext<string | null>(null);

// Room's ceiling height (meters) — only consumed by ModulePlacement's
// wallShrink to know how tall "full size" is when computing the squashed
// ratio; defaults to a sane fallback so nothing breaks if ever read outside
// the provider set up in KitchenAssemblyScene's Canvas.
const CeilingHeightContext = createContext(2.4);

function ModulePlacement({ mod, children, drag, wallShrink }: {
  mod: KitchenModule; children: ReactNode; drag?: DragHandleProps;
  // True for modules that are visually "part of the wall" (currently just
  // puerta_decorativa) rather than freestanding furniture bolted to it — so
  // they squash down together with their own wall's Sims-style collapse
  // instead of standing full-height once the wall around them has sunk
  // away. See SimsWall's own useFrame for the exact behavior this mirrors.
  wallShrink?: boolean;
}) {
  const mountY = mod.category === "upper" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas" || mod.type === "ventana_decorativa" ? (mod.options.mountHeight || 144) / 100 : 0;
  const dragActive = useContext(DragActiveContext);
  const moveArmedId = useContext(MoveArmedIdContext);
  const ceilingHeightM = useContext(CeilingHeightContext);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentScaleY = useRef(1);
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
    if (wallShrink) {
      // Same camera-side dot-product test SimsWall runs against its own
      // wall's plane — this module's (x, z) already sits on that same
      // plane (it's wall-flush by construction), so testing against it
      // directly gives the identical tall/low verdict without needing to
      // know which literal wall it's on.
      const normal = ROTATION_NORMALS[mod.rotation] ?? [0, -1];
      const dot = (camera.position.x - target[0]) * normal[0] + (camera.position.z - target[2]) * normal[1];
      const targetRatio = (dot > 0 ? SIMS_WALL_LOW_H_M : ceilingHeightM) / ceilingHeightM;
      currentScaleY.current += (targetRatio - currentScaleY.current) * 0.12;
      g.scale.y = currentScaleY.current;
    }
  });
  return (
    <group ref={groupRef} position={target} rotation={[0, THREE.MathUtils.degToRad(mod.rotation), 0]} {...drag}>
      <ModuleMoveArmedContext.Provider value={moveArmedId === mod.id}>
        {children}
      </ModuleMoveArmedContext.Provider>
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
      {(mod.category === "upper" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas") && mod.options.hasUnderLight && !wireframe && (
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

  const isIsland = mod.type === "peninsula" || mod.type === "barra_desayunadora";
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
const DRAGGABLE_ACCESSORY_TYPES = new Set(["tarja", "estufa", "parrilla", "campana_extractora", "campana_extractora_compacta", "refrigerador", "microondas", "lavavajillas"]);

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
  if (mod.type === "campana_extractora_compacta") {
    // Slim, minimalist alternative to the chimney hood above — one flat slab
    // (no duct piece, no chimney), sized off its own depth so it tucks close
    // against a gabinete superior instead of protruding into the room.
    const h = mod.dimensions.height / 100;
    const d = mod.dimensions.depth / 100;
    const mount = (mod.options.mountHeight || 150) / 100;
    const bodyColor = "#1c1c1c";
    return (
      <ModulePlacement mod={mod} drag={drag}>
        <group position={[0, mount, 0]}>
          <Panel position={[0, h / 2, 0]} size={[w, h, d]} color={bodyColor} roughness={0.35} metalness={0.5} wireframe={wireframe} />
          {!wireframe && (
            <mesh position={[0, 0.004, d / 2 - 0.015]}>
              <boxGeometry args={[w * 0.85, 0.006, 0.012]} />
              <meshStandardMaterial color="#e8e8e8" emissive="#fff6df" emissiveIntensity={0.5} />
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

// ─── Puertas y ventanas decorativas ────────────────────────────────────────
// Purely the shape of a door/window, placed as an ordinary module — not a
// real cut wall opening (see OpeningModuleType in types/kitchen.ts). Static,
// no hinge/animation of their own (this isn't a functional cabinet door),
// just a decorative piece a designer can drop anywhere for presentation.
function DecorativeDoorMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const color = mod.options.color || "#8b6142";
  const frameColor = shiftColor(color, 0.15);
  const panelColor = shiftColor(color, -0.06);
  const panelMargin = 0.06;
  const panelGapY = 0.05;
  const panelH = (h - panelGapY * 3) / 2;

  return (
    <ModulePlacement mod={mod} drag={drag} wallShrink>
      <group position={[0, h / 2, 0]}>
        {/* Slab */}
        <Panel position={[0, 0, 0]} size={[w, h, d]} color={color} roughness={0.55} wireframe={wireframe} />
        {/* Two recessed panel grooves — the classic 2-panel residential door look */}
        {!wireframe && [1, -1].map((sign) => (
          <Panel
            key={sign}
            position={[0, sign * (panelGapY / 2 + panelH / 2), d / 2 - 0.006]}
            size={[w - panelMargin * 2, panelH, 0.01]}
            color={panelColor}
            roughness={0.6}
          />
        ))}
        {/* Casing/frame strip around the edge */}
        {!wireframe && (
          <>
            <Panel position={[-w / 2 + 0.02, 0, d / 2 + 0.002]} size={[0.04, h, 0.012]} color={frameColor} roughness={0.5} />
            <Panel position={[w / 2 - 0.02, 0, d / 2 + 0.002]} size={[0.04, h, 0.012]} color={frameColor} roughness={0.5} />
            <Panel position={[0, h / 2 - 0.02, d / 2 + 0.002]} size={[w, 0.04, 0.012]} color={frameColor} roughness={0.5} />
            {/* Doorknob */}
            <mesh position={[w / 2 - 0.08, -0.02, d / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.03, 16]} />
              <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.25} />
            </mesh>
          </>
        )}
      </group>
    </ModulePlacement>
  );
}

// Frame color/thickness shared by the window's own casing.
const WINDOW_FRAME_MARGIN = 0.06;

function DecorativeWindowMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const frameColor = mod.options.color || "#f2efe9";
  const glassW = Math.max(w - WINDOW_FRAME_MARGIN * 2, 0.1);
  const glassH = Math.max(h - WINDOW_FRAME_MARGIN * 2, 0.1);
  // Flower-field backdrop, deterministic (not Math.random(), which would
  // reshuffle every render) — a handful of small colored dots along the
  // ground strip, spaced roughly evenly with a bit of sine-driven jitter so
  // it doesn't read as a mechanical grid.
  const FLOWER_COLORS = ["#f4a6c1", "#f7e07a", "#ffffff", "#f2a65a"];
  const flowers = Array.from({ length: 9 }, (_, i) => ({
    x: -glassW / 2 + (glassW * (i + 0.5)) / 9 + Math.sin(i * 12.9) * 0.03,
    y: Math.cos(i * 5.7) * 0.02,
    color: FLOWER_COLORS[i % FLOWER_COLORS.length],
  }));

  return (
    <ModulePlacement mod={mod} drag={drag}>
      <group position={[0, h / 2, 0]}>
        {/* Casing */}
        <Panel position={[-w / 2 + WINDOW_FRAME_MARGIN / 2, 0, 0]} size={[WINDOW_FRAME_MARGIN, h, d]} color={frameColor} roughness={0.5} wireframe={wireframe} />
        <Panel position={[w / 2 - WINDOW_FRAME_MARGIN / 2, 0, 0]} size={[WINDOW_FRAME_MARGIN, h, d]} color={frameColor} roughness={0.5} wireframe={wireframe} />
        <Panel position={[0, h / 2 - WINDOW_FRAME_MARGIN / 2, 0]} size={[w, WINDOW_FRAME_MARGIN, d]} color={frameColor} roughness={0.5} wireframe={wireframe} />
        <Panel position={[0, -h / 2 + WINDOW_FRAME_MARGIN / 2, 0]} size={[w, WINDOW_FRAME_MARGIN, d]} color={frameColor} roughness={0.5} wireframe={wireframe} />
        {!wireframe && (
          <>
            {/* Cross mullions, proud of the glass */}
            <Panel position={[0, 0, d / 2 - 0.004]} size={[0.025, glassH, 0.01]} color={frameColor} roughness={0.5} />
            <Panel position={[0, 0, d / 2 - 0.004]} size={[glassW, 0.025, 0.01]} color={frameColor} roughness={0.5} />
            {/* Backdrop — looking "outside": sky, a strip of ground, a sun,
                and a scatter of flowers, sitting just behind the glass so the
                transparency actually shows something rather than blackness.
                The window's own back face sits flush against the wall's
                inner face (its whole depth is squeezed between the two), so
                this has to stay INSIDE that depth — anything past the back
                face is inside/behind the opaque wall slab and gets hidden
                regardless of distance. Keeping it a quarter of the depth
                behind the glass leaves clearance on both sides. */}
            <group position={[0, 0, -d / 4]}>
              <mesh>
                <planeGeometry args={[glassW + 0.02, glassH + 0.02]} />
                <meshBasicMaterial color="#a9d6f0" />
              </mesh>
              <mesh position={[0, -glassH * 0.32, 0.002]}>
                <planeGeometry args={[glassW + 0.02, glassH * 0.36]} />
                <meshBasicMaterial color="#7cb87a" />
              </mesh>
              {flowers.map((f, i) => (
                <mesh key={i} position={[f.x, -glassH * 0.32 + f.y, 0.004]}>
                  <circleGeometry args={[glassH * 0.025, 10]} />
                  <meshBasicMaterial color={f.color} />
                </mesh>
              ))}
            </group>
            {/* Glass — real transmission/tint, same recipe as the cabinet
                glass-door front (see DoorPanel in ModulePreview3D.tsx), so
                the backdrop above genuinely reads as "through the glass"
                instead of a flat sticker. */}
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[glassW, glassH]} />
              <meshPhysicalMaterial
                color="#5b8b93" transparent opacity={0.22} roughness={0.05} metalness={0}
                transmission={0.85} thickness={0.02} ior={1.5} clearcoat={0.2} clearcoatRoughness={0.15} side={2}
              />
            </mesh>
            {/* Brillo — a soft diagonal highlight streak across the glass,
                like light glinting off it, so it doesn't read as a flat
                painted square. */}
            <mesh position={[glassW * 0.08, glassH * 0.05, 0.006]} rotation={[0, 0, Math.PI / 5]}>
              <planeGeometry args={[glassW * 0.22, glassH * 1.3]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
            </mesh>
          </>
        )}
      </group>
    </ModulePlacement>
  );
}

function OpeningMesh({ mod, wireframe, drag }: { mod: KitchenModule; wireframe: boolean; drag?: DragHandleProps }) {
  if (mod.type === "ventana_decorativa") return <DecorativeWindowMesh mod={mod} wireframe={wireframe} drag={drag} />;
  return <DecorativeDoorMesh mod={mod} wireframe={wireframe} drag={drag} />;
}

// Categories whose bodies can be grabbed and dragged around the room floor.
// Structural accessories (zócalos, trim panels) stay put — see
// DRAGGABLE_ACCESSORY_TYPES for the freestanding ones that are the exception.
const DRAGGABLE_CATEGORIES: KitchenModule["category"][] = ["lower", "upper", "tower", "corner", "countertop", "appliance", "opening"];

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

// A floor cabinet counts as a freestanding "island" once it's clearly away
// from every wall — hysteresis (enter/release pair, same shape as
// WALL_ROTATION_STICKY_MARGIN_M and the height-snap margins above) so the
// state doesn't flicker right at the boundary. Only lower/tower/corner
// cabinets are eligible; upper/appliance/countertop/accessory modules are
// never islands regardless of position.
const ISLAND_ENTER_DISTANCE_M = 0.85;
const ISLAND_RELEASE_DISTANCE_M = 0.55;
const ISLAND_ELIGIBLE_CATEGORIES = new Set<KitchenModule["category"]>(["lower", "tower", "corner"]);

export function isFreestandingPosition(
  x: number, z: number, roomWidthM: number, roomDepthM: number, wasIsland: boolean,
): boolean {
  const distanceToNearestWall = Math.min(x, roomWidthM - x, z, roomDepthM - z);
  return wasIsland
    ? distanceToNearestWall >= ISLAND_RELEASE_DISTANCE_M
    : distanceToNearestWall > ISLAND_ENTER_DISTANCE_M;
}

// Within this many cm of another wall-mounted module's own mount height
// (bottom edge) or top edge, a dragged wall-mounted module snaps to match
// it — the way a row of upper cabinets actually gets hung level in a real
// kitchen. HEIGHT_SNAP_RELEASE_CM is deliberately wider than the snap
// margin so, once caught, the drag needs a clearly deliberate extra push to
// break free instead of chattering right at the snap point — same
// snap-then-stick-then-release shape as WALL_ROTATION_STICKY_MARGIN_M,
// just expressed as two explicit margins since heights don't have a fixed
// small set of candidates the way the four walls do.
const HEIGHT_SNAP_MARGIN_CM = 4;
const HEIGHT_SNAP_RELEASE_CM = 9;

// Every other wall-mounted module's bottom (its own mountHeight) and top
// (mountHeight + its own height) edge, expressed as the mountHeight the
// DRAGGED module (`mod`) would need to land on that same bottom or top —
// so "closer to their top" and "closer to their bottom" are both just
// candidates in the same list, and whichever is nearest wins.
function candidateHeightSnapsCm(mod: KitchenModule, modules: KitchenModule[]): number[] {
  const candidates: number[] = [];
  for (const other of modules) {
    if (other.id === mod.id || !isWallMounted(other)) continue;
    const otherMountCm = other.options.mountHeight || 144;
    candidates.push(otherMountCm); // bottom-aligned
    candidates.push(otherMountCm + other.dimensions.height - mod.dimensions.height); // top-aligned
  }
  return candidates;
}

// Sticky height snapping: while already stuck to `activeSnapCm`, stays there
// through HEIGHT_SNAP_RELEASE_CM of further drag before re-evaluating —
// past that, or with no active snap yet, picks whichever candidate is
// nearest the raw dragged height, if any is within HEIGHT_SNAP_MARGIN_CM.
// Returns null (fully free, use the raw height as-is) otherwise.
function stickyHeightSnapCm(rawCm: number, candidates: number[], activeSnapCm: number | null): number | null {
  if (activeSnapCm !== null && Math.abs(rawCm - activeSnapCm) <= HEIGHT_SNAP_RELEASE_CM) return activeSnapCm;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(rawCm - c);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best !== null && bestDist <= HEIGHT_SNAP_MARGIN_CM ? best : null;
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
    case "opening":    return <OpeningMesh    mod={mod} wireframe={wireframe} drag={drag} />;
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

// Nominal front-to-back countertop depth (60cm cabinet + 2cm standard
// overhang) used only to size the run-outline frame below — matches
// kitchenData.ts's own STANDARD_COUNTERTOP_DEPTH_M, which the actual quote
// math uses for pricing (kept as a separate constant since that one is
// local to calculateKitchenMaterials, not exported).
const COUNTERTOP_RUN_DEPTH_M = 0.62;

interface CountertopRunSpan {
  rotation: KitchenModule["rotation"];
  alongWallStartM: number;
  alongWallEndM: number;
  topY: number;
}

// Wall-run countertop spans, purely for the ruler-gated blue outline below —
// mirrors the run-detection calculateKitchenMaterials does for pricing
// (same WALL_GAP_TOLERANCE_M, same blind-corner-widened footprint), but
// only computes geometry (no cost/label), and skips freestanding pieces
// (islands/peninsulas) since those are always a single segment already —
// there's no run-splitting bug for this overlay to ever need to reveal
// there. Deliberately a light, independent re-derivation rather than a
// shared call into the quote generator: the quote path also builds board
// panels, hardware, etc., which would be wasted work on every render.
// Same generous match distance kitchenData.ts's identical pass uses — see
// CORNER_NEIGHBOR_MATCH_M there for why it's much wider than
// WALL_GAP_TOLERANCE_M (no auto-snap exists between a corner cabinet and
// its perpendicular neighbor, so real placement can leave more than a few
// cm there).
const CORNER_NEIGHBOR_MATCH_M = 1;

function computeCountertopRunSpans(modules: KitchenModule[]): CountertopRunSpan[] {
  interface Seg { alongWall: number; widthM: number; wallKey: string; rotation: KitchenModule["rotation"]; topY: number }
  const segs: Seg[] = [];
  for (const mod of modules) {
    if (!mod.options.includesCountertop) continue;
    if (!(mod.category === "lower" || mod.category === "upper" || mod.category === "tower" || mod.category === "corner")) continue;
    const isEastWest = mod.rotation === 90 || mod.rotation === 270;
    const footprintWidthM = blindCornerFootprintWidth(mod) / 100;
    const depthCoordCm = isEastWest ? mod.x : mod.z;
    const alongWall = (isEastWest ? mod.z : mod.x) / 100;
    segs.push({ alongWall, widthM: footprintWidthM, wallKey: `${mod.rotation}|${Math.round(depthCoordCm * 10)}`, rotation: mod.rotation, topY: moduleTopY(mod) });
  }
  // Diagonal-miter corner extension — see kitchenData.ts's identical pass
  // for the full rationale. Runs after every module's own segment already
  // exists, so it can grow the SPECIFIC neighboring segment on the
  // perpendicular wall directly instead of adding a free-floating one and
  // hoping the run-merge tolerance happens to pick it up.
  for (const mod of modules) {
    if (!mod.options.includesCountertop || !BLIND_CORNER_TYPES.has(mod.type)) continue;
    const perpRotation = cornerPerpendicularRotation(mod);
    const perpIsEastWest = perpRotation === 90 || perpRotation === 270;
    const center = cornerExtensionWorldCenterCm(mod);
    const halfDepthM = mod.dimensions.depth / 200;
    const centerAlongWallM = (perpIsEastWest ? center.z : center.x) / 100;
    const cornerPointM = centerAlongWallM - halfDepthM;
    const neighborEdgeM = centerAlongWallM + halfDepthM;

    let best: Seg | null = null;
    let bestDist = Infinity;
    for (const seg of segs) {
      if (seg.rotation !== perpRotation) continue;
      const segStart = seg.alongWall - seg.widthM / 2;
      const segEnd = seg.alongWall + seg.widthM / 2;
      const dist = Math.min(Math.abs(segStart - neighborEdgeM), Math.abs(segEnd - neighborEdgeM));
      if (dist < bestDist) {
        bestDist = dist;
        best = seg;
      }
    }

    if (best && bestDist <= CORNER_NEIGHBOR_MATCH_M) {
      const segStart = best.alongWall - best.widthM / 2;
      const segEnd = best.alongWall + best.widthM / 2;
      let newStart = segStart;
      let newEnd = segEnd;
      if (Math.abs(segStart - neighborEdgeM) <= Math.abs(segEnd - neighborEdgeM)) {
        newStart = Math.min(segStart, cornerPointM);
      } else {
        newEnd = Math.max(segEnd, cornerPointM);
      }
      best.widthM = newEnd - newStart;
      best.alongWall = (newStart + newEnd) / 2;
    } else {
      const perpDepthCoordCm = mod.dimensions.depth / 2;
      segs.push({
        alongWall: centerAlongWallM, widthM: mod.dimensions.depth / 100,
        wallKey: `${perpRotation}|${Math.round(perpDepthCoordCm * 10)}`, rotation: perpRotation, topY: moduleTopY(mod),
      });
    }
  }
  const byWallKey = new Map<string, Seg[]>();
  for (const s of segs) {
    const list = byWallKey.get(s.wallKey) ?? [];
    list.push(s);
    byWallKey.set(s.wallKey, list);
  }
  const spans: CountertopRunSpan[] = [];
  for (const list of byWallKey.values()) {
    list.sort((a, b) => a.alongWall - b.alongWall);
    let run: Seg[] = [];
    let runEnd = -Infinity;
    const flush = () => {
      if (run.length === 0) return;
      spans.push({
        rotation: run[0].rotation,
        alongWallStartM: run[0].alongWall - run[0].widthM / 2,
        alongWallEndM: run[run.length - 1].alongWall + run[run.length - 1].widthM / 2,
        topY: Math.max(...run.map((s) => s.topY)),
      });
      run = [];
    };
    for (const s of list) {
      const start = s.alongWall - s.widthM / 2;
      if (run.length > 0 && start - runEnd > WALL_GAP_TOLERANCE_M) flush();
      run.push(s);
      runEnd = s.alongWall + s.widthM / 2;
    }
    flush();
  }
  return spans;
}

// Renders one run span as a thin blue wireframe box hovering just above the
// countertop surface — a "here's exactly one continuous piece" outline, so
// a run that got unexpectedly split (see WALL_GAP_TOLERANCE_M) shows up as
// two visibly separate frames with a gap between them instead of the single
// one the designer expected.
function CountertopRunFrame({ span, roomWidthM, roomDepthM }: { span: CountertopRunSpan; roomWidthM: number; roomDepthM: number }) {
  const lengthM = Math.max(span.alongWallEndM - span.alongWallStartM, 0.02);
  const centerAlong = (span.alongWallStartM + span.alongWallEndM) / 2;
  const D = COUNTERTOP_RUN_DEPTH_M;
  const FRAME_THICKNESS_M = 0.02;
  let position: [number, number, number];
  let size: [number, number, number];
  switch (span.rotation) {
    case 90: // west wall, x = 0
      position = [D / 2, span.topY + 0.005, centerAlong];
      size = [D, FRAME_THICKNESS_M, lengthM];
      break;
    case 270: // east wall, x = roomWidthM
      position = [roomWidthM - D / 2, span.topY + 0.005, centerAlong];
      size = [D, FRAME_THICKNESS_M, lengthM];
      break;
    case 180: // south wall, z = roomDepthM
      position = [centerAlong, span.topY + 0.005, roomDepthM - D / 2];
      size = [lengthM, FRAME_THICKNESS_M, D];
      break;
    default: // 0 — north wall, z = 0
      position = [centerAlong, span.topY + 0.005, D / 2];
      size = [lengthM, FRAME_THICKNESS_M, D];
      break;
  }
  const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), size);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments position={position} geometry={geometry}>
      <lineBasicMaterial color="#2563eb" />
    </lineSegments>
  );
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
        {mod.options.locked && "🔒 "}{mod.label}
      </span>
    </Html>
  );
}

// ─── Dimension line ─────────────────────────────────────────────────────────
// Toggled independently from the name label (can be shown alone, or stacked
// just under it) so every module's width is readable at a glance across the
// whole room at once — the one number that actually matters for lining up a
// run of cabinets against a wall — without opening each one's inspector.
//
// An architectural dimension line — a real 3D line laid across the module's
// own width axis, with tick marks at each end, not a floating chat-bubble
// badge. The line itself is attached to the module (rotates with it, so it
// visually IS the width being measured). The number itself is NOT rendered
// here — see DimensionLabelsOverlay, which lays out every module's text
// together in one screen-space pass so a run of same-height cabinets along
// a wall doesn't pile their labels on top of each other.
function ModuleDimensionsLabel({ mod }: { mod: KitchenModule }) {
  const labelY = moduleTopY(mod) + 0.02;
  // Blind-corner cabinets' real footprint is width + depth (the blind
  // extension) — see blindCornerFootprintWidth, the same figure the
  // collision/placement math already uses. Showing the bare
  // dimensions.width here would silently drop the extension's width.
  const footprintWidth = blindCornerFootprintWidth(mod);
  const halfW = footprintWidth / 200;
  const lineColor = MODULE_DIM_COLOR;
  // Drawn on top of everything else in the scene instead of being occluded
  // by whatever cabinet happens to sit between it and the camera — a
  // measurement overlay, not a physical object, so another mueble (e.g. a
  // second row of aéreos stacked above the first) hiding it defeats the
  // point. depthTest alone isn't enough: it stops THIS mesh from being
  // rejected by what's already drawn, but with depthWrite still on it
  // still leaves its own depth in the buffer, and Three.js's default
  // opaque-pass ordering doesn't guarantee it draws last — so a cabinet
  // drawn afterward could still paint over it. depthWrite:false (nothing
  // left in the depth buffer for it to lose to) + a high renderOrder
  // (draws dead last) closes both gaps.
  const alwaysOnTop = { depthTest: false, depthWrite: false, renderOrder: 999 };
  return (
    <group position={[mod.x / 100, labelY, mod.z / 100]} rotation={[0, THREE.MathUtils.degToRad(mod.rotation), 0]}>
      <mesh renderOrder={alwaysOnTop.renderOrder}>
        <boxGeometry args={[halfW * 2, 0.003, 0.003]} />
        <meshBasicMaterial color={lineColor} depthTest={alwaysOnTop.depthTest} depthWrite={alwaysOnTop.depthWrite} />
      </mesh>
      {/* End ticks, like a tape measure laid across the top edge */}
      <mesh position={[-halfW, 0, 0]} renderOrder={alwaysOnTop.renderOrder}>
        <boxGeometry args={[0.003, 0.025, 0.003]} />
        <meshBasicMaterial color={lineColor} depthTest={alwaysOnTop.depthTest} depthWrite={alwaysOnTop.depthWrite} />
      </mesh>
      <mesh position={[halfW, 0, 0]} renderOrder={alwaysOnTop.renderOrder}>
        <boxGeometry args={[0.003, 0.025, 0.003]} />
        <meshBasicMaterial color={lineColor} depthTest={alwaysOnTop.depthTest} depthWrite={alwaysOnTop.depthWrite} />
      </mesh>
      {/* The number itself isn't rendered here anymore — see
          DimensionLabelsOverlay below. A run of same-height cabinets along
          one wall puts all their text at nearly the same world position;
          only a single screen-space pass across every label at once can
          detect and resolve that, which a per-module 3D Text can't do. */}
    </group>
  );
}

// ─── Dimension label overlay (screen-space collision avoidance) ───────────
// Individual per-module 3D text labels used to sit directly above each
// module's own measurement line — fine in isolation, but a linear run of
// cabinets along one wall (a very common layout) puts several labels at
// nearly the same world height, and once projected through the camera they
// pile up into an unreadable stack. Two modules can also be far apart in 3D
// and still land on top of each other on screen depending on the current
// camera angle, so this has to work in actual screen pixels, not world
// coordinates — recomputed every frame as the camera orbits or modules
// change. One single-pass greedy layout (CAD-annotation style): try each
// label at its natural spot first, then alternate stepping it up/down by a
// row, then nudge sideways as a last resort for a dense cluster; whenever a
// label had to move, draw a short leader line back to its module so it's
// still clear which measurement belongs to which cabinet.
interface DimLabelDatum {
  id: string;
  text: string;
  anchor: THREE.Vector3; // world position of the module's own measurement line
}

const DIM_LABEL_ROW_PX = 20;
const DIM_LABEL_LIFT_PX = 12; // natural on-screen gap above the projected line
const DIM_LABEL_GAP_PX = 4;   // minimum breathing room between two labels
const DIM_LABEL_HEIGHT_PX = 18;
const DIM_LABEL_FONT_PX = 12;
const DIM_LABEL_H_PAD_PX = 12; // horizontal padding baked into each label's hit box

// Canvas 2D text measurement instead of a real DOM read (offsetWidth) — an
// actual layout read would force a reflow if interleaved with the transform
// writes below, on every label, every frame. One offscreen context, reused
// forever, measures width with zero DOM/layout cost.
let dimMeasureCtx: CanvasRenderingContext2D | null = null;
function measureDimLabelWidth(text: string): number {
  if (!dimMeasureCtx) dimMeasureCtx = document.createElement("canvas").getContext("2d");
  if (!dimMeasureCtx) return text.length * DIM_LABEL_FONT_PX * 0.62; // no canvas support — rough fallback
  dimMeasureCtx.font = `700 ${DIM_LABEL_FONT_PX}px system-ui, sans-serif`;
  return dimMeasureCtx.measureText(text).width;
}

function dimRectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return (
    ax < bx + bw + DIM_LABEL_GAP_PX && ax + aw + DIM_LABEL_GAP_PX > bx &&
    ay < by + bh + DIM_LABEL_GAP_PX && ay + ah + DIM_LABEL_GAP_PX > by
  );
}

function DimensionLabelsOverlay({ data, color = MODULE_DIM_COLOR }: { data: DimLabelDatum[]; color?: string }) {
  const { camera, size, gl } = useThree();
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const lineRefs = useRef(new Map<string, SVGLineElement>());
  // drei's <Html fullscreen> looked like the obvious fit here, but it isn't
  // actually camera-independent: it positions its wrapper via the SAME
  // project-a-3D-point-to-screen tracking Html uses everywhere else, anchored
  // to wherever this component's own implicit <group> sits (the room
  // origin, since nothing here sets a position) — so the "fullscreen" div
  // was really centered on that point's projected screen position, which
  // drifts as the camera orbits, dragging every label along with it even
  // though our own per-frame math below was computing correct canvas
  // coordinates the whole time.
  //
  // A plain DOM node into the canvas's own parent, sized with static CSS
  // instead of a per-frame transform, has no such anchor to drift — but it
  // can't be filled via React's own createPortal: that keeps the portaled
  // JSX inside R3F's *own* reconciler (this component's tree is owned by
  // the Fiber renderer that turns JSX into three.js objects, not DOM
  // nodes), so plain tags like <svg>/<div> come out as "not part of the
  // THREE namespace" errors — createPortal only crosses containers within
  // the SAME renderer, not between two different ones. A separate
  // ReactDOM.createRoot on that node (same trick drei's own Html uses
  // internally) renders it with the real DOM renderer instead.
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current) {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    elRef.current = el;
  }
  // State, not a ref: React runs ALL layout effects in a commit before ANY
  // passive effect, so on first mount the render-content effect below
  // (useLayoutEffect) already ran — finding the root not created yet, a
  // no-op — before this effect (useEffect) gets to create it. With a plain
  // ref nothing ever retries that render, so the labels stayed permanently
  // absent until some unrelated state change happened to force a re-render
  // (which explains why a page reload "fixed" it — that's naturally full
  // of early re-renders — but toggling the setting mid-session, once
  // everything had settled, did not). Setting state here schedules exactly
  // the re-render needed to retry it with a now-valid root.
  const [root, setRoot] = useState<ReactDOM.Root | null>(null);
  useEffect(() => {
    const target = gl.domElement.parentNode;
    const el = elRef.current;
    if (!target || !el) return;
    target.appendChild(el);
    const newRoot = ReactDOM.createRoot(el);
    setRoot(newRoot);
    return () => {
      newRoot.unmount();
      target.removeChild(el);
    };
  }, [gl]);

  // Reruns after every render (no dep array — matches drei's own Html)
  // instead of once, so the label set stays current as modules are
  // added/removed/resized.
  useLayoutEffect(() => {
    root?.render(
      <>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          {data.map((d) => (
            <line
              key={d.id}
              ref={(el) => { if (el) lineRefs.current.set(d.id, el); else lineRefs.current.delete(d.id); }}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2,2"
              opacity={0.55}
              style={{ visibility: "hidden" }}
            />
          ))}
        </svg>
        {data.map((d) => (
          <div
            key={d.id}
            ref={(el) => { if (el) nodeRefs.current.set(d.id, el); else nodeRefs.current.delete(d.id); }}
            style={{
              position: "absolute", left: 0, top: 0, visibility: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: `${DIM_LABEL_FONT_PX}px`, fontWeight: 700, fontFamily: "system-ui, sans-serif",
              color, whiteSpace: "nowrap",
              textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            }}
          >
            {d.text}
          </div>
        ))}
      </>
    );
  });

  useFrame(() => {
    const w = size.width;
    const h = size.height;
    const placed: { x: number; y: number; w: number; h: number }[] = [];

    // Left-to-right so collisions resolve in reading order instead of
    // insertion order (which would jump around as modules are added/removed).
    const projected = data
      .map((d) => {
        const v = d.anchor.clone().project(camera);
        return {
          id: d.id,
          text: d.text,
          sx: (v.x * 0.5 + 0.5) * w,
          sy: (-v.y * 0.5 + 0.5) * h,
          behind: v.z > 1,
          textW: measureDimLabelWidth(d.text),
        };
      })
      .sort((a, b) => a.sx - b.sx);

    for (const p of projected) {
      const node = nodeRefs.current.get(p.id);
      const line = lineRefs.current.get(p.id);
      if (!node) continue;
      if (p.behind) {
        node.style.visibility = "hidden";
        if (line) line.style.visibility = "hidden";
        continue;
      }
      const labelW = p.textW + DIM_LABEL_H_PAD_PX;
      const labelH = DIM_LABEL_HEIGHT_PX;
      const naturalX = p.sx - labelW / 2;
      const naturalY = p.sy - DIM_LABEL_LIFT_PX - labelH;

      let finalX = naturalX;
      let finalY = naturalY;
      let displaced = false;
      let resolved = false;
      // Natural spot first, then alternating rows above/below, growing outward.
      for (let i = 0; i < 9 && !resolved; i++) {
        const step = Math.ceil(i / 2) * DIM_LABEL_ROW_PX;
        const dy = i === 0 ? 0 : i % 2 === 1 ? -step : step;
        const cy = naturalY + dy;
        if (!placed.some((q) => dimRectsOverlap(naturalX, cy, labelW, labelH, q.x, q.y, q.w, q.h))) {
          finalX = naturalX;
          finalY = cy;
          displaced = i !== 0;
          resolved = true;
        }
      }
      // Still colliding (a dense cluster) — try nudging sideways too instead
      // of leaving it stacked.
      findSpot: for (let side = 1; !resolved && side <= 4; side++) {
        for (const dir of [1, -1]) {
          const cx = naturalX + dir * side * (labelW + DIM_LABEL_GAP_PX);
          for (const dy of [0, -DIM_LABEL_ROW_PX, DIM_LABEL_ROW_PX]) {
            const cy = naturalY + dy;
            if (!placed.some((q) => dimRectsOverlap(cx, cy, labelW, labelH, q.x, q.y, q.w, q.h))) {
              finalX = cx;
              finalY = cy;
              displaced = true;
              resolved = true;
              break findSpot;
            }
          }
        }
      }

      placed.push({ x: finalX, y: finalY, w: labelW, h: labelH });
      node.style.visibility = "visible";
      node.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`;
      node.style.width = `${labelW}px`;
      node.style.height = `${labelH}px`;
      if (line) {
        if (displaced) {
          line.style.visibility = "visible";
          line.setAttribute("x1", String(p.sx));
          line.setAttribute("y1", String(p.sy - DIM_LABEL_LIFT_PX));
          line.setAttribute("x2", String(finalX + labelW / 2));
          line.setAttribute("y2", String(finalY + labelH / 2));
        } else {
          line.style.visibility = "hidden";
        }
      }
    }
  });

  return null;
}

// ─── FAB cluster (click a module → shows this → mover / girar / editar / eliminar) ───
// Mover cycles through three states — off, "Libre" (arms drag-to-reposition
// with the existing live wall-facing rotation), "Dirección fija" (arms
// drag-to-reposition but the module only ever translates, never rotates,
// even if the drag crosses a corner) — instead of a plain on/off toggle, so
// a piece that shouldn't spin can be dragged around freely without it. See
// moveMode in AssemblyContent (dragging is otherwise inert, just a click, to
// stop accidental drags). Girar 90° is a one-shot rotate independent of
// Mover's state, same rotateModule-style flip already used elsewhere
// (inspector's "Rotar 90°"), just reachable straight from the 3D view.
// Eliminar needs a second click to confirm (auto-cancels after a few
// seconds), same reasoning as the inspector panel's own delete button:
// destructive and one click away from the same gesture used to just
// select/edit a module.
function ModuleFabCluster({
  mod, onEdit, moveMode, onCycleMove, canMove, onRotate, onDelete,
}: {
  mod: KitchenModule; onEdit: () => void;
  moveMode: "off" | "libre" | "fija"; onCycleMove: () => void; canMove: boolean;
  onRotate?: () => void; onDelete?: () => void;
}) {
  const labelY = moduleTopY(mod) + 0.12;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const moveTitle = !canMove
    ? "Desbloquea el mueble para moverlo"
    : moveMode === "off"
      ? "Activar para poder arrastrar y mover (libre)"
      : moveMode === "libre"
        ? "Libre: gira junto con el muro — clic para pasar a dirección fija"
        : "Dirección fija: solo se traslada, no gira — clic para desactivar";

  return (
    <Html position={[mod.x / 100, labelY, mod.z / 100]} center distanceFactor={6} zIndexRange={[20, 0]}>
      <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => { e.stopPropagation(); onCycleMove(); }}
          disabled={!canMove}
          aria-label={moveTitle}
          aria-pressed={moveMode !== "off"}
          title={moveTitle}
          className={`relative flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 ${
            moveMode === "libre" ? "border-brass bg-brass text-ink" : moveMode === "fija" ? "border-sky-400 bg-sky-400 text-ink" : "border-ivory/20 bg-ink/90 text-ivory"
          }`}
        >
          <Move size={15} />
          {moveMode === "fija" && (
            <Lock size={9} strokeWidth={3} className="absolute -bottom-0.5 -right-0.5 rounded-full border border-ink bg-ink text-sky-300" />
          )}
        </button>
        {onRotate && (
          <button
            onClick={(e) => { e.stopPropagation(); onRotate(); }}
            aria-label="Girar 90°"
            title="Girar 90°"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ivory/20 bg-ink/90 text-ivory shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95"
          >
            <RotateCw size={15} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label="Editar mueble"
          title="Editar mueble"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ivory/20 bg-brass text-ink shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95"
        >
          <Settings2 size={15} />
        </button>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirmingDelete) { onDelete(); setConfirmingDelete(false); } else setConfirmingDelete(true);
            }}
            aria-label={confirmingDelete ? "Confirmar eliminación" : "Eliminar mueble"}
            title={confirmingDelete ? "Confirmar eliminación" : "Eliminar mueble"}
            className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95 ${
              confirmingDelete ? "border-terracotta bg-terracotta text-ivory" : "border-ivory/20 bg-ink/90 text-ivory"
            }`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </Html>
  );
}

// Vertical anchor a module's mesh actually renders from — mirrors the fixed
// y-offsets each mesh function below uses (mountHeight for wall-mounted
// pieces, counter height for sink/stove/plain countertops, floor otherwise).
function baseY(mod: KitchenModule): number {
  if (mod.category === "upper" || mod.type === "campana_extractora" || mod.type === "campana_extractora_compacta" || mod.type === "esquinero_triangular" || mod.type === "esquinero_triangular_puerta" || mod.type === "gabinete_pared_esquinero_puertas" || mod.type === "ventana_decorativa") return (mod.options.mountHeight || 144) / 100;
  if (mod.type === "tarja") return 0.82;
  // "estufa" is a floor-standing range now (its own height reaches the
  // cooktop), unlike "parrilla"/"microondas" which still sit on a counter.
  if (mod.type === "parrilla" || mod.type === "microondas") return 0.87;
  if (mod.category === "countertop" && !["peninsula", "barra_desayunadora"].includes(mod.type)) return 0.87;
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

// World-space anchors for a wall's two dimension lines — its length (running
// along the wall, near the ceiling) and its height (a separate vertical line
// near the wall's start corner, see SimsWall). Shared between SimsWall
// (which uses these to place the actual 3D lines) and RoomBoundary (which
// uses the exact same points to feed DimensionLabelsOverlay) so the two
// stay in sync instead of duplicating the offset math independently.
function wallDimAnchors(
  center: [number, number], normal: [number, number], length: number, wallHeight: number,
): { lengthAnchor: THREE.Vector3; heightAnchor: THREE.Vector3 } {
  const isNorthSouth = Math.abs(normal[0]) < Math.abs(normal[1]);
  const toWorld = (u: number): [number, number] => (isNorthSouth ? [center[0] + u, center[1]] : [center[0], center[1] + u]);
  // `center` is the wall's inner face now (the room-boundary line), not its
  // centerline, so this is just a tiny anti-z-fight margin, not a
  // half-thickness compensation.
  const proud = 0.004;
  const lengthAnchor = new THREE.Vector3(center[0] - normal[0] * proud, wallHeight - 0.3, center[1] - normal[1] * proud);
  const [hwx, hwz] = toWorld(-length / 2 + 0.15);
  const heightAnchor = new THREE.Vector3(hwx - normal[0] * proud, wallHeight / 2, hwz - normal[1] * proud);
  return { lengthAnchor, heightAnchor };
}

// ─── "Sims" wall: tall when it's on the far side from the camera, low when it
// would otherwise block the view (i.e. the camera is looking over/through it).
// A single solid slab — doors and windows are no longer holes cut into it,
// just flat, thicknessless rectangles (like a module) sitting on its inner
// face, so they ride along in the same animated group and drop/rise with the
// wall instead of being left floating in place.
function SimsWall({ center, normal, length, thickness, wallHeight, openings, controlsRef, onOpeningMove, showDimensions }: {
  center: [number, number]; // room-space (x, z) of the wall's midpoint
  normal: [number, number]; // outward-facing unit normal (x, z)
  length: number;
  thickness: number;
  wallHeight: number; // meters — the room's ceiling height
  openings: WallOpeningM[];
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  onOpeningMove?: (id: string, offsetCm: number) => void;
  showDimensions?: boolean;
}) {
  const { camera, gl, raycaster } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentH = useRef(SIMS_WALL_LOW_H_M);
  const tallH = wallHeight;
  const lowH = SIMS_WALL_LOW_H_M;
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
  // The slab itself renders entirely OUTSIDE the room's nominal footprint —
  // `center` is the room-boundary line (the wall's inner face), not its
  // centerline — extended by `thickness` (half past each end) so adjacent
  // walls still overlap properly in the corner squares instead of leaving
  // them uncovered, and shifted outward by half a thickness so the slab's
  // own center sits on its true centerline. `length` itself (used below for
  // opening offsets and the dimension line) stays the real interior span —
  // only this mesh's own geometry is extended.
  const slabSize: [number, number, number] = isNorthSouth ? [length + thickness, tallH, thickness] : [thickness, tallH, length + thickness];
  const slabCenter: [number, number] = [center[0] + normal[0] * (thickness / 2), center[1] + normal[1] * (thickness / 2)];
  // Markers sit just proud of the wall's inner face (now exactly `center`)
  // so they never z-fight with it.
  const proud = 0.004;
  const markerRotationY = isNorthSouth ? 0 : Math.PI / 2;

  // Same tape-measure-line style as ModuleDimensionsLabel (line + end
  // ticks), run along the wall instead of a module edge. The text itself
  // isn't rendered here — see the DimensionLabelsOverlay instance rendered
  // by RoomBoundary, fed from the exact same wallDimAnchors this uses —
  // same reasoning as the per-module labels: several of these can end up
  // close together on screen (all four walls' length labels sit at roughly
  // the same ceiling-relative height) and only a shared screen-space pass
  // can keep them from overlapping.
  const dimLineColor = WALL_DIM_COLOR;
  const dimAlwaysOnTop = { depthTest: false, depthWrite: false, renderOrder: 999 };
  const { lengthAnchor, heightAnchor } = wallDimAnchors(center, normal, length, tallH);
  // Noticeably thicker than a module's own dimension line (0.003) — along
  // with the different color, makes a wall measurement read as a distinct
  // kind of annotation instead of just another cabinet's width line.
  const dimLineSize: [number, number, number] = isNorthSouth ? [length, 0.006, 0.006] : [0.006, 0.006, length];
  const dimTickX = isNorthSouth ? length / 2 : 0;
  const dimTickZ = isNorthSouth ? 0 : length / 2;

  // Height is its own separate vertical dimension near the wall's start
  // corner, instead of folded into the length label's text — a wall's
  // length and its height aren't the same kind of measurement and reading
  // "500 x 244 cm" off one badge was easy to misread as one cabinet-style
  // width x depth figure.
  const HEIGHT_LINE_MARGIN_M = 0.05;
  const heightLineSpan = Math.max(tallH - HEIGHT_LINE_MARGIN_M * 2, 0);
  const heightTickY = heightLineSpan / 2;

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
      <mesh position={[slabCenter[0], tallH / 2, slabCenter[1]]} castShadow receiveShadow>
        <boxGeometry args={slabSize} />
        <meshStandardMaterial color="#c9c7d4" />
      </mesh>
      {/* Wall width × ceiling height — pulled inward off the wall's inner
          face by the same "proud" offset the opening markers use, so it
          never z-fights with the wall and stays readable from inside the
          room. Sits inside this group so it folds down with the wall
          (same Sims-style behavior as the opening markers). */}
      {showDimensions && (
        <>
          <group position={[lengthAnchor.x, lengthAnchor.y, lengthAnchor.z]}>
            <mesh renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={dimLineSize} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
            <mesh position={[-dimTickX, 0, -dimTickZ]} renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={[0.005, 0.03, 0.005]} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
            <mesh position={[dimTickX, 0, dimTickZ]} renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={[0.005, 0.03, 0.005]} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
          </group>
          {/* Height — a separate vertical line near the wall's start corner. */}
          <group position={[heightAnchor.x, heightAnchor.y, heightAnchor.z]}>
            <mesh renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={[0.006, heightLineSpan, 0.006]} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
            <mesh position={[0, -heightTickY, 0]} renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={[0.03, 0.005, 0.005]} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
            <mesh position={[0, heightTickY, 0]} renderOrder={dimAlwaysOnTop.renderOrder}>
              <boxGeometry args={[0.03, 0.005, 0.005]} />
              <meshBasicMaterial color={dimLineColor} depthTest={dimAlwaysOnTop.depthTest} depthWrite={dimAlwaysOnTop.depthWrite} />
            </mesh>
          </group>
        </>
      )}
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
function RoomBoundary({ roomWidthM, roomDepthM, ceilingHeightM, openings, controlsRef, onOpeningMove, hiddenIds, isolatedId, showDimensions }: {
  roomWidthM: number; roomDepthM: number; ceilingHeightM: number; openings: WallOpening[];
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  onOpeningMove?: (id: string, offsetCm: number) => void;
  hiddenIds?: Set<string>; isolatedId?: string | null;
  showDimensions?: boolean;
}) {
  const t = WALL_THICKNESS_M;
  const centerX = roomWidthM / 2;
  const centerZ = roomDepthM / 2;
  const visibleOpenings = openings.filter((o) => (isolatedId ? o.id === isolatedId : !hiddenIds?.has(o.id)));
  const forWall = (wall: WallSide): WallOpeningM[] =>
    visibleOpenings.filter((o) => o.wall === wall).map((o) => ({
      id: o.id, type: o.type, offset: o.offset / 100, width: o.width / 100, height: o.height / 100, sillHeight: o.sillHeight / 100,
    }));

  // The four walls each get a length label + a height label — same
  // collision-avoiding overlay the modules use (see DimensionLabelsOverlay),
  // fed from the exact same anchor points SimsWall renders its 3D lines at
  // (wallDimAnchors), so a label always sits right at its own line.
  const walls: { id: string; center: [number, number]; normal: [number, number]; length: number }[] = [
    { id: "north", center: [centerX, 0], normal: [0, -1], length: roomWidthM },
    { id: "south", center: [centerX, roomDepthM], normal: [0, 1], length: roomWidthM },
    { id: "west", center: [0, centerZ], normal: [-1, 0], length: roomDepthM },
    { id: "east", center: [roomWidthM, centerZ], normal: [1, 0], length: roomDepthM },
  ];
  const wallLabelData: DimLabelDatum[] = showDimensions
    ? walls.flatMap((wall) => {
        const { lengthAnchor, heightAnchor } = wallDimAnchors(wall.center, wall.normal, wall.length, ceilingHeightM);
        return [
          { id: `wall-${wall.id}-length`, text: `${Math.round(wall.length * 100)} cm`, anchor: lengthAnchor },
          { id: `wall-${wall.id}-height`, text: `${Math.round(ceilingHeightM * 100)} cm`, anchor: heightAnchor },
        ];
      })
    : [];

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[roomWidthM / 2, -0.003, roomDepthM / 2]} receiveShadow>
        <planeGeometry args={[roomWidthM, roomDepthM]} />
        <meshStandardMaterial color="#c8c2b6" />
      </mesh>
      <Grid position={[roomWidthM / 2, -0.001, roomDepthM / 2]} args={[roomWidthM, roomDepthM]} cellColor="#9a9488" sectionColor="#7a7468" fadeDistance={30} fadeStrength={1.5} />
      {/* North wall (z=0) */}
      <SimsWall center={[centerX, 0]} normal={[0, -1]} length={roomWidthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("north")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} showDimensions={showDimensions} />
      {/* South wall */}
      <SimsWall center={[centerX, roomDepthM]} normal={[0, 1]} length={roomWidthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("south")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} showDimensions={showDimensions} />
      {/* West wall */}
      <SimsWall center={[0, centerZ]} normal={[-1, 0]} length={roomDepthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("west")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} showDimensions={showDimensions} />
      {/* East wall */}
      <SimsWall center={[roomWidthM, centerZ]} normal={[1, 0]} length={roomDepthM} thickness={t} wallHeight={ceilingHeightM} openings={forWall("east")} controlsRef={controlsRef} onOpeningMove={onOpeningMove} showDimensions={showDimensions} />
      {wallLabelData.length > 0 && <DimensionLabelsOverlay data={wallLabelData} color={WALL_DIM_COLOR} />}
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
  modules, roomWidthM, roomDepthM, wireframe, showLabels, showDimensions, controlsRef, onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, hiddenIds, isolatedId, hoveredId,
  selectedId, onSelectModule, keyboardStepCm, registerNudgeHandler,
}: {
  modules: KitchenModule[]; roomWidthM: number; roomDepthM: number; wireframe: boolean; showLabels: boolean; showDimensions: boolean;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
  onModuleActivate?: (id: string | null) => void;
  onModuleNudge?: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  onModuleRemove?: (id: string) => void;
  hiddenIds: Set<string>; isolatedId: string | null; hoveredId: string | null;
  selectedId: string | null; onSelectModule: (id: string | null) => void;
  keyboardStepCm: number;
  registerNudgeHandler: (fn: ((direction: NudgeDirection, stepCm: number) => void) | null) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const ceilingHeightM = useContext(CeilingHeightContext);
  // Dragging used to be live the moment you touched a module — easy to
  // nudge one out of place by accident while just trying to orbit the
  // camera or click past it. Now a module only actually repositions on
  // drag once its own "Mover" button (next to the gear button) armed it —
  // see handleMove/handleUp below, both still track the gesture either
  // way so a plain click still selects/deselects normally. Deliberately
  // persists across selection changes (clicking elsewhere to deselect,
  // e.g. via onPointerMissed below, or selecting a different module and
  // back) — it used to clear on every selection change, which meant
  // clicking away for any reason silently turned it back off. Only the
  // Mover button itself (or deleting the module) changes it now.
  //
  // `fixed` picks which of the two arm modes: false ("Libre") keeps the
  // existing live wall-facing rotation while dragging; true ("Dirección
  // fija") skips that entirely so the module only ever translates, never
  // rotates, no matter which wall it ends up near — for a piece that
  // shouldn't spin just because the drag briefly grazed a corner.
  const [moveMode, setMoveMode] = useState<{ id: string; fixed: boolean } | null>(null);
  // Reused, mutated in place per-raycast rather than recreated — only its
  // constant (plane height) ever changes.
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)).current;

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
    // An aéreo's local "forward"/"back" is exactly away-from/into its wall —
    // same glued-to-the-wall rule the drag handler enforces, just a no-op
    // here instead of a re-clamp since left/right nudges already can't
    // touch that axis (rotation is always wall-aligned).
    if (isWallMounted(mod) && (direction === "forward" || direction === "back")) return;
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

  // Raycasts against a horizontal plane at planeY (room-space meters), not
  // always the floor — a wall cabinet or counter-height accessory (tarja,
  // parrilla, microondas...) doesn't actually sit at y=0, and intersecting
  // the pointer ray against the floor instead of the plane the module is
  // really on meant a small mouse movement mapped to a much larger 3D
  // movement the higher up the dragged module actually was (a perspective-
  // camera ray grazes a plane far below the object at a shallower angle
  // than it does the object's own, closer plane) — most noticeable on
  // aéreos, barely there on floor cabinets since planeY≈0 for those already.
  const getFloorHit = (clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    dragPlane.constant = -planeY;
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(dragPlane, point) ? point : null;
  };

  // Projects a world point to CSS pixel coordinates on the canvas — the
  // building block for measuring a fixed screen-px-to-world sensitivity
  // once at drag start (see handleDragStart's wall-mounted branch) instead
  // of raycasting against a plane on every tick.
  const projectToScreen = (p: THREE.Vector3): { x: number; y: number } => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = p.clone().project(camera);
    return { x: ((ndc.x + 1) / 2) * rect.width + rect.left, y: ((1 - ndc.y) / 2) * rect.height + rect.top };
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
    const planeY = baseY(mod);
    const hit = getFloorHit(e.nativeEvent.clientX, e.nativeEvent.clientY, planeY);
    if (!hit) return;
    const pointerId = e.nativeEvent.pointerId;

    const clamp = (x: number, z: number) => clampModuleToRoom(mod, x, z, roomWidthM, roomDepthM);
    // Tracks which wall the drag currently "owns" across ticks — feeding it
    // back into nearestWallRotation's own currentRotation param is what makes
    // WALL_ROTATION_STICKY_MARGIN_M apply live instead of only at drop: the
    // module keeps following the wall it's already on right up to the
    // corner, then only flips once the pointer clears the margin past it,
    // instead of clamping to the old wall's edge and jumping on release.
    let liveRotation: KitchenModule["rotation"] = mod.rotation;
    // Tracks island-mode state across ticks the same way liveRotation does —
    // isFreestandingPosition's hysteresis needs the CURRENT gesture's state
    // as wasIsland, not the pre-drag stored value, or a continuous drag that
    // crosses the enter threshold and then heads back never sees the
    // (narrower) release threshold on the way back in.
    let liveIslandMode = mod.options.islandMode ?? false;
    // Which other wall-mounted module's edge (if any) the height drag is
    // currently stuck to — see stickyHeightSnapCm. Persists across
    // handleMove ticks the same way liveRotation does, and handleUp reads
    // whatever it last settled on.
    let activeHeightSnapCm: number | null = null;
    const heightSnapCandidates: number[] = isWallMounted(mod) ? candidateHeightSnapsCm(mod, modules) : [];

    // See WallDragBasis — a wall-mounted module's whole drag (along-wall
    // position AND height) is resolved from this fixed basis instead of any
    // plane raycast, measured once here by projecting the module's own
    // position and points 1m along its wall / 1m up into screen space.
    let wallDragBasis: WallDragBasis | null = null;
    if (isWallMounted(mod)) {
      const normal = ROTATION_NORMALS[mod.rotation] ?? [0, -1];
      const tangent: [number, number] = [-normal[1], normal[0]];
      const basePoint = new THREE.Vector3(mod.x / 100, baseY(mod), mod.z / 100);
      const alongPoint = basePoint.clone().add(new THREE.Vector3(tangent[0], 0, tangent[1]));
      const abovePoint = basePoint.clone().add(new THREE.Vector3(0, 1, 0));
      const screenBase = projectToScreen(basePoint);
      const screenAlong = projectToScreen(alongPoint);
      const screenAbove = projectToScreen(abovePoint);
      const alongWallPx = { x: screenAlong.x - screenBase.x, y: screenAlong.y - screenBase.y };
      const heightPx = { x: screenAbove.x - screenBase.x, y: screenAbove.y - screenBase.y };
      const det = alongWallPx.x * heightPx.y - heightPx.x * alongWallPx.y;
      if (Math.abs(det) > 1e-6) wallDragBasis = { tangent, alongWallPx, heightPx, det };
    }

    // Resolves the pointer's movement since drag start into a candidate
    // (x, z) — via wallDragBasis for a wall-mounted module, or the old
    // floor-plane raycast otherwise — plus a raw (unsnapped, but room-
    // clamped) mount height when applicable. Returns null only when neither
    // path could resolve a position at all (e.g. the floor raycast missed).
    const resolveDragTarget = (state: DragState, clientX: number, clientY: number): { x: number; z: number; rawHeightCm?: number } | null => {
      if (state.wallDragBasis) {
        const resolved = resolveWallDrag(state.wallDragBasis, state.startClientX, state.startClientY, clientX, clientY);
        if (!resolved) return null;
        const maxCm = Math.max(0, ceilingHeightM * 100 - mod.dimensions.height);
        return {
          x: state.startX + state.wallDragBasis.tangent[0] * resolved.alongWallM,
          z: state.startZ + state.wallDragBasis.tangent[1] * resolved.alongWallM,
          rawHeightCm: Math.min(Math.max(state.startMountHeightCm + resolved.heightCm, 0), maxCm),
        };
      }
      const hit = getFloorHit(clientX, clientY, planeY);
      if (!hit) return null;
      return { x: state.startX + (hit.x - state.startPointerX), z: state.startZ + (hit.z - state.startPointerZ) };
    };

    // Raw height → sticky-snapped height, updating activeHeightSnapCm as a
    // side effect so the next tick (or handleUp) knows whether it's still
    // within the release margin of whatever it's currently stuck to.
    const resolveMountHeightCm = (rawHeightCm: number | undefined): number | undefined => {
      if (rawHeightCm === undefined) return undefined;
      activeHeightSnapCm = stickyHeightSnapCm(rawHeightCm, heightSnapCandidates, activeHeightSnapCm);
      return activeHeightSnapCm ?? rawHeightCm;
    };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      // Not armed via the module's own "Mover" button — the gesture is still
      // tracked (so release still resolves to a click below), it just never
      // visibly repositions anything.
      if (moveMode?.id !== state.id) return;
      const target = resolveDragTarget(state, ev.clientX, ev.clientY);
      if (!target) return;
      const clamped = clamp(target.x, target.z);
      // Pulls flush against a compatible neighbor once dragged close — see
      // snapToNeighbor. Re-clamped afterward since a snap target right by a
      // wall could otherwise push the module a hair past it.
      const snapped = snapToNeighbor(mod, clamped.x, clamped.z, modules);
      let { x, z } = clamp(snapped.x, snapped.z);
      // Re-evaluated every tick (not just on drop) so crossing into another
      // wall's zone rotates the preview smoothly mid-drag instead of
      // sticking with the old orientation until release — applies to every
      // draggable module, not just aéreos, mirroring the nearestWallRotation
      // call handleUp already made at drop. WALL_ROTATION_STICKY_MARGIN_M is
      // what keeps this from flip-flopping on every small nudge near a
      // corner or the room's center. Armed "Dirección fija" skips all of
      // that instead — the module only ever translates.
      const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
      const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
      liveIslandMode = islandMode;
      const rotation = moveMode.fixed || islandMode ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
      liveRotation = rotation;
      if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
      // Lines up with a cabinet in the other band (floor vs wall-mounted)
      // on the same wall once close enough — e.g. an alacena centering
      // itself over the tarja below it.
      ({ x, z } = snapAlignAcrossBands(mod, x, z, rotation, modules));
      const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
      setDragPreview({ id: state.id, x: x * 100, z: z * 100, rotation, mountHeightCm });
    };
    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const traveled = Math.hypot(ev.clientX - state.startClientX, ev.clientY - state.startClientY);
      if (moveMode?.id !== state.id || traveled < CLICK_DISTANCE_PX) {
        // Either a plain click (not a drag), or a drag that was never armed
        // via "Mover" — either way (de)select the module instead of moving
        // it; an unarmed drag never repositions anything, no matter how far
        // the pointer traveled.
        onSelectModule(selectedId === state.id ? null : state.id);
      } else {
        const target = resolveDragTarget(state, ev.clientX, ev.clientY);
        if (target) {
          // Mirrors handleMove's clamp → snap → clamp pipeline exactly — this
          // used to only clamp, so the live preview would visibly snap flush
          // against a neighbor but the committed position reverted to the
          // raw unsnapped drag on release.
          const clamped = clamp(target.x, target.z);
          const snapped = snapToNeighbor(mod, clamped.x, clamped.z, modules);
          let { x, z } = clamp(snapped.x, snapped.z);
          // Continues from whichever wall the live preview last settled on
          // (not the original mod.rotation) so the drop can't un-flip a
          // corner crossing that already happened mid-drag — unless armed
          // "Dirección fija", which keeps the module's original rotation
          // throughout, same as handleMove above.
          const islandEligible = ISLAND_ELIGIBLE_CATEGORIES.has(mod.category);
          const islandMode = islandEligible && isFreestandingPosition(x, z, roomWidthM, roomDepthM, liveIslandMode);
          liveIslandMode = islandMode;
          const rotation = moveMode.fixed || islandMode ? mod.rotation : nearestWallRotation(x, z, roomWidthM, roomDepthM, liveRotation);
          // Re-flushes against whichever wall `rotation` ended up facing —
          // matters when the drag crossed a corner and switched walls.
          if (isWallMounted(mod)) ({ x, z } = wallFlushXZ(mod, x, z, roomWidthM, roomDepthM, rotation));
          ({ x, z } = snapAlignAcrossBands(mod, x, z, rotation, modules));
          const mountHeightCm = resolveMountHeightCm(target.rawHeightCm);
          const blocker = findOverlap(mod, x, z, rotation, modules);
          if (blocker) {
            // Doesn't snap all the way back to where the drag started —
            // slides as far toward the drop point as it can and stops right
            // at the obstacle, see slideToClosestFree.
            const landed = slideToClosestFree(mod, state.startX, state.startZ, x, z, rotation, modules);
            onModuleMove?.(state.id, landed.x * 100, landed.z * 100, rotation, mountHeightCm, islandMode);
            toast(`Se detuvo junto a "${blocker.label}"`, { description: "No se pudo mover más sin empalmarse.", duration: 1800 });
          } else {
            onModuleMove?.(state.id, x * 100, z * 100, rotation, mountHeightCm, islandMode);
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
      startMountHeightCm: mod.options.mountHeight || 144, wallDragBasis,
    };
    setDragPreview({ id: mod.id, x: mod.x, z: mod.z, rotation: mod.rotation });
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  // Fed to the one shared DimensionLabelsOverlay below instead of each
  // module rendering its own floating text — collision avoidance only works
  // with every label's position known at once.
  const dimLabelData: DimLabelDatum[] = [];
  const countertopRunSpans = useMemo(() => (showDimensions ? computeCountertopRunSpans(modules) : []), [modules, showDimensions]);

  return (
    <DragActiveContext.Provider value={dragPreview !== null}>
    <MoveArmedIdContext.Provider value={moveMode?.id ?? null}>
      {modules.map((mod) => {
        const visible = isolatedId ? mod.id === isolatedId : !hiddenIds.has(mod.id);
        if (!visible) return null;
        const draggable = isDraggableModule(mod) && !!onModuleMove && !mod.options.locked;
        const drag: DragHandleProps | undefined = draggable
          ? {
              onPointerDown: (e) => { e.stopPropagation(); handleDragStart(mod, e); },
              onPointerOver: (e) => { e.stopPropagation(); setGrabCursor(true); },
              onPointerOut: () => setGrabCursor(false),
            }
          : undefined;
        const effective = applyWallOffset(
          dragPreview?.id === mod.id
            ? {
                ...mod, x: dragPreview.x, z: dragPreview.z, rotation: dragPreview.rotation,
                options: dragPreview.mountHeightCm !== undefined ? { ...mod.options, mountHeight: dragPreview.mountHeightCm } : mod.options,
              }
            : mod
        );
        if (showDimensions) {
          dimLabelData.push({
            id: mod.id,
            text: `${blindCornerFootprintWidth(effective)} cm`,
            anchor: new THREE.Vector3(effective.x / 100, moduleTopY(effective) + 0.02, effective.z / 100),
          });
        }
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
              <ModuleFabCluster
                mod={effective}
                onEdit={() => onModuleActivate(mod.id)}
                moveMode={moveMode?.id === mod.id ? (moveMode.fixed ? "fija" : "libre") : "off"}
                onCycleMove={() => setMoveMode((cur) => {
                  if (cur?.id !== mod.id) return { id: mod.id, fixed: false };
                  if (!cur.fixed) return { id: mod.id, fixed: true };
                  return null;
                })}
                canMove={draggable}
                onRotate={onModuleMove && !mod.options.locked ? () => onModuleMove(mod.id, mod.x, mod.z, ((mod.rotation + 90) % 360) as KitchenModule["rotation"]) : undefined}
                onDelete={onModuleRemove && !mod.options.locked ? () => { onModuleRemove(mod.id); onSelectModule(null); setMoveMode((cur) => (cur?.id === mod.id ? null : cur)); } : undefined}
              />
            )}
          </group>
        );
      })}
      {showDimensions && dimLabelData.length > 0 && <DimensionLabelsOverlay data={dimLabelData} />}
      {showDimensions && countertopRunSpans.map((span, i) => (
        <CountertopRunFrame key={i} span={span} roomWidthM={roomWidthM} roomDepthM={roomDepthM} />
      ))}
    </MoveArmedIdContext.Provider>
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
  onModuleMove?: (id: string, x: number, z: number, rotation?: KitchenModule["rotation"], mountHeightCm?: number, islandMode?: boolean) => void;
  onModuleActivate?: (id: string | null) => void;
  onModuleNudge?: (id: string, dx: number, dz: number, dMountHeight: number) => void;
  // Deletes straight from the module list — the only reliable way to remove
  // a module whose type has no 3D geometry at all (e.g. "organizador de
  // especias" — some small accessories intentionally return null from
  // AccessoryMesh, see its fallback case), since there's nothing there to
  // click and select in Vista 3D in the first place.
  onModuleRemove?: (id: string) => void;
  onModuleToggleLock?: (id: string) => void;
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
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onModuleToggleLock, onOpeningMove, onUndo, undoCount = 0, readOnly = false,
}: KitchenAssemblySceneProps) {
  const [wireframe, setWireframe] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  // Persisted so the toggle survives navigating away and back instead of
  // resetting every time the builder remounts.
  const [showDimensions, setShowDimensions] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SHOW_DIMENSIONS_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(SHOW_DIMENSIONS_KEY, showDimensions ? "1" : "0");
  }, [showDimensions]);
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
    { key: "labels", icon: Tag, label: showLabels ? "Ocultar etiquetas" : "Mostrar etiquetas", active: showLabels, onClick: () => setShowLabels((v) => !v) },
    { key: "dimensions", icon: Ruler, label: showDimensions ? "Ocultar medidas" : "Mostrar medidas", active: showDimensions, onClick: () => setShowDimensions((v) => !v) },
  ];
  const selectedModule = modules.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="relative h-full overflow-hidden bg-surface">
      {/* Camera presets, wireframe/labels/dimensions toggles, zoom, undo —
          all editing/inspection chrome, not part of the plain "view it,
          orbit it, open a door" experience the public read-only viewer
          gives a client. */}
      {!readOnly && (
        <Camera3DControls
          presets={presets} toggles={toggles}
          onZoomIn={() => zoom(0.8)} onZoomOut={() => zoom(1.25)}
          onUndo={() => onUndo?.()} undoCount={undoCount}
        />
      )}

      {/* Fixed to the viewport, not the module — see SelectionToolbar and
          ModulePlacement's DragActiveContext for why this replaced the old
          in-scene floating D-pad (it used to overlap the gear button and
          could land on top of the model depending on camera angle). */}
      {selectedModule && onModuleNudge && !selectedModule.options.locked && (
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
                      {onModuleToggleLock && (
                        <button
                          onClick={() => onModuleToggleLock(mod.id)}
                          aria-label={mod.options.locked ? "Desbloquear mueble" : "Bloquear mueble"}
                          title={mod.options.locked ? "Desbloquear mueble" : "Bloquear mueble"}
                          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${mod.options.locked ? "bg-brass/70 text-ink" : "text-warmgray hover:bg-ivory/10 hover:text-ivory"}`}
                        >
                          {mod.options.locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                      )}
                      {onModuleRemove && (
                        <button
                          onClick={() => {
                            if (mod.options.locked) return;
                            if (selectedId === mod.id) setSelectedId(null);
                            onModuleRemove(mod.id);
                          }}
                          aria-label="Eliminar mueble"
                          title={mod.options.locked ? "Desbloquea el mueble para eliminarlo" : "Eliminar mueble"}
                          disabled={mod.options.locked}
                          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${mod.options.locked ? "cursor-not-allowed text-warmgray/30" : "text-warmgray hover:bg-terracotta/70 hover:text-ivory"}`}
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
          hiddenIds={hiddenIds} isolatedId={isolatedId} showDimensions={showDimensions}
        />

        <CeilingHeightContext.Provider value={ceilingHeight / 100}>
          <AssemblyContent
            modules={modules} roomWidthM={roomWidthM} roomDepthM={roomDepthM}
            wireframe={wireframe} showLabels={showLabels} showDimensions={showDimensions} controlsRef={controlsRef} onModuleMove={onModuleMove}
            onModuleActivate={onModuleActivate} onModuleNudge={onModuleNudge} onModuleRemove={onModuleRemove}
            hiddenIds={hiddenIds} isolatedId={isolatedId} hoveredId={hoveredId}
            selectedId={selectedId} onSelectModule={setSelectedId}
            keyboardStepCm={stepCm} registerNudgeHandler={registerNudgeHandler}
          />
        </CeilingHeightContext.Provider>
      </Canvas>
    </div>
  );
}
