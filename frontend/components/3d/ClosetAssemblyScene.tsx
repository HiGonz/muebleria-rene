"use client";

import { useRef, useState, type RefObject } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box } from "./ModulePreview3D";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import { stackAlongAxis, conjuntoWidthCm, conjuntoRange, findNearestFreeConjuntoX, layoutTopShelf } from "@/services/closetData";
import { isNicheSpace, type ClosetConjunto, type ClosetProject } from "@/types/closet";

const SHELF_THICKNESS_M = 0.02;
const SHELF_COLOR = "#d4c5b0";

// A niche has no walls to walk around — a plain backdrop panel behind the
// modules plus a floor patch is enough to read as "this is a wall alcove",
// unlike kitchen's real 4-wall RoomBoundary. Room-type áreas (a real
// walkable space) are a later phase, not built here.
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

// Drag lives inside the Canvas (needs useThree for camera/gl to raycast the
// floor plane) — a conjunto only ever needs its X coordinate in a niche (one
// wall, no room to move front-to-back or rotate), so this is a 1-DOF version
// of the floor-raycast drag technique KitchenAssemblyScene.tsx uses for its
// modules, simplified accordingly. See findNearestFreeConjuntoX for how a
// drop that would overlap another conjunto resolves to the nearest free spot
// instead of snapping back to where the drag started.
function useConjuntoDrag({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
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
    // Offset between the pointer's floor X and the conjunto's own x at grab
    // time — keeps the same grab point under the cursor throughout the drag
    // instead of snapping the conjunto's left edge to wherever the pointer is.
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
      if (resolvedXCm !== null) onConjuntoMove(state.conjuntoId, resolvedXCm);
      endDrag();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return { dragPreview, startDrag };
}

function ConjuntoLayer({ conjuntos, areaWidthCm, controlsRef, onConjuntoMove }: {
  conjuntos: ClosetConjunto[];
  areaWidthCm: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
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

export function ClosetAssemblyScene({ project, onConjuntoMove }: {
  project: ClosetProject;
  onConjuntoMove: (conjuntoId: string, xCm: number) => void;
}) {
  const area = project.areas[0];
  const controlsRef = useRef<OrbitControlsImpl>(null);
  if (!area || !isNicheSpace(area.space)) return null;

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
