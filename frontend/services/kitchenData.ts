import type {
  ModuleCatalogEntry,
  KitchenModule,
  KitchenModuleType,
  ModuleCategory,
  ModuleOptions,
  ModuleDimensions,
  BoardMaterial,
  CountertopMaterial,
  KitchenMaterialLine,
  KitchenQuoteSummary,
  DrawerDef,
  DoorDef,
  KitchenDraft,
  WallOpening,
} from "@/types/kitchen";
import { packSheets, STANDARD_SHEET_WIDTH_CM, STANDARD_SHEET_HEIGHT_CM, type CutPiece } from "./sheetPacking";

// No front — drawer or door — reaches all the way up to the countertop
// underside: a structural rail/apron above the top-most one leaves room for
// mounting hardware. This comes off the whole usable face height before it's
// split between doors and drawers.
const TOP_FACE_MARGIN_CM = 6;

// ─── Resolve effective doors/drawers (mirrors FaceEditor logic) ────────────────
function resolveDoors(mod: KitchenModule): DoorDef[] {
  const { options: o, dimensions: d } = mod;
  if (o.useDetailedLayout && o.doorDefs?.length) return o.doorDefs;
  const count = o.doors || 0;
  if (!count) return [];
  const toeKick = o.hasToeKick ? o.toeKickHeight : 0;
  const ctThick = o.includesCountertop ? o.countertopThickness : 0;
  const usableH = Math.max(d.height - toeKick - ctThick - TOP_FACE_MARGIN_CM, 0);
  const drawerCount = o.drawers || 0;
  const drawerZoneH = drawerCount > 0 ? Math.max(usableH - Math.max(usableH * 0.55, 40), 0) : 0;
  const doorZoneH = usableH - drawerZoneH;
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-dr${i}`, label: `Puerta ${i + 1}`,
    widthPct: doorW, offsetPct: i * doorW,
    fromBottomCm: 0, heightCm: doorZoneH,
    hingeLeft: i % 2 === 0, doorStyle: o.doorStyle,
  }));
}

function resolveDrawers(mod: KitchenModule): DrawerDef[] {
  const { options: o, dimensions: d } = mod;
  if (o.useDetailedLayout && o.drawerDefs?.length) return o.drawerDefs;
  const count = o.drawers || 0;
  if (!count) return [];
  const toeKick = o.hasToeKick ? o.toeKickHeight : 0;
  const ctThick = o.includesCountertop ? o.countertopThickness : 0;
  const usableH = Math.max(d.height - toeKick - ctThick - TOP_FACE_MARGIN_CM, 0);
  const doorCount = o.doors || 0;
  const doorZoneH = doorCount > 0 ? Math.max(usableH * 0.55, 40) : 0;
  const drawerZoneH = Math.max(usableH - doorZoneH, 0);
  const drawerH = drawerZoneH / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-d${i}`, label: `Cajón ${i + 1}`,
    heightCm: drawerH, fromBottomCm: doorZoneH + i * drawerH,
    isGhost: mod.type === "bajo_tarja",
    widthPct: 100, offsetPct: 0, drawerSystem: o.drawerSystem,
  }));
}

// ─── Default Options ───────────────────────────────────────────────────────────
export const DEFAULT_OPTIONS: ModuleOptions = {
  drawers: 0,
  doors: 2,
  shelves: 1,
  pullOutShelves: false,
  hasToeKick: true,
  toeKickHeight: 8,
  hasLegs: false,
  includesCountertop: true,
  countertopMaterial: "Postformado",
  countertopThickness: 3,
  countertopOverhang: 2,
  doorStyle: "Lisa",
  drawerSystem: "Soft-close",
  hardwareFinish: "Acero inoxidable",
  edgeProfile: "PVC 0.4mm",
  mountHeight: 144,
  hasUnderLight: false,
  sinkMaterial: "Acero inoxidable",
  sinkStyle: "Un seno",
  sinkHoles: 1,
  hasBacksplash: false,
  backsplashHeight: 60,
  backsplashMaterial: "Azulejo",
  ovenOpening: false,
  microwaveOpening: false,
  ovenHeight: 60,
  microwaveHeight: 38,
  cornerType: "magic_corner",
  applianceWidth: 60,
  applianceHeight: 85,
  hasVentilation: false,
  stoveType: "4 quemadores",
  hoodType: "Telescópica",
  hoodWidth: 60,
  notes: "",
  // Interior board is fixed shop-wide — not user-configurable (see ModuleInspector).
  boardMaterial: "Melamina blanca 15mm",
  color: "#FFFFFF",
  finish: "Natural",
  exteriorMaterial: "MDF 18mm",
  exteriorColor: "#e8e0d4",
  exteriorFinish: "Natural",
  exteriorTexture: "blanco_liso",
  leftSidePanel: "interior",
  rightSidePanel: "interior",
  useDetailedLayout: false,
  drawerDefs: [],
  doorDefs: [],
  countertopTexture: "ninguna",
};

// ─── Material Costs (MXN per unit) ────────────────────────────────────────────
export const BOARD_COSTS: Record<BoardMaterial, number> = {
  "Melamina blanca 15mm": 185,
  "MDF 15mm": 160,
  "MDF 18mm": 180,
  "Melamina blanca 18mm": 210,
  "Melamina nogal 18mm": 245,
  "Melamina roble 18mm": 230,
  "Melamina wengue 18mm": 255,
  "Triplay 18mm": 195,
  "MDF lacado brillante": 380,
  "MDF lacado mate": 360,
};

export const COUNTERTOP_COSTS: Record<CountertopMaterial, number> = {
  "Postformado": 420,
  "Granito natural": 1800,
  "Granito reconstituido": 1200,
  "Cuarzo engineered": 2200,
  "Mármol": 2500,
  "Acero inoxidable": 1600,
  "Cemento pulido": 800,
  "Corian": 1900,
};

// ─── Countertop models ─────────────────────────────────────────────────────────
// A specific slab a shop actually stocks — name, color and price bundled as one
// pick instead of three independent fields. Small hand-picked starter set for
// now; a real catalog (with its own CRUD screen) would replace this array —
// the rest of the app only depends on the shape, not on it being static.
export interface CountertopModel {
  id: string;
  label: string;
  material: CountertopMaterial;
  color: string;
  pricePerM2: number; // MXN
}

export const COUNTERTOP_MODELS: CountertopModel[] = [
  { id: "postformado_blanco", label: "Postformado Blanco", material: "Postformado", color: "#e8e4dc", pricePerM2: 420 },
  { id: "postformado_arena", label: "Postformado Arena", material: "Postformado", color: "#c8b89a", pricePerM2: 460 },
  { id: "granito_negro_absoluto", label: "Granito Negro Absoluto", material: "Granito natural", color: "#1c1c1c", pricePerM2: 1900 },
  { id: "granito_gris_mara", label: "Granito Gris Mara", material: "Granito natural", color: "#6b6b6b", pricePerM2: 1750 },
  { id: "granito_blanco_dallas", label: "Granito Blanco Dallas", material: "Granito reconstituido", color: "#d8d2c4", pricePerM2: 1250 },
  { id: "cuarzo_blanco_polar", label: "Cuarzo Blanco Polar", material: "Cuarzo engineered", color: "#f0ede6", pricePerM2: 2300 },
  { id: "cuarzo_gris_urbano", label: "Cuarzo Gris Urbano", material: "Cuarzo engineered", color: "#9a9a94", pricePerM2: 2250 },
  { id: "marmol_carrara", label: "Mármol Carrara", material: "Mármol", color: "#eeeae2", pricePerM2: 2600 },
  { id: "acero_inoxidable_satin", label: "Acero Inoxidable Satinado", material: "Acero inoxidable", color: "#b8bcbe", pricePerM2: 1650 },
  { id: "cemento_pulido_gris", label: "Cemento Pulido Gris", material: "Cemento pulido", color: "#918f8a", pricePerM2: 820 },
  { id: "corian_blanco_hielo", label: "Corian Blanco Hielo", material: "Corian", color: "#f2ede2", pricePerM2: 1950 },
];

export function getCountertopModel(id: string | undefined): CountertopModel | undefined {
  return COUNTERTOP_MODELS.find((m) => m.id === id);
}

// A specific model's price takes over from the generic per-material rate —
// same idea as an exterior texture overriding a flat color, just for cost too.
function resolveCountertopCost(o: ModuleOptions): { label: string; cost: number } {
  const model = getCountertopModel(o.countertopModel);
  if (model) return { label: model.label, cost: model.pricePerM2 };
  return { label: o.countertopMaterial, cost: COUNTERTOP_COSTS[o.countertopMaterial] ?? 420 };
}

// Cost per unit for hardware
export const HARDWARE_COSTS = {
  bisagra_simple: 35,
  bisagra_amortiguada: 65,
  corredera_simple: 95,
  corredera_extraccion: 145,
  corredera_softclose: 130,
  jaladera_barra_acero: 85,
  jaladera_gota: 75,
  pata_metalica: 140,
  tornillo_confirmat: 2.5,
  canto_pvc_04: 12,
  canto_pvc_2mm: 18,
};

// ─── Module Catalog ────────────────────────────────────────────────────────────
export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  // ── MUEBLES BAJOS ──────────────────────────────────────────────────────────
  {
    type: "cajonera",
    category: "lower",
    label: "Cajonera",
    description: "Mueble con múltiples cajones para almacenaje ordenado",
    icon: "🗄️",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 4, doors: 0, shelves: 0, doorStyle: "Sin puerta", drawerSystem: "Soft-close" },
    configurableFields: ["height", "width", "depth", "drawers", "drawerSystem", "hasToeKick", "toeKickHeight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "bajo_tarja",
    category: "lower",
    label: "Mueble para tarja",
    description: "Mueble bajo con espacio para la tarja y plomería",
    icon: "🚿",
    defaultDimensions: { height: 82, width: 90, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 0, includesCountertop: true },
    configurableFields: ["height", "width", "depth", "doors", "doorStyle", "sinkStyle", "sinkMaterial", "sinkHoles", "includesCountertop", "countertopMaterial", "boardMaterial", "color"],
  },
  {
    type: "bajo_estufa",
    category: "lower",
    label: "Mueble para estufa",
    description: "Mueble bajo con espacio reforzado para estufa empotrable",
    icon: "🔥",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 1, doors: 2, shelves: 0, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "bajo_parrilla",
    category: "lower",
    label: "Mueble para parrilla",
    description: "Mueble base reforzado para parrilla de asador",
    icon: "🍖",
    defaultDimensions: { height: 82, width: 80, depth: 65 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, hasVentilation: true, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "doors", "doorStyle", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "bajo_horno_empotrable",
    category: "lower",
    label: "Mueble para horno empotrable",
    description: "Nicho de mueble bajo para horno empotrable con extracción de calor",
    icon: "🥧",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 1, doors: 0, shelves: 0, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "drawers", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "esquinero_inferior",
    category: "lower",
    label: "Esquinero inferior",
    description: "Solución de esquina con acceso giratorio o magic corner",
    icon: "📐",
    defaultDimensions: { height: 82, width: 90, depth: 90 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, cornerType: "magic_corner" },
    configurableFields: ["height", "width", "depth", "cornerType", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_puertas",
    category: "lower",
    label: "Gabinete bajo con puertas",
    description: "Mueble bajo estándar con una o dos puertas y repisas interiores",
    icon: "🗃️",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 2, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_cajones",
    category: "lower",
    label: "Gabinete bajo con cajones",
    description: "Mueble bajo con cajones y puerta inferior combinados",
    icon: "🧰",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 2, doors: 2, shelves: 0, drawerSystem: "Soft-close" },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "drawerSystem", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "botellero_extraible",
    category: "lower",
    label: "Botellero extraíble",
    description: "Accesorio interior extraíble para botellas",
    icon: "🍷",
    defaultDimensions: { height: 82, width: 30, depth: 55 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 0, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "boardMaterial", "color"],
  },
  {
    type: "despensero_bajo",
    category: "lower",
    label: "Despensero bajo",
    description: "Mueble alto de piso con múltiples repisas y puertas para despensa",
    icon: "🥫",
    defaultDimensions: { height: 82, width: 45, depth: 55 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 4, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "bajo_lavavajillas",
    category: "lower",
    label: "Mueble para lavavajillas",
    description: "Hueco estándar para lavavajillas empotrable con panel frontal",
    icon: "🍽️",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, applianceWidth: 60, applianceHeight: 82 },
    configurableFields: ["height", "width", "depth", "applianceWidth", "boardMaterial", "color"],
  },
  {
    type: "base_refrigerador",
    category: "lower",
    label: "Mueble para refrigerador (base)",
    description: "Base elevada y nichos laterales para refrigerador",
    icon: "🧊",
    defaultDimensions: { height: 20, width: 90, depth: 65 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color"],
  },

  // ── MUEBLES ALTOS ──────────────────────────────────────────────────────────
  {
    type: "alacena_aerea",
    category: "upper",
    label: "Alacena aérea",
    description: "Gabinete aéreo estándar con repisas y puertas",
    icon: "🗂️",
    defaultDimensions: { height: 72, width: 60, depth: 35 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 2, mountHeight: 144, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "boardMaterial", "color"],
  },
  {
    type: "gabinete_superior",
    category: "upper",
    label: "Gabinete superior",
    description: "Gabinete aéreo de mayor capacidad",
    icon: "📦",
    defaultDimensions: { height: 90, width: 60, depth: 35 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 3, mountHeight: 144, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "esquinero_superior",
    category: "upper",
    label: "Esquinero superior",
    description: "Solución de esquina aérea con puertas angulares o abatibles",
    icon: "📐",
    defaultDimensions: { height: 72, width: 90, depth: 35 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 2, mountHeight: 144, cornerType: "diagonal" },
    configurableFields: ["height", "width", "depth", "shelves", "cornerType", "mountHeight", "boardMaterial", "color"],
  },
  {
    type: "campanero",
    category: "upper",
    label: "Campanero",
    description: "Mueble aéreo para ocultar la campana extractora con diseño integrado",
    icon: "🔔",
    defaultDimensions: { height: 90, width: 90, depth: 35 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, mountHeight: 144 },
    configurableFields: ["height", "width", "depth", "mountHeight", "boardMaterial", "color"],
  },
  {
    type: "alacena_cristal",
    category: "upper",
    label: "Alacena con puertas de cristal",
    description: "Gabinete aéreo con puertas de vidrio para exhibición",
    icon: "🪟",
    defaultDimensions: { height: 72, width: 60, depth: 35 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 2, mountHeight: 144, doorStyle: "Vidrio transparente" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "boardMaterial", "color"],
  },
  {
    type: "despensero_alto",
    category: "upper",
    label: "Despensero alto",
    description: "Mueble aéreo alto con múltiples repisas para despensa",
    icon: "🥫",
    defaultDimensions: { height: 90, width: 45, depth: 35 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 5, mountHeight: 144, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "boardMaterial", "color"],
  },
  {
    type: "gabinete_microondas",
    category: "upper",
    label: "Gabinete para microondas",
    description: "Gabinete aéreo con hueco dedicado para microondas empotrable",
    icon: "📡",
    defaultDimensions: { height: 60, width: 60, depth: 40 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, mountHeight: 130, microwaveOpening: true, microwaveHeight: 38 },
    configurableFields: ["height", "width", "depth", "mountHeight", "microwaveHeight", "boardMaterial", "color"],
  },

  // ── TORRES ─────────────────────────────────────────────────────────────────
  {
    type: "torre_horno_microondas",
    category: "tower",
    label: "Torre para horno y microondas",
    description: "Torre alta con nichos para horno empotrable y microondas apilados",
    icon: "🏗️",
    defaultDimensions: { height: 220, width: 60, depth: 60 },
    defaultOptions: { ovenOpening: true, microwaveOpening: true, ovenHeight: 60, microwaveHeight: 38, doors: 2, shelves: 2 },
    configurableFields: ["height", "width", "depth", "ovenOpening", "ovenHeight", "microwaveOpening", "microwaveHeight", "doors", "shelves", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_despensa",
    category: "tower",
    label: "Torre despensa",
    description: "Torre alta con repisas ajustables y puertas para gran capacidad",
    icon: "🗼",
    defaultDimensions: { height: 220, width: 45, depth: 60 },
    defaultOptions: { drawers: 0, doors: 4, shelves: 6, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "drawerSystem", "boardMaterial", "color"],
  },
  {
    type: "torre_despensa_jalable",
    category: "tower",
    label: "Torre despensa (puerta jalable)",
    description: "Despensero de puerta única cuyos estantes se jalan junto con la puerta al abrir, para acceso total sin agacharse",
    icon: "🚪",
    defaultDimensions: { height: 220, width: 40, depth: 55 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 5, doorStyle: "Lisa", pullOutShelves: true },
    configurableFields: ["height", "width", "depth", "shelves", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_refrigerador",
    category: "tower",
    label: "Torre refrigerador",
    description: "Columna de nichos laterales y superiores que enmarcan el refrigerador",
    icon: "🧊",
    defaultDimensions: { height: 220, width: 120, depth: 65 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 2 },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_almacenamiento",
    category: "tower",
    label: "Torre de almacenamiento",
    description: "Torre modular multipropósito con cajones y repisas",
    icon: "🏛️",
    defaultDimensions: { height: 220, width: 60, depth: 60 },
    defaultOptions: { drawers: 2, doors: 2, shelves: 3, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "drawers", "shelves", "doors", "doorStyle", "drawerSystem", "boardMaterial", "color"],
  },

  // ── ENCIMERAS ──────────────────────────────────────────────────────────────
  {
    type: "cubierta",
    category: "countertop",
    label: "Cubierta",
    description: "Encimera estándar sobre muebles bajos",
    icon: "🟫",
    defaultDimensions: { height: 3, width: 60, depth: 62 },
    defaultOptions: { includesCountertop: true, countertopMaterial: "Postformado", countertopThickness: 3, countertopOverhang: 2, hasBacksplash: false },
    configurableFields: ["width", "depth", "countertopMaterial", "countertopThickness", "countertopOverhang", "hasBacksplash", "backsplashHeight", "backsplashMaterial", "edgeProfile"],
  },
  {
    type: "barra_desayunadora",
    category: "countertop",
    label: "Barra desayunadora",
    description: "Extensión de cubierta en barra para sillas altas",
    icon: "🍳",
    defaultDimensions: { height: 90, width: 120, depth: 40 },
    defaultOptions: { countertopMaterial: "Cuarzo engineered", countertopThickness: 3, countertopOverhang: 30, hasBacksplash: false },
    configurableFields: ["height", "width", "depth", "countertopMaterial", "countertopThickness", "edgeProfile", "boardMaterial", "color"],
  },
  {
    type: "isla_central",
    category: "countertop",
    label: "Isla central",
    description: "Módulo central independiente con muebles a los cuatro lados",
    icon: "🏝️",
    defaultDimensions: { height: 90, width: 180, depth: 90 },
    defaultOptions: { drawers: 4, doors: 4, shelves: 2, countertopMaterial: "Cuarzo engineered", includesCountertop: true },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "shelves", "countertopMaterial", "edgeProfile", "boardMaterial", "color"],
  },
  {
    type: "peninsula",
    category: "countertop",
    label: "Península",
    description: "Extensión en L unida a la cocina con acceso desde tres lados",
    icon: "↩️",
    defaultDimensions: { height: 90, width: 120, depth: 70 },
    defaultOptions: { drawers: 2, doors: 2, shelves: 1, countertopMaterial: "Cuarzo engineered", includesCountertop: true },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "shelves", "countertopMaterial", "edgeProfile", "boardMaterial", "color"],
  },
  {
    type: "cubierta_tarja",
    category: "countertop",
    label: "Cubierta para tarja",
    description: "Encimera con corte para tarja empotrada",
    icon: "💧",
    defaultDimensions: { height: 3, width: 90, depth: 62 },
    defaultOptions: { countertopMaterial: "Granito natural", sinkStyle: "Un seno", sinkMaterial: "Acero inoxidable", sinkHoles: 1 },
    configurableFields: ["width", "depth", "countertopMaterial", "sinkStyle", "sinkMaterial", "sinkHoles", "edgeProfile"],
  },
  {
    type: "cubierta_parrilla",
    category: "countertop",
    label: "Cubierta para parrilla",
    description: "Encimera con corte para parrilla empotrable",
    icon: "🔥",
    defaultDimensions: { height: 3, width: 80, depth: 65 },
    defaultOptions: { countertopMaterial: "Acero inoxidable", countertopThickness: 2 },
    configurableFields: ["width", "depth", "countertopMaterial", "edgeProfile"],
  },

  // ── ESPACIOS ELECTRODOMÉSTICOS ─────────────────────────────────────────────
  {
    type: "nicho_refrigerador",
    category: "appliance",
    label: "Nicho para refrigerador",
    description: "Espacio libre con acabados laterales y superior para refrigerador",
    icon: "🧊",
    defaultDimensions: { height: 190, width: 90, depth: 70 },
    defaultOptions: { applianceWidth: 90, applianceHeight: 185, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "applianceWidth", "applianceHeight", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "nicho_microondas",
    category: "appliance",
    label: "Nicho para microondas",
    description: "Hueco empotrado a media altura para microondas",
    icon: "📡",
    defaultDimensions: { height: 45, width: 60, depth: 40 },
    defaultOptions: { applianceWidth: 55, applianceHeight: 38, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "applianceWidth", "applianceHeight", "boardMaterial", "color"],
  },
  {
    type: "nicho_horno",
    category: "appliance",
    label: "Nicho para horno",
    description: "Nicho empotrable para horno con extracción de calor",
    icon: "🥧",
    defaultDimensions: { height: 65, width: 60, depth: 60 },
    defaultOptions: { applianceWidth: 60, applianceHeight: 60, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "applianceWidth", "applianceHeight", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "espacio_lavavajillas",
    category: "appliance",
    label: "Espacio para lavavajillas",
    description: "Hueco estándar con panel frontal para lavavajillas integrado",
    icon: "🍽️",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { applianceWidth: 60, applianceHeight: 82 },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color"],
  },
  {
    type: "espacio_centro_bebidas",
    category: "appliance",
    label: "Espacio para centro de bebidas",
    description: "Nicho refrigerado para mini bar o centro de bebidas",
    icon: "🥂",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { applianceWidth: 60, applianceHeight: 82, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "espacio_cava_vinos",
    category: "appliance",
    label: "Espacio para cava de vinos",
    description: "Nicho con temperatura controlada para cava de vinos",
    icon: "🍾",
    defaultDimensions: { height: 82, width: 45, depth: 55 },
    defaultOptions: { applianceWidth: 45, applianceHeight: 82, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "hasVentilation", "boardMaterial", "color"],
  },

  // ── ACCESORIOS ─────────────────────────────────────────────────────────────
  {
    type: "tarja",
    category: "accessory",
    label: "Tarja",
    description: "Tarja de fregadero con senos y llave mezcladora",
    icon: "🚰",
    defaultDimensions: { height: 20, width: 80, depth: 50 },
    defaultOptions: { sinkStyle: "Un seno", sinkMaterial: "Acero inoxidable", sinkHoles: 1 },
    configurableFields: ["width", "depth", "sinkStyle", "sinkMaterial", "sinkHoles"],
  },
  {
    type: "parrilla",
    category: "accessory",
    label: "Parrilla",
    description: "Parrilla de asador para exteriores o área de BBQ",
    icon: "🍖",
    defaultDimensions: { height: 20, width: 70, depth: 55 },
    defaultOptions: { stoveType: "5 quemadores" },
    configurableFields: ["width", "depth", "stoveType"],
  },
  {
    type: "estufa",
    category: "accessory",
    label: "Estufa",
    description: "Estufa de piso independiente con horno — se deja un hueco entre muebles y se coloca sola, como es costumbre en México",
    icon: "🔥",
    defaultDimensions: { height: 85, width: 60, depth: 60 },
    defaultOptions: { stoveType: "4 quemadores", color: "#e8e8e8" },
    configurableFields: ["height", "width", "depth", "stoveType", "color"],
  },
  {
    type: "refrigerador",
    category: "accessory",
    label: "Refrigerador",
    description: "Refrigerador independiente de dos puertas",
    icon: "🧊",
    defaultDimensions: { height: 178, width: 90, depth: 70 },
    defaultOptions: { color: "#c9cdd1" },
    configurableFields: ["height", "width", "depth", "color"],
  },
  {
    type: "microondas",
    category: "accessory",
    label: "Microondas",
    description: "Horno de microondas de contra",
    icon: "📡",
    defaultDimensions: { height: 30, width: 50, depth: 40 },
    defaultOptions: { color: "#2a2a2a" },
    configurableFields: ["height", "width", "depth", "color"],
  },
  {
    type: "lavavajillas",
    category: "accessory",
    label: "Lavavajillas",
    description: "Lavavajillas empotrable bajo cubierta",
    icon: "🍽️",
    defaultDimensions: { height: 82, width: 60, depth: 60 },
    defaultOptions: { color: "#c8c8c8" },
    configurableFields: ["height", "width", "depth", "color"],
  },
  {
    type: "campana_extractora",
    category: "accessory",
    label: "Campana extractora",
    description: "Campana de cocina con sistema de extracción de humos",
    icon: "💨",
    defaultDimensions: { height: 50, width: 60, depth: 50 },
    defaultOptions: { hoodType: "Decorativa", hoodWidth: 60 },
    configurableFields: ["height", "width", "depth", "hoodType", "hoodWidth"],
  },
  {
    type: "herrajes",
    category: "accessory",
    label: "Herrajes",
    description: "Jaladores, bisagras y herrajes adicionales",
    icon: "🔩",
    defaultDimensions: { height: 1, width: 1, depth: 1 },
    defaultOptions: { hardwareFinish: "Acero inoxidable" },
    configurableFields: ["hardwareFinish"],
  },
  {
    type: "zoclo",
    category: "accessory",
    label: "Zoclo",
    description: "Zoclo corrido a lo largo de los muebles bajos",
    icon: "▬",
    defaultDimensions: { height: 8, width: 60, depth: 2 },
    defaultOptions: { boardMaterial: "MDF 18mm", color: "#e8e0d4" },
    configurableFields: ["height", "width", "boardMaterial", "color"],
  },
  {
    type: "panel_lateral",
    category: "accessory",
    label: "Panel lateral",
    description: "Panel decorativo para rematar laterales de muebles",
    icon: "🔲",
    defaultDimensions: { height: 82, width: 1, depth: 60 },
    defaultOptions: { boardMaterial: "Melamina blanca 18mm", color: "#e8e0d4" },
    configurableFields: ["height", "depth", "boardMaterial", "color"],
  },
  {
    type: "panel_remate",
    category: "accessory",
    label: "Panel de remate",
    description: "Panel decorativo de remate en paredes o esquinas",
    icon: "🔳",
    defaultDimensions: { height: 82, width: 30, depth: 1.8 },
    defaultOptions: { boardMaterial: "Melamina blanca 18mm", color: "#e8e0d4" },
    configurableFields: ["height", "width", "boardMaterial", "color"],
  },
  {
    type: "panel_decorativo",
    category: "accessory",
    label: "Panel decorativo",
    description: "Panel de acabado con textura o diseño",
    icon: "🎨",
    defaultDimensions: { height: 82, width: 60, depth: 1.8 },
    defaultOptions: { boardMaterial: "MDF lacado brillante", color: "#ffffff", finish: "Lacado brillante" },
    configurableFields: ["height", "width", "boardMaterial", "color", "finish"],
  },
  {
    type: "organizador_especias",
    category: "accessory",
    label: "Organizador de especias",
    description: "Accesorio interior tipo pull-out para especias",
    icon: "🌿",
    defaultDimensions: { height: 60, width: 15, depth: 45 },
    defaultOptions: {},
    configurableFields: ["height", "width"],
  },
  {
    type: "cubertero",
    category: "accessory",
    label: "Cubertero",
    description: "Organizador interior de cajón para cubiertos",
    icon: "🍴",
    defaultDimensions: { height: 5, width: 45, depth: 45 },
    defaultOptions: {},
    configurableFields: ["width", "depth"],
  },
  {
    type: "basurero_extraible",
    category: "accessory",
    label: "Basurero extraíble",
    description: "Sistema de cubetas extraíbles dentro de mueble bajo",
    icon: "🗑️",
    defaultDimensions: { height: 50, width: 30, depth: 45 },
    defaultOptions: { doors: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "boardMaterial", "color"],
  },
];

// ─── Helper Functions ──────────────────────────────────────────────────────────
export function getCatalogEntry(type: KitchenModuleType): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((entry) => entry.type === type);
}

export function getModulesByCategory(category: ModuleCategory): ModuleCatalogEntry[] {
  return MODULE_CATALOG.filter((entry) => entry.category === category);
}

// ─── Sample kitchen (demo draft) ────────────────────────────────────────────────
// A single-wall run along the north wall (base + countertop + upper cabinets,
// a tall pantry tower, sink/stove accessories and an extractor hood) plus a
// freestanding island, three windows and a door — used by the "Cocina de
// muestra" button so a first-time user sees a fully furnished room instead of
// an empty one.
export function buildSampleKitchen(): KitchenDraft {
  const modules: KitchenModule[] = [];
  const add = (type: KitchenModuleType, x: number, z: number, patch?: { dimensions?: Partial<ModuleDimensions>; options?: Partial<ModuleOptions>; rotation?: KitchenModule["rotation"] }) => {
    const mod = buildNewModule(type, x, z, patch?.rotation ?? 0);
    modules.push({
      ...mod,
      dimensions: patch?.dimensions ? { ...mod.dimensions, ...patch.dimensions } : mod.dimensions,
      options: patch?.options ? { ...mod.options, ...patch.options } : mod.options,
    });
  };

  // North-wall run (back against z=0), left to right: pantry tower, base
  // cabinets, sink, stove, more base cabinets — widths sum to roomWidth (480).
  // No separate "cubierta" modules: every base cabinet below already renders
  // its own built-in countertop slab (options.includesCountertop, true by
  // default), so a continuous counter comes for free without stacking a
  // second overlapping slab on top.
  // Leftmost unit is the pull-out larder tower — same footprint as the plain
  // torre_despensa it replaces (width pinned to 45 so the run still sums to
  // roomWidth) but its single door pulls the shelves out with it.
  add("torre_despensa_jalable", 22.5, 30, { dimensions: { width: 45 } });
  add("gabinete_bajo_puertas", 75, 30);
  add("cajonera", 135, 30);
  add("bajo_tarja", 210, 30);
  // No "bajo_estufa" cabinet here — as is customary in Mexican kitchens, the
  // run just leaves a 60cm gap and the freestanding "estufa" below (with its
  // own floor-to-counter body) drops straight into it.
  add("gabinete_bajo_cajones", 345, 30);
  add("gabinete_bajo_puertas", 405, 30);
  add("despensero_bajo", 457.5, 27.5);

  // Upper cabinets — a gap is left over the sink (165–240) for the window
  add("alacena_aerea", 75, 17.5);
  add("gabinete_superior", 135, 17.5);
  add("alacena_cristal", 345, 17.5);
  add("gabinete_superior", 405, 17.5);
  add("despensero_alto", 457.5, 17.5);

  // Sink and the freestanding stove/oven filling the gap left in the run
  // above, plus a standalone factory-style extractor hood (no housing
  // cabinet — see the campana_extractora mesh for the hood's own look)
  add("tarja", 210, 31);
  add("estufa", 285, 30);
  add("campana_extractora", 285, 17.5, { options: { mountHeight: 150 } });

  // Freestanding island
  add("isla_central", 240, 190);

  // West wall — turns the room into an L-shape: a small cabinet under the
  // window with a countertop microwave on top, a dishwasher beside it, and
  // a standalone fridge finishing the run. Rotation 90 backs each against
  // the west wall (x = 0) instead of the north one.
  add("gabinete_bajo_puertas", 30, 95, { rotation: 90, options: { leftSidePanel: "exterior", rightSidePanel: "exterior" } });
  add("microondas", 30, 95, { rotation: 90 });
  add("lavavajillas", 30, 175, { rotation: 90 });
  add("refrigerador", 35, 260, { rotation: 90 });

  const openings: WallOpening[] = [
    { id: "sample_win_north", type: "window", wall: "north", offset: 202.5, width: 70, height: 100, sillHeight: 95 },
    { id: "sample_win_east", type: "window", wall: "east", offset: 160, width: 100, height: 140, sillHeight: 90 },
    { id: "sample_win_west", type: "window", wall: "west", offset: 100, width: 90, height: 120, sillHeight: 90 },
    { id: "sample_door_south", type: "door", wall: "south", offset: 240, width: 90, height: 205, sillHeight: 0 },
  ];

  return {
    clientName: "Familia Rodríguez",
    clientPhone: "871 123 4567",
    projectName: "Cocina de muestra",
    notes: "Diseño de ejemplo generado automáticamente para mostrar el constructor 3D.",
    roomWidth: 480,
    roomDepth: 320,
    ceilingHeight: 240,
    modules,
    openings,
    editingModuleId: null,
  };
}

export function buildNewModule(type: KitchenModuleType, x = 0, z = 0, rotation: KitchenModule["rotation"] = 0): KitchenModule {
  const entry = getCatalogEntry(type)!;
  // A countertop only makes sense at counter height: wall-mounted (aéreo)
  // pieces and floor-to-ceiling towers don't have a sensible "top" for one,
  // so they default it off — while still letting a catalog entry's own
  // explicit includesCountertop (spread after this) win either way.
  const smartDefaults: Partial<ModuleOptions> =
    entry.category === "upper" || entry.defaultDimensions.height > 120 ? { includesCountertop: false } : {};
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: entry.category,
    type,
    label: entry.label,
    dimensions: { ...entry.defaultDimensions },
    options: { ...DEFAULT_OPTIONS, ...smartDefaults, ...entry.defaultOptions },
    x,
    z,
    rotation,
  };
}

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  lower: "Muebles bajos",
  upper: "Muebles altos",
  tower: "Torres",
  countertop: "Encimeras",
  appliance: "Electrodomésticos",
  accessory: "Accesorios",
};

export const CATEGORY_ICONS: Record<ModuleCategory, string> = {
  lower: "🗄️",
  upper: "📦",
  tower: "🏗️",
  countertop: "🟫",
  appliance: "⚡",
  accessory: "🔩",
};

// ─── Material Calculator for Kitchen ──────────────────────────────────────────
export function calculateKitchenMaterials(modules: KitchenModule[]): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
  const lines: KitchenMaterialLine[] = [];

  const addLine = (
    desc: string,
    qty: number,
    unit: string,
    unitCost: number,
    extra?: Partial<Pick<KitchenMaterialLine, "category" | "cutDetails" | "cutLayout" | "subLines">>,
  ) => {
    if (qty <= 0) return;
    lines.push({ description: desc, quantity: parseFloat(qty.toFixed(3)), unit, unitCost, subtotal: parseFloat((qty * unitCost).toFixed(2)), ...extra });
  };

  // Hardware (bisagras, correderas, etc.) is tallied by TYPE across the whole
  // project instead of one line per module — grouped into a single "Herrajes"
  // line with a sub-item per type once there's more than one type present.
  const hardwareAgg = new Map<string, { label: string; quantity: number; unit: string; subtotal: number }>();
  const addHardware = (key: string, label: string, qty: number, unit: string, unitCost: number) => {
    if (qty <= 0) return;
    const cur = hardwareAgg.get(key) ?? { label, quantity: 0, unit, subtotal: 0 };
    cur.quantity += qty;
    cur.subtotal += qty * unitCost;
    hardwareAgg.set(key, cur);
  };

  // Board panels are pooled per material across the WHOLE project — not per
  // module — because a real cutting shop nests the entire job's cut list
  // together, so offcuts from one module's panel can still get reused by
  // another module in the same board material. Interior board (carcass:
  // top/bottom/back/shelves/drawer boxes) and exterior board (doors/drawer
  // fronts, and any side panel manually marked "exterior") are pooled
  // separately since they come from different sheets/finishes.
  const interiorPieces = new Map<BoardMaterial, CutPiece[]>();
  const exteriorPieces = new Map<BoardMaterial, CutPiece[]>();
  const boardPools = { Interior: interiorPieces, Exterior: exteriorPieces } as const;
  // Per-(pool, material, part, exact width×height) aggregation so the quote can
  // show exactly which cuts to make ("2 de 60×82cm, 4 de 45×30cm...") under each
  // sheet line, not just a total piece count.
  const partPieces = new Map<string, { pool: keyof typeof boardPools; material: BoardMaterial; part: string; width: number; height: number; count: number }>();
  const addPiece = (poolLabel: keyof typeof boardPools, material: BoardMaterial, width: number, height: number, part: string) => {
    if (width <= 0 || height <= 0) return;
    const pool = boardPools[poolLabel];
    const list = pool.get(material) ?? [];
    list.push({ width, height, label: part });
    pool.set(material, list);

    // Round to 1mm so near-identical floating point sizes (e.g. from percentage
    // splits) still group into the same cut-size bucket.
    const w = Math.round(width * 10) / 10;
    const h = Math.round(height * 10) / 10;
    const key = `${poolLabel}|${material}|${part}|${w}x${h}`;
    const agg = partPieces.get(key) ?? { pool: poolLabel, material, part, width: w, height: h, count: 0 };
    agg.count += 1;
    partPieces.set(key, agg);
  };
  // Standard board thickness (cm) used to size the drawer box's inner width
  // (between its two side panels) — matches the 1.8cm (18mm) used in the 3D preview.
  const BOARD_THICKNESS_CM = 1.8;
  // The box (sides/back/inner front) sits shorter than the visible exterior face:
  // the face overlays the gap needed above/below the box for slide adjustment.
  const DRAWER_BOX_HEIGHT_CLEARANCE_CM = 1;

  for (const mod of modules) {
    const { dimensions: d, options: o } = mod;
    const w = d.width / 100;
    const dp = d.depth / 100;

    if (mod.category === "lower" || mod.category === "upper" || mod.category === "tower") {
      // Structural carcass panels — always interior board (dimensions in cm)
      addPiece("Interior", o.boardMaterial, d.width, d.depth, "Tapas y bases");  // top
      addPiece("Interior", o.boardMaterial, d.width, d.depth, "Tapas y bases");  // bottom
      addPiece("Interior", o.boardMaterial, d.width, d.height, "Respaldo");      // back
      for (let i = 0; i < o.shelves; i++) addPiece("Interior", o.boardMaterial, d.width, d.depth, "Repisas");

      // Side panels — manual per-module choice: skip, or route to interior/exterior pool
      if (o.leftSidePanel !== "ninguno") {
        const poolLabel = o.leftSidePanel === "exterior" ? "Exterior" : "Interior";
        const material = o.leftSidePanel === "exterior" ? o.exteriorMaterial : o.boardMaterial;
        addPiece(poolLabel, material, d.depth, d.height, poolLabel === "Exterior" ? "Costados (acabado)" : "Costados");
      }
      if (o.rightSidePanel !== "ninguno") {
        const poolLabel = o.rightSidePanel === "exterior" ? "Exterior" : "Interior";
        const material = o.rightSidePanel === "exterior" ? o.exteriorMaterial : o.boardMaterial;
        addPiece(poolLabel, material, d.depth, d.height, poolLabel === "Exterior" ? "Costados (acabado)" : "Costados");
      }

      // ── Doors — always exterior board (visible face); use detailed defs when available ──
      const doors = resolveDoors(mod);
      for (const door of doors) {
        addPiece("Exterior", o.exteriorMaterial, (door.widthPct / 100) * d.width, door.heightCm, "Puertas");
      }
      if (doors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
        addHardware("bisagra", "Bisagras", doors.length, "pares", hingeCost);
      }

      // ── Drawers have a DOUBLE front: an inner structural front in interior board
      // (screwed directly to the box, same material as the carcass) plus the visible
      // decorative front in exterior board on top of it. The box itself (sides, back,
      // bottom) is also interior board. Ghost drawers (visual-only fronts, e.g. under
      // a sink) are just a single fake exterior panel — no box, no inner front, no correderas.
      const drawers = resolveDrawers(mod);
      const realDrawers = drawers.filter((d) => !d.isGhost);
      const ghostDrawers = drawers.filter((d) => d.isGhost);
      for (const drawer of [...realDrawers, ...ghostDrawers]) {
        addPiece("Exterior", o.exteriorMaterial, (drawer.widthPct / 100) * d.width, drawer.heightCm, "Cajones (frente exterior)");
      }
      for (const drawer of realDrawers) {
        const faceW = (drawer.widthPct / 100) * d.width;
        const faceH = drawer.heightCm;
        const boxW = Math.max(faceW - 2 * BOARD_THICKNESS_CM, 0); // inner width between the two side panels
        const boxD = Math.max(d.depth - 10, 0);                   // set back 10cm so there's free space behind the drawer
        const boxH = Math.max(faceH - DRAWER_BOX_HEIGHT_CLEARANCE_CM, 0); // box is shorter than the face
        addPiece("Interior", o.boardMaterial, boxW, boxH, "Cajones (frente interior)");     // inner front, behind the exterior face — same width as the box, not the outer face
        addPiece("Interior", o.boardMaterial, boxD, boxH, "Cajones (costado)");             // side 1
        addPiece("Interior", o.boardMaterial, boxD, boxH, "Cajones (costado)");             // side 2
        addPiece("Interior", o.boardMaterial, boxW, boxH, "Cajones (trasero)");             // back
        addPiece("Interior", o.boardMaterial, boxW, boxD, "Cajones (fondo)");                // bottom
      }
      if (realDrawers.length > 0) {
        addHardware("corredera", "Correderas", realDrawers.length, "pares", HARDWARE_COSTS.corredera_softclose);
      }

      // Edge banding
      const edgeMl = 2 * (d.width + d.height + d.depth) / 100 * 1.15;
      addLine(`[${mod.label}] Canto ${o.edgeProfile}`, edgeMl, "ml", 12, { category: "edge" });

      // Countertop — lower cabinets have one on by default; upper/tower can
      // still carry one if the user explicitly toggles it on in the inspector.
      if (o.includesCountertop) {
        const { label, cost } = resolveCountertopCost(o);
        addLine(`[${mod.label}] Cubierta ${label}`, w * (dp + o.countertopOverhang / 100), "m²", cost, { category: "countertop" });
      }
    } else if (mod.category === "countertop") {
      const { label, cost } = resolveCountertopCost(o);
      addLine(`[${mod.label}] ${label}`, w * (dp + o.countertopOverhang / 100), "m²", cost, { category: "countertop" });
      if (o.hasBacksplash) addLine(`[${mod.label}] Salpicadero ${o.backsplashMaterial}`, w * (o.backsplashHeight / 100), "m²", 350, { category: "countertop" });
    }
  }

  // ── Hardware — grouped into one "Herrajes" line once there's more than one
  // type; a single type is shown directly without the group wrapper.
  const hardwareEntries = Array.from(hardwareAgg.values());
  if (hardwareEntries.length === 1) {
    const h = hardwareEntries[0];
    addLine(h.label, h.quantity, h.unit, h.subtotal / h.quantity, { category: "hardware" });
  } else if (hardwareEntries.length > 1) {
    const totalQty = hardwareEntries.reduce((s, h) => s + h.quantity, 0);
    const totalSubtotal = hardwareEntries.reduce((s, h) => s + h.subtotal, 0);
    lines.push({
      description: "Herrajes",
      quantity: totalQty,
      unit: "pzas",
      unitCost: parseFloat((totalSubtotal / totalQty).toFixed(2)),
      subtotal: parseFloat(totalSubtotal.toFixed(2)),
      category: "hardware",
      subLines: hardwareEntries.map((h) => ({
        label: h.label,
        quantity: h.quantity,
        unit: h.unit,
        unitCost: parseFloat((h.subtotal / h.quantity).toFixed(2)),
        subtotal: parseFloat(h.subtotal.toFixed(2)),
      })),
    });
  }

  // ── Resolve board panels into actual sheets needed, per material ──────────────
  // This is a real 2D cutting-stock estimate (guillotine bin-packing), not just
  // totalArea / sheetArea — a leftover offcut from one panel often isn't big
  // enough to fit the next panel that's needed, forcing an extra sheet.
  const sheetAreaM2 = (STANDARD_SHEET_WIDTH_CM * STANDARD_SHEET_HEIGHT_CM) / 10000;
  for (const poolLabel of Object.keys(boardPools) as (keyof typeof boardPools)[]) {
    for (const [material, pieces] of boardPools[poolLabel]) {
      const boardCost = BOARD_COSTS[material] ?? 180;
      const sheetCost = boardCost * sheetAreaM2;
      const result = packSheets(pieces);
      const netAreaM2 = result.usedAreaCm2 / 10000;
      const utilization = Math.round(result.utilizationPct);
      const waste = 100 - utilization;
      const cutDetails = Array.from(partPieces.values())
        .filter((p) => p.pool === poolLabel && p.material === material)
        .map((p) => ({
          part: p.part,
          width: p.width,
          height: p.height,
          count: p.count,
          areaM2: parseFloat(((p.width * p.height * p.count) / 10000).toFixed(2)),
        }))
        .sort((a, b) => a.part.localeCompare(b.part) || b.width * b.height - a.width * a.height);

      // Simple per-sheet cut diagram: group each placed piece by sheet index
      // so a carpenter can see roughly where each cut goes on each physical sheet.
      const sheetLayouts: { part: string; x: number; y: number; width: number; height: number }[][] = Array.from(
        { length: result.sheets },
        () => []
      );
      for (const p of result.placements) {
        sheetLayouts[p.sheet]?.push({ part: p.label ?? "", x: p.x, y: p.y, width: p.width, height: p.height });
      }

      addLine(
        `Hojas ${poolLabel} ${material} — ${result.pieceCount} piezas (${netAreaM2.toFixed(2)} m² útiles · ${utilization}% aprovechamiento · ${waste}% desperdicio, por eso se necesitan ${result.sheets} hojas de ${STANDARD_SHEET_WIDTH_CM / 100}×${STANDARD_SHEET_HEIGHT_CM / 100} m)`,
        result.sheets,
        "hoja",
        parseFloat(sheetCost.toFixed(2)),
        {
          category: "board",
          cutDetails,
          cutLayout: { sheetWidthCm: STANDARD_SHEET_WIDTH_CM, sheetHeightCm: STANDARD_SHEET_HEIGHT_CM, sheets: sheetLayouts },
        },
      );
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const laborPct = 30;
  const profitPct = 20;
  const laborCost = subtotal * (laborPct / 100);
  const profitCost = (subtotal + laborCost) * (profitPct / 100);
  const total = subtotal + laborCost + profitCost;

  const categoryLabels: Record<string, string> = {
    board: "Tableros (melamina/MDF)",
    hardware: "Herrajes",
    countertop: "Cubiertas",
    edge: "Cantos",
    other: "Otros",
  };
  const categoryTotals = new Map<string, number>();
  for (const l of lines) {
    const cat = l.category ?? "other";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + l.subtotal);
  }
  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([category, catSubtotal]) => ({
      category: category as KitchenQuoteSummary["categoryBreakdown"][number]["category"],
      label: categoryLabels[category] ?? "Otros",
      subtotal: parseFloat(catSubtotal.toFixed(2)),
      pct: subtotal > 0 ? Math.round((catSubtotal / subtotal) * 100) : 0,
    }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return {
    lines,
    summary: { materialLines: lines, subtotalMaterials: subtotal, laborCost, profitCost, total, laborPct, profitPct, categoryBreakdown },
  };
}

// Re-export types needed by consumers
export type { KitchenModule };
