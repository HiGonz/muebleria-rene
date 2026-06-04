"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cameraPresets } from "./CameraControls";
import type { KitchenModule, ModuleCategory } from "@/types/kitchen";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// ─── Camera Rig ───────────────────────────────────────────────────────────────
function CameraRig({ target, controlsRef }: { target: [number, number, number]; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...target);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0.9, 0);
      controlsRef.current.update();
    }
  }, [camera, target, controlsRef]);
  return null;
}

// ─── Box with edge lines ───────────────────────────────────────────────────────
function Panel({ position, size, color, wireframe, opacity = 1 }: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  wireframe?: boolean;
  opacity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} wireframe={wireframe} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

// ─── Lower Cabinet Module ─────────────────────────────────────────────────────
function LowerCabinetMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const toeH = mod.options.hasToeKick ? mod.options.toeKickHeight / 100 : 0;
  const color = mod.options.color || "#d4c5b0";
  const ctH = mod.options.includesCountertop && mod.category !== "appliance" ? (mod.options.countertopThickness || 3) / 100 : 0;
  const t = 0.018; // 18mm panel thickness

  // Countertop color mapping
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
  const ctColor = ctColorMap[mod.options.countertopMaterial] ?? "#c8b89a";

  const bodyH = h - toeH;
  const bodyY = toeH + bodyH / 2;

  return (
    <group position={[xOffset + w / 2, 0, -d / 2]}>
      {/* Body */}
      <Panel position={[0, bodyY, 0]} size={[w, bodyH, d]} color={color} wireframe={wireframe} />
      {/* Toe kick */}
      {toeH > 0 && <Panel position={[0, toeH / 2, 0]} size={[w, toeH, d * 0.85]} color={new THREE.Color(color).multiplyScalar(0.7).getStyle()} wireframe={wireframe} />}
      {/* Countertop */}
      {ctH > 0 && <Panel position={[0, h + ctH / 2, d * 0.02]} size={[w + 0.02, ctH, d + 0.04]} color={ctColor} wireframe={wireframe} />}
      {/* Drawer fronts */}
      {Array.from({ length: mod.options.drawers }).map((_, i) => {
        const drawerH = (bodyH * 0.6) / Math.max(1, mod.options.drawers);
        const drawerY = toeH + drawerH * i + drawerH / 2 + bodyH * 0.05;
        return (
          <Panel key={i} position={[0, drawerY, d / 2 + 0.002]}
            size={[w - 0.04, drawerH - 0.01, 0.016]}
            color={new THREE.Color(color).multiplyScalar(0.88).getStyle()}
            wireframe={wireframe} />
        );
      })}
      {/* Door fronts */}
      {mod.options.doors > 0 && mod.options.drawers === 0 && (
        <Panel position={[0, bodyY, d / 2 + 0.002]}
          size={[w - 0.04, bodyH - 0.04, 0.018]}
          color={new THREE.Color(color).multiplyScalar(0.88).getStyle()}
          wireframe={wireframe} />
      )}
      {/* Handle */}
      {!wireframe && mod.options.hardwareFinish !== "Sin jaladores" && mod.options.doors > 0 && (
        <mesh position={[w * 0.3, bodyY, d / 2 + 0.03]}>
          <cylinderGeometry args={[0.005, 0.005, w * 0.35, 6]} />
          <meshStandardMaterial color="#909090" metalness={0.9} roughness={0.1} />
        </mesh>
      )}
    </group>
  );
}

// ─── Upper Cabinet Module ─────────────────────────────────────────────────────
function UpperCabinetMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const mountY = (mod.options.mountHeight || 144) / 100;
  const color = mod.options.color || "#d4c5b0";

  const glassColor = mod.options.doorStyle === "Vidrio transparente" ? "#c8e8f0" : mod.options.doorStyle === "Vidrio esmerilado" ? "#d4d8dc" : null;

  return (
    <group position={[xOffset + w / 2, mountY, -d / 2]}>
      <Panel position={[0, h / 2, 0]} size={[w, h, d]} color={color} wireframe={wireframe} />
      {/* Under-cabinet light strip */}
      {mod.options.hasUnderLight && !wireframe && (
        <mesh position={[0, 0.02, d / 2 - 0.01]}>
          <boxGeometry args={[w * 0.8, 0.01, 0.02]} />
          <meshStandardMaterial color="#ffffe0" emissive="#ffffe0" emissiveIntensity={2} />
        </mesh>
      )}
      {/* Door front */}
      {mod.options.doors > 0 && (
        <Panel position={[0, h / 2, d / 2 + 0.002]}
          size={[w - 0.03, h - 0.03, glassColor ? 0.006 : 0.016]}
          color={glassColor ?? new THREE.Color(color).multiplyScalar(0.88).getStyle()}
          wireframe={wireframe}
          opacity={glassColor ? 0.6 : 1}
        />
      )}
    </group>
  );
}

// ─── Tower Module ─────────────────────────────────────────────────────────────
function TowerMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const color = mod.options.color || "#d4c5b0";

  const ovenH = mod.options.ovenOpening ? mod.options.ovenHeight / 100 : 0;
  const microH = mod.options.microwaveOpening ? mod.options.microwaveHeight / 100 : 0;

  return (
    <group position={[xOffset + w / 2, 0, -d / 2]}>
      <Panel position={[0, h / 2, 0]} size={[w, h, d]} color={color} wireframe={wireframe} />
      {/* Oven opening */}
      {ovenH > 0 && !wireframe && (
        <mesh position={[0, ovenH / 2 + 0.1, d / 2 + 0.001]}>
          <boxGeometry args={[w * 0.8, ovenH, 0.01]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      )}
      {/* Microwave opening */}
      {microH > 0 && !wireframe && (
        <mesh position={[0, ovenH + microH / 2 + 0.2, d / 2 + 0.001]}>
          <boxGeometry args={[w * 0.8, microH, 0.01]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      )}
      {/* Doors */}
      {mod.options.doors > 0 && (
        <Panel position={[0, h * 0.75, d / 2 + 0.002]}
          size={[w - 0.04, h * 0.4, 0.018]}
          color={new THREE.Color(color).multiplyScalar(0.88).getStyle()}
          wireframe={wireframe} />
      )}
    </group>
  );
}

// ─── Countertop Module ────────────────────────────────────────────────────────
function CountertopMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
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
  const ctColor = ctColorMap[mod.options.countertopMaterial] ?? "#c8b89a";
  const bodyColor = mod.options.color || "#d4c5b0";

  const isIsland = mod.type === "isla_central" || mod.type === "peninsula" || mod.type === "barra_desayunadora";
  const bodyH = isIsland ? y - ctH : 0;

  return (
    <group position={[xOffset + w / 2, 0, -d / 2]}>
      {isIsland && bodyH > 0 && (
        <Panel position={[0, bodyH / 2, 0]} size={[w, bodyH, d]} color={bodyColor} wireframe={wireframe} />
      )}
      <Panel position={[0, (isIsland ? bodyH : 0.87) + ctH / 2, isIsland ? 0 : d * 0.02]}
        size={[w + (isIsland ? 0 : 0.02), ctH, d + (isIsland ? 0 : 0.04)]}
        color={ctColor} wireframe={wireframe} />
      {/* Backsplash */}
      {mod.options.hasBacksplash && (
        <Panel position={[0, (isIsland ? bodyH : 0.87) + 0.3, -(d / 2) + 0.01]}
          size={[w, mod.options.backsplashHeight / 100, 0.015]}
          color="#e0d8cc" wireframe={wireframe} />
      )}
    </group>
  );
}

// ─── Appliance Space ──────────────────────────────────────────────────────────
function ApplianceMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  const w = mod.dimensions.width / 100;
  const h = mod.dimensions.height / 100;
  const d = mod.dimensions.depth / 100;
  const color = mod.options.color || "#d4c5b0";

  return (
    <group position={[xOffset + w / 2, 0, -d / 2]}>
      {/* Frame panels (sides, top, bottom but hollow in front) */}
      <Panel position={[-w / 2 + 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[w / 2 - 0.018, h / 2, 0]} size={[0.036, h, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, h - 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
      <Panel position={[0, 0.018, 0]} size={[w, 0.036, d]} color={color} wireframe={wireframe} />
      {/* Appliance placeholder */}
      {!wireframe && (
        <Panel position={[0, h / 2, 0]} size={[w - 0.05, h - 0.05, d - 0.05]} color="#1a1a1a" wireframe={false} />
      )}
    </group>
  );
}

// ─── Accessory Mesh ───────────────────────────────────────────────────────────
function AccessoryMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  const w = mod.dimensions.width / 100;
  const color = mod.options.color || "#c0c0c0";

  if (mod.type === "zoclo") {
    return (
      <Panel
        position={[xOffset + w / 2, mod.dimensions.height / 200, 0]}
        size={[w, mod.dimensions.height / 100, 0.02]}
        color={color} wireframe={wireframe}
      />
    );
  }
  if (mod.type === "tarja") {
    return (
      <group position={[xOffset + w / 2, 0.9, -0.3]}>
        <Panel position={[0, 0, 0]} size={[w, 0.03, 0.5]} color="#b0b0b0" wireframe={wireframe} />
        {!wireframe && (
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[w * 0.7, 0.15, 0.35]} />
            <meshStandardMaterial color="#808080" metalness={0.8} roughness={0.2} />
          </mesh>
        )}
      </group>
    );
  }
  if (mod.type === "estufa" || mod.type === "parrilla") {
    return (
      <group position={[xOffset + w / 2, 0.87, -0.3]}>
        <Panel position={[0, 0.005, 0]} size={[w, 0.01, 0.6]} color="#202020" wireframe={wireframe} />
        {!wireframe && [[-w * 0.25, 0.06, -0.15], [w * 0.25, 0.06, -0.15], [-w * 0.25, 0.06, 0.15], [w * 0.25, 0.06, 0.15]].map(([bx, by, bz], i) => (
          <mesh key={i} position={[bx as number, by as number, bz as number]}>
            <torusGeometry args={[0.07, 0.015, 8, 16]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        ))}
      </group>
    );
  }
  if (mod.type === "campana_extractora") {
    const h = mod.dimensions.height / 100;
    const mount = (mod.options.mountHeight || 144) / 100;
    return (
      <group position={[xOffset + w / 2, mount + h / 2, -0.2]}>
        <Panel position={[0, 0, 0]} size={[w, h, 0.35]} color="#909090" wireframe={wireframe} />
      </group>
    );
  }
  if (mod.type === "panel_lateral" || mod.type === "panel_remate" || mod.type === "panel_decorativo") {
    return (
      <Panel
        position={[xOffset + 0.009, mod.dimensions.height / 200, -mod.dimensions.depth / 200]}
        size={[0.018, mod.dimensions.height / 100, mod.dimensions.depth / 100]}
        color={color} wireframe={wireframe}
      />
    );
  }

  return null; // Other accessories (herrajes, organizadores, etc.) are not 3D rendered
}

// ─── Module renderer router ───────────────────────────────────────────────────
function ModuleMesh({ mod, xOffset, wireframe }: { mod: KitchenModule; xOffset: number; wireframe: boolean }) {
  switch (mod.category) {
    case "lower":   return <LowerCabinetMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    case "upper":   return <UpperCabinetMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    case "tower":   return <TowerMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    case "countertop": return <CountertopMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    case "appliance": return <ApplianceMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    case "accessory": return <AccessoryMesh mod={mod} xOffset={xOffset} wireframe={wireframe} />;
    default: return null;
  }
}

// ─── Wall assembly ────────────────────────────────────────────────────────────
function WallAssembly({ modules, wallRotationY = 0, wallOffsetX = 0, wallOffsetZ = 0, wireframe }: {
  modules: KitchenModule[];
  wallRotationY?: number;
  wallOffsetX?: number;
  wallOffsetZ?: number;
  wireframe: boolean;
}) {
  const sorted = [...modules].sort((a, b) => a.position - b.position);
  let cursor = 0;

  const positions: { mod: KitchenModule; xOffset: number }[] = sorted.map((mod) => {
    const xOffset = cursor;
    cursor += mod.dimensions.width / 100;
    return { mod, xOffset };
  });

  return (
    <group rotation={[0, wallRotationY, 0]} position={[wallOffsetX, 0, wallOffsetZ]}>
      {positions.map(({ mod, xOffset }) => (
        <ModuleMesh key={mod.id} mod={mod} xOffset={xOffset} wireframe={wireframe} />
      ))}
    </group>
  );
}

// ─── Labels overlay ───────────────────────────────────────────────────────────
function ModuleLabels({ modules }: { modules: KitchenModule[] }) {
  const sorted = [...modules].sort((a, b) => a.position - b.position);
  let cursor = 0;
  return (
    <>
      {sorted.map((mod) => {
        const xOffset = cursor + mod.dimensions.width / 200;
        cursor += mod.dimensions.width / 100;
        const labelY = mod.category === "upper" ? (mod.options.mountHeight || 144) / 100 + mod.dimensions.height / 100 + 0.12 : mod.dimensions.height / 100 + (mod.options.includesCountertop ? (mod.options.countertopThickness || 3) / 100 : 0) + 0.1;
        return (
          <Text key={mod.id} position={[xOffset, labelY, 0.01]} fontSize={0.06} color="#a1a1aa" anchorX="center" anchorY="middle" maxWidth={mod.dimensions.width / 100 - 0.04}>
            {mod.label}
          </Text>
        );
      })}
    </>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────
interface KitchenAssemblySceneProps {
  modules: KitchenModule[];
  ceilingHeight: number;
}

export function KitchenAssemblyScene({ modules, ceilingHeight }: KitchenAssemblySceneProps) {
  const [wireframe, setWireframe] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>([3, 2.5, 4]);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const wallA = modules.filter((m) => m.wall === "A");
  const wallB = modules.filter((m) => m.wall === "B");
  const wallC = modules.filter((m) => m.wall === "C");
  const island = modules.filter((m) => m.wall === "isla");

  // Compute total width of wall A for centering
  const wallAWidth = wallA.reduce((s, m) => s + m.dimensions.width / 100, 0);
  const centerX = wallAWidth / 2;

  return (
    <div className="relative h-full overflow-hidden bg-[#0d0d14]">
      {/* Controls */}
      <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1.5 md:left-4 md:top-4 md:gap-2">
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setCameraTarget([3, 2.5, 4])}>Reset</Button>
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setCameraTarget([centerX, 1.5, 4])}>Frontal</Button>
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setCameraTarget([wallAWidth + 2, 1.5, 0])}>Lateral</Button>
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setCameraTarget([centerX, 5, 0.1])}>Superior</Button>
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setWireframe((v) => !v)}>{wireframe ? "Sólido" : "Wireframe"}</Button>
        <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setShowLabels((v) => !v)}>{showLabels ? "− etiquetas" : "+ etiquetas"}</Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 rounded-xl border border-white/8 bg-black/60 backdrop-blur-sm p-3 text-xs text-zinc-400 space-y-1">
        <p className="font-semibold text-zinc-300 text-[10px] uppercase tracking-wide">Módulos ({modules.length})</p>
        {["lower", "upper", "tower", "countertop", "appliance", "accessory"].map((cat) => {
          const count = modules.filter((m) => m.category === cat).length;
          if (count === 0) return null;
          const labels: Record<string, string> = { lower: "Bajos", upper: "Altos", tower: "Torres", countertop: "Encimeras", appliance: "Electrodom.", accessory: "Accesorios" };
          return <p key={cat}>{labels[cat]}: <span className="text-white">{count}</span></p>;
        })}
      </div>

      <Canvas shadows camera={{ position: cameraTarget, fov: 45 }}>
        <CameraRig target={cameraTarget} controlsRef={controlsRef} />
        <OrbitControls ref={controlsRef} target={[centerX, 0.9, 0]} enableDamping dampingFactor={0.05} />

        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 6, 4]} intensity={1.2} castShadow />
        <pointLight position={[-2, 3, -2]} intensity={0.4} />
        <hemisphereLight args={["#1a1a2e", "#0a0a14", 0.3]} />

        <Grid position={[0, -0.002, 0]} args={[20, 20]} cellColor="#1d1d27" sectionColor="#2b2b3c" fadeDistance={30} fadeStrength={1.5} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <shadowMaterial opacity={0.3} />
        </mesh>

        {/* Wall A (main) */}
        {wallA.length > 0 && (
          <group position={[-centerX, 0, 0]}>
            <WallAssembly modules={wallA} wireframe={wireframe} />
            {showLabels && <ModuleLabels modules={wallA} />}
          </group>
        )}

        {/* Wall B (perpendicular to the right) */}
        {wallB.length > 0 && (
          <group position={[wallAWidth - centerX, 0, 0]}>
            <WallAssembly modules={wallB} wallRotationY={-Math.PI / 2} wireframe={wireframe} />
          </group>
        )}

        {/* Wall C (parallel back) */}
        {wallC.length > 0 && (
          <group position={[-centerX, 0, -2.5]}>
            <WallAssembly modules={wallC} wallRotationY={Math.PI} wireframe={wireframe} />
          </group>
        )}

        {/* Island (centered) */}
        {island.length > 0 && (
          <group position={[-island.reduce((s, m) => s + m.dimensions.width / 100, 0) / 2, 0, -1.2]}>
            <WallAssembly modules={island} wireframe={wireframe} />
          </group>
        )}

        {/* Wall backdrop (back wall hint) */}
        {wallA.length > 0 && (
          <mesh position={[0, ceilingHeight / 200, -(Math.max(...wallA.map((m) => m.dimensions.depth / 100)) + 0.05)]} receiveShadow>
            <planeGeometry args={[wallAWidth + 4, ceilingHeight / 100]} />
            <meshStandardMaterial color="#12121a" />
          </mesh>
        )}
      </Canvas>
    </div>
  );
}
