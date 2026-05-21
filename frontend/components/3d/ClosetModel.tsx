import { Cylinder } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

type ClosetModelProps = ThreeElements["group"] & {
  width: number;
  height: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
  color: string;
  wireframe?: boolean;
}

export function ClosetModel({ width, height, depth, shelves, drawers, doors, color, wireframe = false, ...props }: ClosetModelProps) {
  const w = width / 100;
  const h = height / 100;
  const d = depth / 100;
  const thickness = 0.018;
  const doorThickness = 0.012;
  const material = new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, wireframe });
  const edgeMaterial = new MeshStandardMaterial({ color: "#ead9c2", roughness: 0.4, metalness: 0.05, wireframe });

  return (
    <group {...props}>
      <mesh position={[-w / 2 + thickness / 2, h / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[thickness, h, d]} />
      </mesh>
      <mesh position={[w / 2 - thickness / 2, h / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[thickness, h, d]} />
      </mesh>
      <mesh position={[0, h - thickness / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[w - thickness * 2, thickness, d]} />
      </mesh>
      <mesh position={[0, thickness / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[w - thickness * 2, thickness, d]} />
      </mesh>
      {Array.from({ length: shelves }).map((_, index) => {
        const y = ((index + 1) * h) / (shelves + 1);
        return (
          <mesh key={index} position={[0, y, 0]} material={material} castShadow receiveShadow>
            <boxGeometry args={[w - thickness * 2, thickness, d]} />
          </mesh>
        );
      })}
      {Array.from({ length: doors }).map((_, index) => {
        const doorWidth = w / Math.max(doors, 1) - 0.01;
        const x = -w / 2 + doorWidth / 2 + index * (doorWidth + 0.01) + 0.01;
        return (
          <group key={index} position={[x, h / 2, d / 2 + doorThickness / 2]}>
            <mesh material={edgeMaterial} castShadow receiveShadow>
              <boxGeometry args={[doorWidth, h - 0.04, doorThickness]} />
            </mesh>
            <Cylinder args={[0.005, 0.005, 0.035, 12]} rotation={[Math.PI / 2, 0, 0]} position={[-doorWidth / 2 + 0.015, h / 4, 0.012]} material-color="#71717a" />
          </group>
        );
      })}
      {Array.from({ length: drawers }).map((_, index) => {
        const drawerHeight = 0.22;
        const y = drawerHeight / 2 + 0.03 + index * (drawerHeight + 0.03);
        return (
          <group key={index} position={[0, y, d / 2 - 0.02]}>
            <mesh material={material} castShadow receiveShadow>
              <boxGeometry args={[w * 0.42, drawerHeight, d * 0.8]} />
            </mesh>
            <mesh position={[0, 0, d * 0.4]} material={edgeMaterial} castShadow receiveShadow>
              <boxGeometry args={[w * 0.45, drawerHeight, 0.015]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
