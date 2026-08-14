"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { ClosetModuleMesh } from "./ClosetBlockMeshes";
import { stackAlongAxis } from "@/services/closetData";
import { isNicheSpace, type ClosetProject } from "@/types/closet";

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

export function ClosetAssemblyScene({ project }: { project: ClosetProject }) {
  const area = project.areas[0];
  const conjunto = area?.conjuntos[0];
  if (!area || !conjunto || !isNicheSpace(area.space)) return null;

  const { width, height, depth } = area.space;
  const widthM = width / 100;
  const heightM = height / 100;
  const depthM = depth / 100;

  const packed = stackAlongAxis(conjunto.modules.map((m) => ({ sizeCm: m.width, module: m })));
  const totalPackedWidthM = packed.length ? packed[packed.length - 1].endCm / 100 : 0;
  // Center the packed row of modules within the niche's own width.
  const rowOffsetM = Math.max((widthM - totalPackedWidthM) / 2, 0);

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
        {packed.map(({ item, startCm }) => (
          <ClosetModuleMesh key={item.module.id} module={item.module} x={rowOffsetM + startCm / 100} z={0} />
        ))}
        <OrbitControls target={[widthM / 2, heightM / 2, 0]} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
