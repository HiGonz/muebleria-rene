"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cameraPresets } from "./CameraControls";
import { ClosetModel } from "./ClosetModel";
import { DeskModel } from "./DeskModel";
import { TvStandModel } from "./TvStandModel";
import { DimensionsPanel } from "./DimensionsPanel";
import type { FurnitureType } from "@/services/materialCalculator";

function CameraRig({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...target);
    camera.lookAt(0, 0.8, 0);
  }, [camera, target]);

  return null;
}

export function SceneCanvas({
  type,
  width,
  height,
  depth,
  shelves,
  drawers,
  doors,
  color,
}: {
  type: FurnitureType;
  width: number;
  height: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
  color: string;
}) {
  const [wireframe, setWireframe] = useState(false);
  const [showMeasures, setShowMeasures] = useState(true);
  const [cameraTarget, setCameraTarget] = useState(cameraPresets.reset);

  const model = useMemo(() => {
    if (type === "Closet") {
      return <ClosetModel width={width} height={height} depth={depth} shelves={shelves} drawers={drawers} doors={doors} color={color} wireframe={wireframe} />;
    }
    if (type === "Escritorio") {
      return <DeskModel width={width} height={height} depth={depth} shelves={shelves} drawers={drawers} color={color} wireframe={wireframe} />;
    }
    return <TvStandModel width={width} height={height} depth={depth} shelves={shelves} doors={doors} color={color} wireframe={wireframe} />;
  }, [color, depth, doors, drawers, height, shelves, type, width, wireframe]);

  return (
    <div className="relative h-[620px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d14]">
      <DimensionsPanel height={height} width={width} depth={depth} shelves={shelves} doors={doors} />
      <div className="absolute right-4 top-4 z-10 flex flex-wrap gap-2">
        <Button variant="secondary" className="h-9" onClick={() => setCameraTarget(cameraPresets.reset)}>Reset vista</Button>
        <Button variant="secondary" className="h-9" onClick={() => setCameraTarget(cameraPresets.front)}>Frontal</Button>
        <Button variant="secondary" className="h-9" onClick={() => setCameraTarget(cameraPresets.side)}>Lateral</Button>
        <Button variant="secondary" className="h-9" onClick={() => setCameraTarget(cameraPresets.top)}>Superior</Button>
        <Button variant="secondary" className="h-9" onClick={() => setWireframe((value) => !value)}>{wireframe ? "Sólido" : "Wireframe"}</Button>
        <Button variant="secondary" className="h-9" onClick={() => setShowMeasures((value) => !value)}>{showMeasures ? "Ocultar cotas" : "Mostrar cotas"}</Button>
      </div>
      <Canvas shadows camera={{ position: cameraPresets.reset, fov: 45 }}>
        <CameraRig target={cameraTarget} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 4, 2]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <pointLight position={[-2, 3, -2]} intensity={0.5} />
        <Grid position={[0, -0.001, 0]} args={[8, 8]} cellColor="#1d1d27" sectionColor="#2b2b3c" fadeDistance={25} fadeStrength={1.2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <planeGeometry args={[10, 10]} />
          <shadowMaterial opacity={0.28} />
        </mesh>
        {model}
        {showMeasures && (
          <group>
            <mesh position={[0, height / 200 + 0.12, depth / 200 + 0.18]}>
              <boxGeometry args={[width / 100, 0.01, 0.01]} />
              <meshStandardMaterial color="#10b981" />
            </mesh>
            <Text position={[0, height / 200 + 0.18, depth / 200 + 0.18]} fontSize={0.09} color="#c7d2fe">{width} cm</Text>
          </group>
        )}
        <Environment preset="warehouse" />
        <OrbitControls enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
