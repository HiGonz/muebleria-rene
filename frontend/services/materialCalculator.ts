export type FurnitureType = "Closet" | "Escritorio" | "Mueble TV";
export type MaterialKind = "MDF" | "Melamina blanca" | "Melamina nogal" | "Triplay";
export type MaterialUnit = "pzas" | "m²" | "ml" | "pares";

export interface MaterialItem {
  material: string;
  description: string;
  quantity: number;
  unit: MaterialUnit;
  unitCost: number;
  subtotal: number;
}

export interface ProjectConfig {
  type: FurnitureType;
  width: number;
  height: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
  material: MaterialKind;
}

export const materialCosts: Record<string, number> = {
  "MDF 18mm": 180,
  "Melamina blanca 18mm": 210,
  "Melamina nogal 18mm": 245,
  "Triplay 12mm": 195,
  "Canto PVC 0.4mm": 12,
  "Bisagra 35mm": 35,
  "Corredera telescópica 450mm": 95,
  "Tornillo confimát": 2.5,
  "Jalador moderno": 60,
  "Pata metálica": 140,
};

const panelMaterialMap: Record<MaterialKind, string> = {
  MDF: "MDF 18mm",
  "Melamina blanca": "Melamina blanca 18mm",
  "Melamina nogal": "Melamina nogal 18mm",
  Triplay: "Triplay 12mm",
};

function round(value: number) {
  return Number(value.toFixed(2));
}

function exposedPerimeter(width: number, height: number) {
  return 2 * (width + height);
}

export function calculateMaterials(config: ProjectConfig): MaterialItem[] {
  const width = config.width / 100;
  const height = config.height / 100;
  const depth = config.depth / 100;
  const panelMaterial = panelMaterialMap[config.material];
  const panelCost = materialCosts[panelMaterial] ?? 0;
  const items: MaterialItem[] = [];

  const addItem = (material: string, description: string, quantity: number, unit: MaterialUnit, unitCost: number) => {
    if (quantity <= 0) return;
    items.push({
      material,
      description,
      quantity: round(quantity),
      unit,
      unitCost,
      subtotal: round(quantity * unitCost),
    });
  };

  if (config.type === "Closet") {
    const sidePanels = 2 * (height * depth);
    const topBottom = 2 * (width * depth);
    const shelfArea = config.shelves * (Math.max(width - 0.036, 0) * depth);
    const backPanel = width * height;
    const panelArea = (sidePanels + topBottom + shelfArea + backPanel) * 1.1;

    addItem(panelMaterial, "Paneles estructurales 18mm con 10% de desperdicio", panelArea, "m²", panelCost);
    addItem(
      "Canto PVC 0.4mm",
      "Perímetro expuesto de laterales, repisas y frentes con 15% de desperdicio",
      (exposedPerimeter(depth, height) * 2 + exposedPerimeter(Math.max(width - 0.036, 0), depth) * config.shelves) * 1.15,
      "ml",
      materialCosts["Canto PVC 0.4mm"],
    );
    addItem("Bisagra 35mm", "2 bisagras por puerta", config.doors * 2, "pzas", materialCosts["Bisagra 35mm"]);
    addItem("Corredera telescópica 450mm", "1 par por cajón", config.drawers, "pares", materialCosts["Corredera telescópica 450mm"]);
    addItem("Tornillo confimát", "8 tornillos estimados por panel principal", (4 + config.shelves) * 8, "pzas", materialCosts["Tornillo confimát"]);
    addItem("Jalador moderno", "1 jalador por frente visible", config.doors + config.drawers, "pzas", materialCosts["Jalador moderno"]);
  }

  if (config.type === "Escritorio") {
    const top = width * depth;
    const legs = 4 * ((config.height / 100) * 0.08);
    const drawerModule = config.drawers > 0 ? 0.45 * depth : 0;
    const shelfArea = config.shelves > 0 ? width * 0.3 : 0;
    const totalArea = (top + legs + drawerModule + shelfArea) * 1.1;

    addItem(panelMaterial, "Cubierta, costados y módulo lateral", totalArea, "m²", panelCost);
    addItem("Pata metálica", "Juego de patas o soporte metálico", 2, "pares", materialCosts["Pata metálica"]);
    addItem("Corredera telescópica 450mm", "1 par por cajón", config.drawers, "pares", materialCosts["Corredera telescópica 450mm"]);
    addItem("Jalador moderno", "Jaladores de cajón", config.drawers, "pzas", materialCosts["Jalador moderno"]);
    addItem("Tornillo confimát", "Tornillería general de armado", 32 + config.drawers * 8, "pzas", materialCosts["Tornillo confimát"]);
  }

  if (config.type === "Mueble TV") {
    const carcass = 2 * (width * depth) + 2 * ((config.height / 100) * depth);
    const compartments = config.shelves * ((width / Math.max(config.shelves + 1, 1)) * depth);
    const doors = config.doors * ((config.height / 100) * (width / Math.max(config.doors, 1)) * 0.55);
    const totalArea = (carcass + compartments + doors) * 1.1;

    addItem(panelMaterial, "Cuerpo, divisiones y tapas con 10% de desperdicio", totalArea, "m²", panelCost);
    addItem("Canto PVC 0.4mm", "Frentes visibles y divisiones", (width * 6 + depth * 4) * 1.15, "ml", materialCosts["Canto PVC 0.4mm"]);
    addItem("Bisagra 35mm", "2 bisagras por puerta", config.doors * 2, "pzas", materialCosts["Bisagra 35mm"]);
    addItem("Jalador moderno", "Frentes y puertas", config.doors + Math.max(config.drawers, 0), "pzas", materialCosts["Jalador moderno"]);
    addItem("Tornillo confimát", "Tornillería general de armado", 28 + config.shelves * 6, "pzas", materialCosts["Tornillo confimát"]);
  }

  return items;
}

export function quoteTotals(items: MaterialItem[], laborPercentage = 30, profitPercentage = 20) {
  const subtotalMaterials = round(items.reduce((sum, item) => sum + item.subtotal, 0));
  const laborCost = round(subtotalMaterials * (laborPercentage / 100));
  const profitCost = round(subtotalMaterials * (profitPercentage / 100));
  return {
    subtotalMaterials,
    laborPercentage,
    profitPercentage,
    laborCost,
    profitCost,
    total: round(subtotalMaterials + laborCost + profitCost),
  };
}
