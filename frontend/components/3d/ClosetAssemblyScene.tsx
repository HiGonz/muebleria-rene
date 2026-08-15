"use client";

import { useRef, useState, type RefObject } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box } from "./ModulePreview3D";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import {
  stackAlongAxis, conjuntoWidthCm, conjuntoRange, findNearestFreeConjuntoX, layoutTopShelf,
  conjuntoDepthCm, conjuntoBox, conjuntoAlongWallCm, nearestWallForConjunto, findNearestFreeWallPosition, wallLocalToWorldCm,
} from "@/services/closetData";
import { isNicheSpace, type ClosetConjunto, type ClosetProject, type ClosetWallRotation } from "@/types/closet";

const SHELF_THICKNESS_M = 0.02;
const SHELF_COLOR = "#d4c5b0";

// A niche has no walls to walk around — a plain backdrop panel behind the
// modules plus a floor patch is enough to read as "this is a wall alcove".
function NicheBackdrop({ widthM, heightM, depthM }: { widthM: number; heightM: number; depthM: number }) {
  return (
    <group>
      <mesh position={[widthM / 2, heightM / 2, -0.02]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, heightM + 0.4]} />
        <meshStandardMaterial color="#e5e1d8" />
      </mesh>
      <mesh position={[widthM / 2, -0.005, depthM / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM + 0.4, depthM + 0.4]} />
        <meshStandardMaterial color="#cfcabf" />
      </mesh>
    </group>
  );
}

// A room is a real 4-wall walkable space — plain wall planes (no thickness,
// no openings — a closet room never has doors/windows in it, unlike
// kitchen's RoomBoundary) plus a floor patch sized exactly to the room.
function RoomBackdrop({ widthM, depthM, ceilingHeightM }: { widthM: number; depthM: number; ceilingHeightM: number }) {
  const wallColor = "#e5e1d8";
  const floorColor = "#cfcabf";
  return (
    <group>
      <mesh position={[widthM / 2, -0.005, depthM / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <mesh position={[widthM / 2, ceilingHeightM / 2, 0]} receiveShadow>
        <planeGeometry args={[widthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[widthM / 2, ceilingHeightM / 2, depthM]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[widthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, ceilingHeightM / 2, depthM / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[widthM, ceilingHeightM / 2, depthM / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depthM, ceilingHeightM]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Niche: 1-DOF drag (unchanged from phase 2) ─────────────────────────────

function useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { camera, gl } = useThree();
  const [dragPreview, setDragPreview] = useState<{ id: string; xCm: number } | null>(null);
  const dragRef = useRef<{ conjuntoId: string; pointerId: number; grabOffsetCm: number } | null>(null);

  const getFloorXCm = (clientX: number, clientY: number): number | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point.x * 100 : null;
  };

  const startDrag = (conjunto: ClosetConjunto, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pointerId = e.nativeEvent.pointerId;
    const floorXCm = getFloorXCm(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (floorXCm === null) return;
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* already captured */ }
    dragRef.current = { conjuntoId: conjunto.id, pointerId, grabOffsetCm: floorXCm - conjunto.x };
    setDragPreview({ id: conjunto.id, xCm: conjunto.x });

    const resolveXCm = (clientX: number, clientY: number): number | null => {
      const state = dragRef.current;
      if (!state) return null;
      const floorX = getFloorXCm(clientX, clientY);
      return floorX === null ? null : floorX - state.grabOffsetCm;
    };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY);
      if (targetXCm !== null) setDragPreview({ id: state.conjuntoId, xCm: targetXCm });
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (controlsRef.current) controlsRef.current.enabled = true;
      dragRef.current = null;
      setDragPreview(null);
    };

    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const targetXCm = resolveXCm(ev.clientX, ev.clientY) ?? conjunto.x;
      const widthCm = conjuntoWidthCm(conjunto);
      const others = conjuntos.filter((c) => c.id !== state.conjuntoId).map((c) => conjuntoRange(c));
      const resolvedXCm = findNearestFreeConjuntoX(targetXCm, widthCm, areaWidthCm, others);
      if (resolvedXCm !== null) onConjuntoMove(state.conjuntoId, resolvedXCm, conjunto.z, conjunto.rotation);
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function TopShelfMesh({ conjunto, xCm }: { conjunto: ClosetConjunto; xCm: number }) {
  if (!conjunto.topShelf) return null;
  const layout = layoutTopShelf(conjunto.topShelf, conjunto);
  if (!layout) return null;
  const widthM = (layout.xEndCm - layout.xStartCm) / 100;
  const depthM = Math.max(...conjunto.modules.map((m) => m.depth), 0) / 100;
  if (widthM <= 0 || depthM <= 0) return null;
  return (
    <Box
      pos={[xCm / 100 + (layout.xStartCm + layout.xEndCm) / 200, layout.yTopCm / 100 + SHELF_THICKNESS_M / 2, depthM / 2]}
      size={[widthM, SHELF_THICKNESS_M, depthM]}
      color={SHELF_COLOR}
    />
  );
}

function ConjuntoLayer({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { dragPreview, startDrag } = useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove });

  return (
    <>
      {conjuntos.map((conjunto) => {
        const xCm = dragPreview?.id === conjunto.id ? dragPreview.xCm : conjunto.x;
        const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => (
              <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100 + (startCm + item.module.width / 2) / 100} z={item.module.depth / 200} />
            ))}
            <TopShelfMesh conjunto={conjunto} xCm={xCm} />
          </group>
        );
      })}
    </>
  );
}

// ─── Room: wall-aware drag (mid-drag can reassign to another wall) + full
// room-space corner-aware collision ─────────────────────────────────────────

function useRoomConjuntoDrag({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  roomWidthCm: number;
  roomDepthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { camera, gl } = useThree();
  const [dragPreview, setDragPreview] = useState<{ id: string; xCm: number; zCm: number; rotation: ClosetWallRotation } | null>(null);
  const dragRef = useRef<{ conjuntoId: string; pointerId: number; grabOffsetCm: number; rotation: ClosetWallRotation } | null>(null);

  const getFloorPointCm = (clientX: number, clientY: number): { xCm: number; zCm: number } | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? { xCm: point.x * 100, zCm: point.z * 100 } : null;
  };

  const startDrag = (conjunto: ClosetConjunto, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pointerId = e.nativeEvent.pointerId;
    const floorStart = getFloorPointCm(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!floorStart) return;
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* already captured */ }

    const alongWallStartCm = conjuntoAlongWallCm(conjunto);
    const floorAlongWallStartCm = conjunto.rotation === 0 || conjunto.rotation === 180 ? floorStart.xCm : floorStart.zCm;
    dragRef.current = { conjuntoId: conjunto.id, pointerId, grabOffsetCm: floorAlongWallStartCm - alongWallStartCm, rotation: conjunto.rotation };
    setDragPreview({ id: conjunto.id, xCm: conjunto.x, zCm: conjunto.z, rotation: conjunto.rotation });

    const widthCm = conjuntoWidthCm(conjunto);
    const depthCm = conjuntoDepthCm(conjunto);

    // Resolves a live pointer position to a wall + along-wall offset, using
    // whichever wall the pointer is currently nearest — this is what lets a
    // drag reassign the conjunto to a different wall mid-gesture.
    const resolveLive = (clientX: number, clientY: number): { alongWallCm: number; rotation: ClosetWallRotation } | null => {
      const state = dragRef.current;
      if (!state) return null;
      const floorPoint = getFloorPointCm(clientX, clientY);
      if (!floorPoint) return null;
      const rotation = nearestWallForConjunto(floorPoint.xCm, floorPoint.zCm, roomWidthCm, roomDepthCm, state.rotation);
      const floorAlongWallCm = rotation === 0 || rotation === 180 ? floorPoint.xCm : floorPoint.zCm;
      state.rotation = rotation;
      return { alongWallCm: floorAlongWallCm - state.grabOffsetCm, rotation };
    };

    const toXZ = (alongWallCm: number, rotation: ClosetWallRotation): { xCm: number; zCm: number } =>
      rotation === 0 || rotation === 180 ? { xCm: alongWallCm, zCm: conjunto.z } : { xCm: conjunto.x, zCm: alongWallCm };

    const handleMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const live = resolveLive(ev.clientX, ev.clientY);
      if (!live) return;
      setDragPreview({ id: state.conjuntoId, ...toXZ(live.alongWallCm, live.rotation), rotation: live.rotation });
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      try { gl.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (controlsRef.current) controlsRef.current.enabled = true;
      dragRef.current = null;
      setDragPreview(null);
    };

    const handleUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      const live = resolveLive(ev.clientX, ev.clientY) ?? { alongWallCm: alongWallStartCm, rotation: conjunto.rotation };
      const otherBoxes = conjuntos
        .filter((c) => c.id !== state.conjuntoId)
        .map((c) => conjuntoBox(conjuntoAlongWallCm(c), c.rotation, conjuntoWidthCm(c), conjuntoDepthCm(c), roomWidthCm, roomDepthCm));
      const resolvedAlongWallCm = findNearestFreeWallPosition(live.alongWallCm, live.rotation, widthCm, depthCm, roomWidthCm, roomDepthCm, otherBoxes);
      if (resolvedAlongWallCm !== null) {
        const { xCm, zCm } = toXZ(resolvedAlongWallCm, live.rotation);
        onConjuntoMove(state.conjuntoId, xCm, zCm, live.rotation);
      }
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function RoomTopShelfMesh({ conjunto, alongWallCm, rotation, roomWidthCm, roomDepthCm }: {
  conjunto: ClosetConjunto; alongWallCm: number; rotation: ClosetWallRotation; roomWidthCm: number; roomDepthCm: number;
}) {
  if (!conjunto.topShelf) return null;
  const layout = layoutTopShelf(conjunto.topShelf, conjunto);
  if (!layout) return null;
  const depthCm = conjuntoDepthCm(conjunto);
  const widthM = (layout.xEndCm - layout.xStartCm) / 100;
  const depthM = depthCm / 100;
  if (widthM <= 0 || depthM <= 0) return null;
  const centerPackCm = (layout.xStartCm + layout.xEndCm) / 2;
  const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, centerPackCm, depthCm / 2, roomWidthCm, roomDepthCm);
  const alongWallAxisIsX = rotation === 0 || rotation === 180;
  return (
    <Box
      pos={[xCm / 100, layout.yTopCm / 100 + SHELF_THICKNESS_M / 2, zCm / 100]}
      size={alongWallAxisIsX ? [widthM, SHELF_THICKNESS_M, depthM] : [depthM, SHELF_THICKNESS_M, widthM]}
      color={SHELF_COLOR}
    />
  );
}

function RoomConjuntoLayer({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  roomWidthCm: number;
  roomDepthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const { dragPreview, startDrag } = useRoomConjuntoDrag({ conjuntos, roomWidthCm, roomDepthCm, controlsRef, onConjuntoMove });

  return (
    <>
      {conjuntos.map((conjunto) => {
        const preview = dragPreview?.id === conjunto.id ? dragPreview : null;
        const rotation = preview?.rotation ?? conjunto.rotation;
        const alongWallCm = preview ? (rotation === 0 || rotation === 180 ? preview.xCm : preview.zCm) : conjuntoAlongWallCm(conjunto);
        const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
        return (
          <group key={conjunto.id} onPointerDown={(e) => startDrag(conjunto, e)}>
            {packed.map(({ item, startCm }) => {
              const { xCm, zCm } = wallLocalToWorldCm(rotation, alongWallCm, startCm + item.module.width / 2, item.module.depth / 2, roomWidthCm, roomDepthCm);
              return <ClosetModuleMesh key={item.module.id} module={item.module} x={xCm / 100} z={zCm / 100} />;
            })}
            <RoomTopShelfMesh conjunto={conjunto} alongWallCm={alongWallCm} rotation={rotation} roomWidthCm={roomWidthCm} roomDepthCm={roomDepthCm} />
          </group>
        );
      })}
    </>
  );
}

export function ClosetAssemblyScene({ project, onConjuntoMove }: {
  project: ClosetProject;
  onConjuntoMove: (conjuntoId: string, xCm: number, zCm: number, rotation: ClosetWallRotation) => void;
}) {
  const area = project.areas[0];
  const controlsRef = useRef<OrbitControlsImpl>(null);
  if (!area) return null;

  if (isNicheSpace(area.space)) {
    const { width, height, depth } = area.space;
    const widthM = width / 100;
    const heightM = height / 100;
    const depthM = depth / 100;
    const dist = Math.max(widthM, heightM, depthM) * 2.2 + 0.6;

    return (
      <div className="relative h-full w-full overflow-hidden bg-surface">
        <Canvas shadows camera={{ position: [widthM / 2, heightM / 2.5, dist], fov: 45 }}>
          <color attach="background" args={["#1c1c28"]} />
          <ambientLight intensity={1} />
          <directionalLight position={[widthM + 2, heightM + 3, depthM + 3]} intensity={1.2} castShadow />
          <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />
          <NicheBackdrop widthM={widthM} heightM={heightM} depthM={depthM} />
          <Grid position={[widthM / 2, -0.004, depthM / 2]} args={[widthM + 1, depthM + 1]} cellColor="#3a3a48" sectionColor="#4a4a58" fadeDistance={10} />
          <ConjuntoLayer conjuntos={area.conjuntos} areaWidthCm={width} controlsRef={controlsRef} onConjuntoMove={onConjuntoMove} />
          <OrbitControls ref={controlsRef} target={[widthM / 2, heightM / 2, 0]} enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>
    );
  }

  const { width, depth, ceilingHeight } = area.space;
  const widthM = width / 100;
  const depthM = depth / 100;
  const ceilingHeightM = ceilingHeight / 100;
  const initialPos: [number, number, number] = [widthM / 2, ceilingHeightM * 0.85, Math.max(widthM, depthM) * 1.1 + depthM / 2];
  const targetPos: [number, number, number] = [widthM / 2, ceilingHeightM / 2, depthM / 2];

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      <Canvas shadows camera={{ position: initialPos, fov: 50 }}>
        <color attach="background" args={["#1c1c28"]} />
        <ambientLight intensity={1} />
        <directionalLight position={[widthM + 2, ceilingHeightM + 3, depthM + 3]} intensity={1.2} castShadow />
        <hemisphereLight args={["#e8e6e0", "#3a3a48", 0.5]} />
        <RoomBackdrop widthM={widthM} depthM={depthM} ceilingHeightM={ceilingHeightM} />
        <Grid position={[widthM / 2, 0.001, depthM / 2]} args={[widthM, depthM]} cellColor="#3a3a48" sectionColor="#4a4a58" fadeDistance={10} />
        <RoomConjuntoLayer conjuntos={area.conjuntos} roomWidthCm={width} roomDepthCm={depth} controlsRef={controlsRef} onConjuntoMove={onConjuntoMove} />
        <OrbitControls ref={controlsRef} target={targetPos} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
