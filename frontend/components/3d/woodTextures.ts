import * as THREE from "three";
import type { ExteriorTextureId } from "@/types/kitchen";

// Small hand-picked catalog for now — a future ERP screen will let the shop
// register more finishes. Each id below maps to a procedurally-painted
// wood-grain texture (canvas-generated, no image assets needed) rather than a
// flat color, so cabinet fronts read as an actual material instead of a swatch.
export interface WoodTextureDef {
  id: ExteriorTextureId;
  label: string;
  /** Flat approximation used for small UI swatches (color dots, list chips). */
  swatch: string;
}

export const WOOD_TEXTURES: WoodTextureDef[] = [
  { id: "blanco_liso", label: "Blanco liso", swatch: "#f5f2ea" },
  { id: "roble_claro", label: "Roble claro", swatch: "#c8a06c" },
  { id: "nogal_oscuro", label: "Nogal oscuro", swatch: "#5a3a24" },
  { id: "naranja_vibrante", label: "Naranja vibrante", swatch: "#d4761f" },
];

interface GrainParams {
  base: string;
  grain: string;
  stripes: number;
  roughness: number;
}

const GRAIN_PARAMS: Record<ExteriorTextureId, GrainParams> = {
  blanco_liso: { base: "#f7f5f0", grain: "#e6e2d6", stripes: 0, roughness: 0.32 },
  roble_claro: { base: "#caa06e", grain: "#a67c4a", stripes: 16, roughness: 0.55 },
  nogal_oscuro: { base: "#5c3c26", grain: "#3a2515", stripes: 20, roughness: 0.48 },
  naranja_vibrante: { base: "#d97a22", grain: "#af5f13", stripes: 14, roughness: 0.5 },
};

function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, p: GrainParams) {
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);
  if (p.stripes <= 0) return;

  const bandW = w / p.stripes;
  for (let i = 0; i < p.stripes; i++) {
    const cx = i * bandW + bandW / 2;
    ctx.strokeStyle = p.grain;
    ctx.globalAlpha = 0.22 + Math.random() * 0.22;
    ctx.lineWidth = bandW * (0.15 + Math.random() * 0.25);
    ctx.beginPath();
    let x = cx + (Math.random() - 0.5) * bandW * 0.3;
    ctx.moveTo(x, 0);
    const segments = 6;
    for (let s = 1; s <= segments; s++) {
      const y = (h / segments) * s;
      x += (Math.random() - 0.5) * bandW * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Fine secondary lines for grain density
  for (let i = 0; i < p.stripes * 2; i++) {
    ctx.strokeStyle = p.grain;
    ctx.globalAlpha = 0.06 + Math.random() * 0.08;
    ctx.lineWidth = 1;
    const x = Math.random() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 20, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Textures are GPU resources — generated once per id and reused everywhere
// (every door/drawer/panel referencing the same finish shares one instance).
const textureCache = new Map<ExteriorTextureId, THREE.Texture>();

export function getWoodTexture(id: ExteriorTextureId | undefined): THREE.Texture | null {
  if (typeof document === "undefined") return null; // SSR guard, never actually hit (3D tree is client-only)
  const key = id ?? "blanco_liso";
  const cached = textureCache.get(key);
  if (cached) return cached;

  const params = GRAIN_PARAMS[key] ?? GRAIN_PARAMS.blanco_liso;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintGrain(ctx, size, size, params);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getWoodRoughness(id: ExteriorTextureId | undefined): number {
  return (GRAIN_PARAMS[id ?? "blanco_liso"] ?? GRAIN_PARAMS.blanco_liso).roughness;
}
