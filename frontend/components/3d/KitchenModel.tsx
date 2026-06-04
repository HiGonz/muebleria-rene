import type { ThreeElements } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

type KitchenModelProps = ThreeElements["group"] & {
  /** Ancho total en cm */
  width: number;
  /** Alto total en cm — desde el piso hasta la parte superior de los gabinetes altos */
  height: number;
  /** Fondo en cm — profundidad de los gabinetes bajos */
  depth: number;
  /** Número de puertas en gabinetes altos (se reparten L/R alrededor de la campana) */
  shelves: number;
  /** Número de cajones en la sección baja derecha */
  drawers: number;
  /** Número de puertas en gabinetes bajos (sección izquierda) */
  doors: number;
  /** Color de los gabinetes bajos (hex) */
  color: string;
  wireframe?: boolean;
};

export function KitchenModel({
  width,
  height,
  depth,
  shelves,
  drawers,
  doors,
  color,
  wireframe = false,
  ...props
}: KitchenModelProps) {
  const w = width / 100;
  const h = height / 100;
  const d = depth / 100;
  const t = 0.018; // grosor de tablero 18 mm

  // ── Proporciones estándar de cocina ──────────────────────────────
  // Gabinetes bajos: ~87 cm (40 % de h total ~215 cm)
  const lowerH = h * 0.405;
  const counterT = 0.03; // cubierta 3 cm
  // Gabinetes altos arrancan a ~140 cm del piso (65 % de h)
  const upperStart = h * 0.65;
  const upperH = h - upperStart;
  const upperD = d * 0.58; // gabinetes altos más angostos (~35 cm)
  // Alineados con la pared trasera
  const upperZ = -d / 2 + upperD / 2;
  const upperFrontZ = upperZ + upperD / 2;
  // Espacio de salpicadero
  const splashGap = upperStart - lowerH - counterT;

  // ── Materiales ───────────────────────────────────────────────────
  const lowerMat = new MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05, wireframe });
  // Gabinetes altos: nogal oscuro espresso
  const upperMat = new MeshStandardMaterial({ color: "#3a1f0d", roughness: 0.70, metalness: 0.06, wireframe });
  // Cubierta: granito / cuarzo blanco
  const counterMat = new MeshStandardMaterial({ color: "#d6d2cd", roughness: 0.14, metalness: 0.18, wireframe });
  // Salpicadero: vidrio templado blanco
  const splashMat = new MeshStandardMaterial({ color: "#f2efec", roughness: 0.06, metalness: 0.04, wireframe });
  // Campana: acero / negro metálico
  const hoodMat = new MeshStandardMaterial({ color: "#1c1c1e", roughness: 0.18, metalness: 0.84, wireframe });
  // Jaladores: aluminio cepillado
  const handleMat = new MeshStandardMaterial({ color: "#8a8ea0", roughness: 0.16, metalness: 0.90, wireframe });
  // Patín / zócalo
  const toeMat = new MeshStandardMaterial({ color: "#121212", roughness: 0.55, metalness: 0.10, wireframe });

  // ── Campana: ocupa el 33 % del ancho, máx 80 cm ─────────────────
  const hoodW = Math.min(0.80, w * 0.33);
  // Ancho disponible por lado para los gabinetes altos
  const sideW = (w - hoodW - t * 4) / 2;

  // ── Gabinetes bajos: proporciones puertas / cajones ──────────────
  const doorsN = Math.max(doors, 1);
  const drawersN = Math.max(drawers, 0);
  const innerW = w - t * 2;
  const doorsFrac = drawersN > 0 ? doorsN / (doorsN + drawersN) : 1;
  const doorsSectW = innerW * doorsFrac;
  const drwrSectW = innerW * (1 - doorsFrac);
  const doorFrontW = (doorsSectW - 0.006 * (doorsN - 1)) / doorsN;
  const drwrFrontH = drawersN > 0 ? (lowerH - t * 2 - 0.004 * (drawersN - 1)) / drawersN : 0;

  // ── Gabinetes altos: puertas L/R alrededor de la campana ─────────
  const leftN = Math.floor(Math.max(shelves, 2) / 2);
  const rightN = Math.ceil(Math.max(shelves, 2) / 2);
  const leftDoorW = (sideW - 0.006 * Math.max(leftN - 1, 0)) / Math.max(leftN, 1);
  const rightDoorW = (sideW - 0.006 * Math.max(rightN - 1, 0)) / Math.max(rightN, 1);

  return (
    <group {...props}>
      {/* ═══════════════════════════════════════
          GABINETES BAJOS — CUERPO
      ═══════════════════════════════════════ */}

      {/* Piso */}
      <mesh position={[0, t / 2, 0]} material={lowerMat} castShadow receiveShadow>
        <boxGeometry args={[w, t, d]} />
      </mesh>
      {/* Tapa superior */}
      <mesh position={[0, lowerH, 0]} material={lowerMat} castShadow receiveShadow>
        <boxGeometry args={[w, t, d]} />
      </mesh>
      {/* Lateral izquierdo */}
      <mesh position={[-w / 2 + t / 2, lowerH / 2, 0]} material={lowerMat} castShadow receiveShadow>
        <boxGeometry args={[t, lowerH, d]} />
      </mesh>
      {/* Lateral derecho */}
      <mesh position={[w / 2 - t / 2, lowerH / 2, 0]} material={lowerMat} castShadow receiveShadow>
        <boxGeometry args={[t, lowerH, d]} />
      </mesh>
      {/* Fondo */}
      <mesh position={[0, lowerH / 2, -d / 2 + t / 2]} material={lowerMat} castShadow receiveShadow>
        <boxGeometry args={[w - t * 2, lowerH, t]} />
      </mesh>
      {/* Patín / zócalo */}
      <mesh position={[0, 0.048, d / 2 - 0.022]} material={toeMat} castShadow receiveShadow>
        <boxGeometry args={[w - t * 2, 0.088, 0.038]} />
      </mesh>

      {/* ═══════════════════════════════════════
          CUBIERTA / ENCIMERA
      ═══════════════════════════════════════ */}
      <mesh position={[0, lowerH + counterT / 2, 0]} material={counterMat} castShadow receiveShadow>
        {/* Vuelo de 2 cm en frente y 2 cm a los lados */}
        <boxGeometry args={[w + 0.04, counterT, d + 0.04]} />
      </mesh>

      {/* ═══════════════════════════════════════
          SALPICADERO / PROTECTOR DE PARED
      ═══════════════════════════════════════ */}
      <mesh
        position={[0, lowerH + counterT + splashGap / 2, -d / 2 + 0.006]}
        material={splashMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, splashGap, 0.008]} />
      </mesh>

      {/* ═══════════════════════════════════════
          FRENTES DE PUERTAS BAJAS
      ═══════════════════════════════════════ */}
      {Array.from({ length: doorsN }).map((_, i) => {
        const x = -w / 2 + t + doorFrontW / 2 + i * (doorFrontW + 0.006);
        const fh = lowerH - t * 2 - 0.004;
        return (
          <group key={`ld-${i}`} position={[x, lowerH / 2, d / 2 + 0.009]}>
            {/* Frente plano */}
            <mesh material={lowerMat} castShadow receiveShadow>
              <boxGeometry args={[doorFrontW, fh, 0.017]} />
            </mesh>
            {/* Jalador J-pull inferior */}
            <mesh position={[0, -fh / 2 + 0.038, 0.016]} material={handleMat}>
              <boxGeometry args={[doorFrontW * 0.44, 0.011, 0.011]} />
            </mesh>
          </group>
        );
      })}

      {/* ═══════════════════════════════════════
          FRENTES DE CAJONES
      ═══════════════════════════════════════ */}
      {drawersN > 0 &&
        Array.from({ length: drawersN }).map((_, i) => {
          const x = -w / 2 + t + doorsSectW + drwrSectW / 2;
          const y = t + drwrFrontH / 2 + i * (drwrFrontH + 0.004);
          return (
            <group key={`dr-${i}`} position={[x, y, d / 2 + 0.009]}>
              <mesh material={lowerMat} castShadow receiveShadow>
                <boxGeometry args={[drwrSectW - 0.006, drwrFrontH, 0.017]} />
              </mesh>
              {/* Jalador centrado */}
              <mesh position={[0, 0, 0.016]} material={handleMat}>
                <boxGeometry args={[(drwrSectW - 0.006) * 0.38, 0.010, 0.010]} />
              </mesh>
            </group>
          );
        })}

      {/* ═══════════════════════════════════════
          GABINETES ALTOS — CUERPO
      ═══════════════════════════════════════ */}

      {/* Piso */}
      <mesh position={[0, upperStart, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[w, t, upperD]} />
      </mesh>
      {/* Techo */}
      <mesh position={[0, h - t / 2, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[w, t, upperD]} />
      </mesh>
      {/* Lateral izquierdo */}
      <mesh position={[-w / 2 + t / 2, upperStart + upperH / 2, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[t, upperH, upperD]} />
      </mesh>
      {/* Lateral derecho */}
      <mesh position={[w / 2 - t / 2, upperStart + upperH / 2, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[t, upperH, upperD]} />
      </mesh>
      {/* Fondo */}
      <mesh position={[0, upperStart + upperH / 2, -d / 2 + t / 2]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[w - t * 2, upperH, t]} />
      </mesh>
      {/* Divisores que enmarcan la campana */}
      <mesh position={[-hoodW / 2 - t / 2, upperStart + upperH / 2, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[t, upperH, upperD]} />
      </mesh>
      <mesh position={[hoodW / 2 + t / 2, upperStart + upperH / 2, upperZ]} material={upperMat} castShadow receiveShadow>
        <boxGeometry args={[t, upperH, upperD]} />
      </mesh>

      {/* ═══════════════════════════════════════
          PUERTAS GABINETES ALTOS — IZQUIERDA
      ═══════════════════════════════════════ */}
      {Array.from({ length: leftN }).map((_, i) => {
        const x = -w / 2 + t + leftDoorW / 2 + i * (leftDoorW + 0.006);
        const fh = upperH - t * 2;
        return (
          <group key={`ul-${i}`} position={[x, upperStart + t + fh / 2, upperFrontZ + 0.009]}>
            <mesh material={upperMat} castShadow receiveShadow>
              <boxGeometry args={[leftDoorW, fh, 0.016]} />
            </mesh>
            <mesh position={[0, -fh / 2 + 0.036, 0.013]} material={handleMat}>
              <boxGeometry args={[leftDoorW * 0.32, 0.010, 0.009]} />
            </mesh>
          </group>
        );
      })}

      {/* ═══════════════════════════════════════
          PUERTAS GABINETES ALTOS — DERECHA
      ═══════════════════════════════════════ */}
      {Array.from({ length: rightN }).map((_, i) => {
        const x = hoodW / 2 + t + rightDoorW / 2 + i * (rightDoorW + 0.006);
        const fh = upperH - t * 2;
        return (
          <group key={`ur-${i}`} position={[x, upperStart + t + fh / 2, upperFrontZ + 0.009]}>
            <mesh material={upperMat} castShadow receiveShadow>
              <boxGeometry args={[rightDoorW, fh, 0.016]} />
            </mesh>
            <mesh position={[0, -fh / 2 + 0.036, 0.013]} material={handleMat}>
              <boxGeometry args={[rightDoorW * 0.32, 0.010, 0.009]} />
            </mesh>
          </group>
        );
      })}

      {/* ═══════════════════════════════════════
          CAMPANA EXTRACTORA
          Panel frontal metálico + cuerpo interior
          + labio inferior con ranura de extracción
      ═══════════════════════════════════════ */}

      {/* Panel frontal (mismo plano que las puertas altas) */}
      <mesh
        position={[0, upperStart + upperH / 2, upperFrontZ + 0.009]}
        material={hoodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hoodW, upperH, 0.016]} />
      </mesh>

      {/* Cuerpo interior de la campana (llena el hueco entre divisores) */}
      <mesh
        position={[0, upperStart + upperH / 2, upperZ]}
        material={hoodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hoodW - t * 2, upperH - t, upperD - t * 2]} />
      </mesh>

      {/* Labio / boca de extracción que asoma por debajo de los gabinetes altos */}
      <mesh
        position={[0, upperStart - 0.055, upperFrontZ + 0.012]}
        material={hoodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hoodW + 0.04, 0.096, upperD * 0.82]} />
      </mesh>

      {/* Tira LED / rejilla inferior (detalle de acabado) */}
      <mesh
        position={[0, upperStart - 0.098, upperFrontZ + 0.02]}
        material-color="#3a3a40"
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hoodW + 0.02, 0.008, 0.028]} />
      </mesh>
    </group>
  );
}
