import type { KitchenModule, ModuleCategory, KitchenModuleType, WallOpening } from "@/types/kitchen";

interface PublicKitchenModule {
  module_type: string;
  category: ModuleCategory;
  label: string;
  height: number;
  width: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
  options: KitchenModule["options"];
}

interface PublicKitchenSharePayload {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[] | null;
  modules: PublicKitchenModule[];
}

export interface PublicKitchenView {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[];
  modules: KitchenModule[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function getPublicKitchenShare(token: string): Promise<PublicKitchenView> {
  const response = await fetch(`${API_URL}/public/kitchen-shares/${token}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error("share_not_found");

  const json: PublicKitchenSharePayload = await response.json();

  return {
    projectName: json.projectName,
    roomWidth: json.roomWidth,
    roomDepth: json.roomDepth,
    ceilingHeight: json.ceilingHeight,
    openings: json.openings ?? [],
    modules: json.modules.map((m, i) => ({
      id: String(i),
      category: m.category,
      type: m.module_type as KitchenModuleType,
      label: m.label,
      dimensions: { height: m.height, width: m.width, depth: m.depth },
      options: m.options,
      x: m.x,
      z: m.z,
      rotation: (m.rotation as 0 | 90 | 180 | 270) ?? 0,
    })),
  };
}
