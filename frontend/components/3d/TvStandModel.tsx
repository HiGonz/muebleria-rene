import type { ThreeElements } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

type TvStandModelProps = ThreeElements["group"] & {
  width: number;
  height: number;
  depth: number;
  shelves: number;
  doors: number;
  color: string;
  wireframe?: boolean;
}

export function TvStandModel({ width, height, depth, shelves, doors, color, wireframe = false, ...props }: TvStandModelProps) {
  const w = width / 100;
  const h = height / 100;
  const d = depth / 100;
  const thickness = 0.02;
  const material = new MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.08, wireframe });
  const accent = new MeshStandardMaterial({ color: "#efe3d2", roughness: 0.42, metalness: 0.04, wireframe });

  return (
    <group {...props}>
      <mesh position={[0, h, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[w, thickness, d]} />
      </mesh>
      <mesh position={[0, 0, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[w, thickness, d]} />
      </mesh>
      <mesh position={[-w / 2 + thickness / 2, h / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[thickness, h, d]} />
      </mesh>
      <mesh position={[w / 2 - thickness / 2, h / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[thickness, h, d]} />
      </mesh>
      {Array.from({ length: shelves }).map((_, index) => {
        const x = -w / 2 + ((index + 1) * w) / (shelves + 1);
        return (
          <mesh key={index} position={[x, h / 2, 0]} material={material} castShadow receiveShadow>
            <boxGeometry args={[thickness, h - thickness * 2, d]} />
          </mesh>
        );
      })}
      {Array.from({ length: doors }).map((_, index) => {
        const doorWidth = w / Math.max(doors, 1) - 0.015;
        const x = -w / 2 + doorWidth / 2 + index * (doorWidth + 0.015) + 0.01;
        return (
          <mesh key={index} position={[x, h / 2 - 0.03, d / 2 + 0.01]} material={accent} castShadow receiveShadow>
            <boxGeometry args={[doorWidth, h * 0.72, 0.014]} />
          </mesh>
        );
      })}
      <mesh position={[0, -0.06, 0]} material-color="#262633" castShadow receiveShadow>
        <boxGeometry args={[w * 0.9, 0.08, d * 0.85]} />
      </mesh>
    </group>
  );
}
