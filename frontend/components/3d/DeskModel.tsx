import { Cylinder } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

type DeskModelProps = ThreeElements["group"] & {
  width: number;
  height: number;
  depth: number;
  shelves: number;
  drawers: number;
  color: string;
  wireframe?: boolean;
}

export function DeskModel({ width, height, depth, shelves, drawers, color, wireframe = false, ...props }: DeskModelProps) {
  const w = width / 100;
  const h = height / 100;
  const d = depth / 100;
  const topThickness = 0.04;
  const material = new MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08, wireframe });
  const legMaterial = new MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.25, metalness: 0.5, wireframe });

  return (
    <group {...props}>
      <mesh position={[0, h, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[w, topThickness, d]} />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Cylinder
            key={`${x}-${z}`}
            args={[0.025, 0.025, h, 20]}
            position={[x * (w / 2 - 0.08), h / 2, z * (d / 2 - 0.08)]}
            material={legMaterial}
            castShadow
            receiveShadow
          />
        )),
      )}
      {drawers > 0 && (
        <group position={[-w / 2 + 0.22, h * 0.58, 0]}>
          <mesh material={material} castShadow receiveShadow>
            <boxGeometry args={[0.36, 0.36, d * 0.72]} />
          </mesh>
          <mesh position={[0, 0.04, d * 0.36]} material-color="#ead9c2" castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.11, 0.015]} />
          </mesh>
        </group>
      )}
      {shelves > 0 && (
        <mesh position={[0, h * 0.35, 0]} material={material} castShadow receiveShadow>
          <boxGeometry args={[w * 0.65, 0.025, d * 0.45]} />
        </mesh>
      )}
    </group>
  );
}
