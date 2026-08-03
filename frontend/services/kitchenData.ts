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
  PullOutAccessoryType,
} from "@/types/kitchen";
import { packSheets, STANDARD_SHEET_WIDTH_CM, STANDARD_SHEET_HEIGHT_CM, type CutPiece } from "./sheetPacking";

// No front — drawer or door — reaches all the way up to the countertop
// underside: a structural rail/apron above the top-most one leaves room for
// mounting hardware. This comes off the whole usable face height before it's
// split between doors and drawers.
const TOP_FACE_MARGIN_CM = 6;

// Cava de vinos — fixed 20-hole grid (4 columns × 5 rows); mirrored in
// ModulePreview3D.tsx's CavaVinosMesh.
const CAVA_VINOS_COLS = 4;
const CAVA_VINOS_ROWS = 5;

// Aéreo con hueco inferior — the closed (door-covered) zone is this fraction
// of the total height, floor-to-ceiling of the box; the rest is the open,
// two-cubby zone below. Mirrored in ModulePreview3D.tsx's AereoHuecoInferiorMesh.
const AEREO_HUECO_DOOR_ZONE_PCT = 0.55;

// Librero giratorio con espejo — fixed 10-shelf-row grid (2 columns, one
// center divider) on the rotating unit, and the clearance (cm) between the
// fixed housing and that inner unit on every side so it can spin freely.
// Mirrored in ModulePreview3D.tsx's LibreroGiratorioMesh.
const LIBRERO_ROWS = 10;
const LIBRERO_CLEARANCE_CM = 8;

// A stacked drawer bank's fronts are a fixed, roughly-real-world height each
// (~16cm) — not a percentage of the cabinet's total height, which is what
// made drawers on a tall cabinet cost/cut far too tall a front. The door
// below keeps at least MIN_DOOR_ZONE_CM regardless. Mirrors the same
// constants and resolveDrawerZoneHeight in components/3d/ModulePreview3D.tsx.
const AUTO_DRAWER_HEIGHT_CM = 16;
const MIN_DOOR_ZONE_CM = 40;
function resolveDrawerZoneHeight(usableH: number, doorCount: number, drawerCount: number, override: number | undefined): number {
  if (drawerCount === 0) return 0;
  if (doorCount === 0) return usableH;
  const maxDrawerZone = Math.max(usableH - MIN_DOOR_ZONE_CM, 0);
  if (override != null) return Math.min(Math.max(override, 1), maxDrawerZone);
  return Math.min(drawerCount * AUTO_DRAWER_HEIGHT_CM, maxDrawerZone);
}

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
  const drawerZoneH = resolveDrawerZoneHeight(usableH, count, drawerCount, o.drawerZoneHeight);
  const doorZoneH = usableH - drawerZoneH;
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => {
    const hingeSide = o.doorHingeSides?.[i];
    return {
      id: `auto-dr${i}`, label: `Puerta ${i + 1}`,
      widthPct: doorW, offsetPct: i * doorW,
      fromBottomCm: 0, heightCm: doorZoneH,
      hingeLeft: hingeSide ? hingeSide === "izquierda" : i % 2 === 0,
      hingeTop: hingeSide === "arriba",
      doorStyle: o.doorStyle,
      pullOutAccessory: o.doorAccessories?.[i] ?? null,
      pullOut: o.doorPullOut?.[i] ?? false,
    };
  });
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
  const drawerZoneH = resolveDrawerZoneHeight(usableH, doorCount, count, o.drawerZoneHeight);
  const doorZoneH = usableH - drawerZoneH;
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
  leftFrontSidePanel: "ninguno",
  doorHingeSides: [],
  doorAccessories: [],
  doorPullOut: [],
  useDetailedLayout: false,
  drawerDefs: [],
  doorDefs: [],
  countertopTexture: "ninguna",
  backPanelMaterial: "interior",
  barOverhangCm: 0,
  zocaloMaterial: "MDF",
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

// Zócalo (toe-kick trim) — MDF is cut to size from board stock (see the board
// pools below); aluminum is bought as a fixed 3m strip per piece.
export const ZOCALO_ALUMINIO_PRICE_PER_PIECE = 165; // MXN per 3m strip
export const ZOCALO_ALUMINIO_PIECE_LENGTH_M = 3;

// Lambrín — solid decorative wood/MDF-look covering panel, a cosmetic finish
// (not a wire mesh) with a subtle vertical slat relief (desayunador's
// exposed back, or any side panel set to "lambrin"), sold as a fixed
// 3m × 15cm strip per piece. Cost is per piece, not per m², since the shop
// can't split a strip narrower than 15cm.
export const LAMBRIN_PRICE_PER_PIECE = 210; // MXN per 3m×15cm strip
export const LAMBRIN_PIECE_LENGTH_M = 3;
export const LAMBRIN_STRIP_WIDTH_M = 0.15;

// Espejo (mirror) back panel — librero giratorio con espejo.
export const MIRROR_PRICE_PER_M2 = 950;

// Backsplash — price per m², by material. Matches the shop's real material
// list instead of a single flat rate for every material.
export const BACKSPLASH_COSTS: Record<string, number> = {
  "Azulejo": 350,
  "Piedra": 620,
  "Vidrio": 780,
  "WPC mármol": 480,
};

// Flat unit price for accessory-category modules that are bought as a single
// ready-made part (not built from board/hardware pools like a cabinet).
export const ACCESSORY_UNIT_COSTS: Partial<Record<KitchenModuleType, number>> = {
  especiero_aluminio: 480,
};

// Pull-out accessories nested behind a specific cabinet door (see
// PullOutAccessoryType) — not standalone modules, so priced separately and
// aggregated by how many doors carry each one (see calculateKitchenMaterials).
export const PULL_OUT_ACCESSORY_COSTS: Record<PullOutAccessoryType, number> = {
  canasta_especiero_cromado: 890,
  basurero_extraible: 1150,
  soporte_garrafon: 620,
};

export const PULL_OUT_ACCESSORY_LABELS: Record<PullOutAccessoryType, string> = {
  canasta_especiero_cromado: "Canasta especiero de alambre cromado",
  basurero_extraible: "Par de botes de basura extraíbles",
  soporte_garrafon: "Soporte extraíble para garrafón de agua",
};

// ─── Module Catalog ────────────────────────────────────────────────────────────
export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  // ── MUEBLES BAJOS ──────────────────────────────────────────────────────────
  // Angosto y totalmente abierto — sin puertas ni cajones, una sola repisa
  // partiendo su altura a la mitad. Reutiliza CabinetMesh sin cambios: con
  // doors:0/drawers:0 no se renderan frentes (getEffectiveDoors/Drawers
  // devuelven []), y Shelves ya centra una repisa única a medio camino entre
  // el zócalo y la cubierta.
  {
    type: "hueco_bajo_repisa",
    category: "lower",
    label: "Hueco con Repisa",
    description: "Mueble bajo angosto y abierto, sin puertas ni cajones, con una sola repisa a la mitad de su altura",
    icon: "🗂️",
    defaultDimensions: { height: 90, width: 20, depth: 60 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 1 },
    configurableFields: ["height", "width", "depth", "doors", "drawers", "shelves", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_puerta_simple",
    category: "lower",
    label: "Gabinete Bajo de 1 Puerta",
    description: "Mueble bajo con una sola puerta y un estante interior",
    icon: "🚪",
    defaultDimensions: { height: 90, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_puerta_jalable",
    category: "lower",
    label: "Gabinete Bajo con Puerta Jalable",
    description: "Mueble bajo de una puerta que se jala como cajón (sobre rieles), con jaladera superior y dos repisas internas que se deslizan con la puerta",
    icon: "📥",
    defaultDimensions: { height: 90, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 2, doorStyle: "Lisa", doorPullOut: [true] },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "cajonera",
    category: "lower",
    label: "Cajonera",
    description: "Mueble con múltiples cajones para almacenaje ordenado",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 40, depth: 60 },
    defaultOptions: { drawers: 4, doors: 0, shelves: 0, doorStyle: "Sin puerta", drawerSystem: "Soft-close" },
    configurableFields: ["height", "width", "depth", "drawers", "drawerSystem", "hasToeKick", "toeKickHeight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "bajo_tarja",
    category: "lower",
    label: "Mueble para tarja",
    description: "Mueble bajo con espacio para la tarja y plomería",
    icon: "🚿",
    defaultDimensions: { height: 90, width: 100, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, includesCountertop: true },
    configurableFields: ["height", "width", "depth", "doors", "doorStyle", "sinkStyle", "sinkMaterial", "sinkHoles", "includesCountertop", "countertopMaterial", "boardMaterial", "color"],
  },
  {
    type: "bajo_parrilla",
    category: "lower",
    label: "Mueble para parrilla",
    description: "Mueble base reforzado con cubierta y hueco para parrilla de asador empotrable",
    icon: "🍖",
    defaultDimensions: { height: 90, width: 100, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, hasVentilation: true, includesCountertop: true },
    configurableFields: ["height", "width", "depth", "doors", "doorStyle", "hasVentilation", "countertopMaterial", "boardMaterial", "color"],
  },
  {
    type: "bajo_horno_empotrable",
    category: "lower",
    label: "Mueble para horno empotrable",
    description: "Nicho de mueble bajo para horno empotrable con extracción de calor",
    icon: "🥧",
    defaultDimensions: { height: 90, width: 60, depth: 60 },
    defaultOptions: { drawers: 1, doors: 0, shelves: 0, hasVentilation: true },
    configurableFields: ["height", "width", "depth", "drawers", "hasVentilation", "boardMaterial", "color"],
  },
  {
    type: "esquinero_inferior",
    category: "lower",
    label: "Esquinero inferior",
    description: "Solución de esquina con acceso giratorio o magic corner",
    icon: "📐",
    defaultDimensions: { height: 90, width: 90, depth: 90 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, cornerType: "magic_corner" },
    configurableFields: ["height", "width", "depth", "cornerType", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_puertas",
    category: "lower",
    label: "Gabinete bajo con puertas",
    description: "Mueble bajo estándar con una o dos puertas y repisas interiores",
    icon: "🗃️",
    defaultDimensions: { height: 90, width: 100, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "gabinete_bajo_cajones",
    category: "lower",
    label: "Gabinete bajo con cajones",
    description: "Mueble bajo con cajones y puerta inferior combinados",
    icon: "🧰",
    defaultDimensions: { height: 90, width: 100, depth: 60 },
    defaultOptions: { drawers: 2, doors: 2, shelves: 1, drawerSystem: "Soft-close" },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "drawerSystem", "doorStyle", "boardMaterial", "color"],
  },
  {
    // A desayunador is a normal drawer/door cabinet, just shallower — half
    // its depth (30cm) is the real carcass, and a matching 30cm extra rides
    // as unsupported countertop overhang for bar-stool knee room, so the
    // total counter depth still reads as a full 60cm from the front. The
    // back (exposed toward the seating side, not hidden against a wall like
    // a normal cabinet's) defaults to lambrín instead of plain board.
    type: "desayunador",
    category: "lower",
    label: "Desayunador",
    description: "Mueble bajo de 30cm de fondo con cubierta que vuela 30cm extra hacia el lado del banquillo — el respaldo expuesto lleva lambrín",
    icon: "🍳",
    defaultDimensions: { height: 90, width: 90, depth: 30 },
    defaultOptions: {
      drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa",
      includesCountertop: true, barOverhangCm: 30, backPanelMaterial: "lambrin",
    },
    configurableFields: [
      "height", "width", "depth", "drawers", "doors", "shelves", "doorStyle", "drawerSystem",
      "barOverhangCm", "backPanelMaterial", "leftSidePanel", "rightSidePanel",
      "countertopMaterial", "boardMaterial", "color",
    ],
  },
  {
    type: "botellero_extraible",
    category: "lower",
    label: "Botellero extraíble",
    description: "Accesorio interior extraíble para botellas",
    icon: "🍷",
    defaultDimensions: { height: 90, width: 30, depth: 55 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "boardMaterial", "color"],
  },
  {
    type: "despensero_bajo",
    category: "lower",
    label: "Despensero bajo",
    description: "Mueble alto de piso con múltiples repisas y puertas para despensa",
    icon: "🥫",
    defaultDimensions: { height: 90, width: 45, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "bajo_lavavajillas",
    category: "lower",
    label: "Mueble para lavavajillas",
    description: "Hueco estándar para lavavajillas empotrable con panel frontal",
    icon: "🍽️",
    defaultDimensions: { height: 90, width: 60, depth: 60 },
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

  // ── ESQUINEROS ──────────────────────────────────────────────────────────────
  // Reuses gabinete_bajo_puertas's own defaults verbatim — same materials,
  // door count/distribution, shelves, toe-kick and hardware logic. Only the
  // 3D mesh differs (CornerBlindCabinetMesh in ModulePreview3D.tsx), which
  // adds a blind fondo×fondo extension to the left; dimensions.width still
  // means just the door-covered front, exactly like the base cabinet.
  {
    type: "gabinete_bajo_esquinero_puertas",
    category: "corner",
    label: "Gabinete Bajo Esquinero con Puertas",
    description: "Gabinete bajo con puertas al que se le agrega una extensión ciega de fondo×fondo hacia la izquierda para ocupar la esquina — mismas puertas, repisas y herrajes que el gabinete bajo estándar",
    icon: "📐",
    defaultDimensions: { height: 90, width: 100, depth: 60 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "includesCountertop", "countertopMaterial", "hardwareFinish", "boardMaterial", "color"],
  },
  // Same blind-corner geometry as the base version above, mounted on the
  // wall like any other aéreo — hasToeKick/includesCountertop are pinned off
  // since CornerBlindCabinetMesh (unlike the generic cabinet mesh) doesn't
  // gate those on category itself, only on these options.
  {
    type: "gabinete_superior_esquinero_puertas",
    category: "corner",
    label: "Gabinete Superior Esquinero con Puertas",
    description: "Gabinete aéreo con puertas al que se le agrega una extensión ciega de fondo×fondo hacia la izquierda para ocupar la esquina — mismas puertas, repisas y herrajes que el gabinete superior estándar",
    icon: "📐",
    defaultDimensions: { height: 70, width: 90, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa", mountHeight: 144, hasToeKick: false, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "doors", "shelves", "doorStyle", "mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },

  // ── MUEBLES ALTOS ──────────────────────────────────────────────────────────
  {
    type: "alacena_aerea",
    category: "upper",
    label: "Alacena aérea",
    description: "Gabinete aéreo estándar con repisas y puertas",
    icon: "🗂️",
    defaultDimensions: { height: 70, width: 100, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, mountHeight: 144, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "boardMaterial", "color"],
  },
  {
    type: "gabinete_superior",
    category: "upper",
    label: "Gabinete superior",
    description: "Gabinete aéreo de mayor capacidad",
    icon: "📦",
    defaultDimensions: { height: 70, width: 100, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, mountHeight: 144, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "esquinero_superior",
    category: "upper",
    label: "Esquinero superior",
    description: "Solución de esquina aérea con puertas angulares o abatibles",
    icon: "📐",
    defaultDimensions: { height: 70, width: 90, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, mountHeight: 144, cornerType: "diagonal" },
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
    defaultDimensions: { height: 70, width: 100, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, mountHeight: 144, doorStyle: "Vidrio transparente" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "mountHeight", "hasUnderLight", "boardMaterial", "color"],
  },
  {
    type: "despensero_alto",
    category: "upper",
    label: "Despensero alto",
    description: "Mueble aéreo alto con múltiples repisas para despensa",
    icon: "🥫",
    defaultDimensions: { height: 70, width: 45, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, mountHeight: 144, doorStyle: "Lisa" },
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
  // Decorative light valance, not a storage cabinet — no doors/drawers/
  // shelves. Front and underside are the same exterior board as every other
  // module (kept in sync by applyExteriorToAll like the rest of the kitchen —
  // no special-casing needed here since it just inherits the shared default).
  {
    type: "corona_luz",
    category: "upper",
    label: "Corona de luz",
    description: "Cornisa decorativa con iluminación indirecta integrada — tira de LED o foquitos",
    icon: "💡",
    defaultDimensions: { height: 15, width: 90, depth: 15 },
    defaultOptions: {
      drawers: 0, doors: 0, shelves: 0, mountHeight: 214, hasToeKick: false, includesCountertop: false,
      leftSidePanel: "ninguno", rightSidePanel: "ninguno",
      lightMode: "tira", lightStripWidth: 3, bulbCount: 6, lightColor: "#fff2d0",
    },
    configurableFields: ["height", "width", "mountHeight", "lightMode", "lightStripWidth", "bulbCount", "lightColor", "leftSidePanel", "rightSidePanel"],
  },
  // Two doors cover only the top zone; the bottom is left fully open (no
  // door) with one shelf splitting it into two display cubbies — see
  // AereoHuecoInferiorMesh.
  {
    type: "aereo_hueco_inferior",
    category: "upper",
    label: "Aéreo con hueco inferior",
    description: "Gabinete aéreo con dos puertas abatibles arriba y hueco abierto (sin puerta) abajo, dividido en dos",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 90, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorStyle: "Lisa", mountHeight: 144 },
    configurableFields: ["height", "width", "depth", "mountHeight", "doorStyle", "boardMaterial", "color"],
  },
  // 20-hole bottle grid (4 columns × 5 rows) — full top/bottom/side/back
  // panels plus cut dividers forming the cells; open front, no doors. See
  // CavaVinosMesh.
  {
    type: "cava_vinos",
    category: "upper",
    label: "Cava de vinos",
    description: "Gabinete aéreo con cuadrícula de 20 huecos para botellas, formada con divisiones cortadas",
    icon: "🍷",
    defaultDimensions: { height: 100, width: 80, depth: 32 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, mountHeight: 144, hasToeKick: false, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "mountHeight", "boardMaterial", "color"],
  },

  // ── TORRES ─────────────────────────────────────────────────────────────────
  {
    type: "torre_horno_microondas",
    category: "tower",
    label: "Torre para horno y microondas",
    description: "Torre alta con nichos para horno empotrable y microondas apilados",
    icon: "🏗️",
    defaultDimensions: { height: 220, width: 60, depth: 60 },
    defaultOptions: { ovenOpening: true, microwaveOpening: true, ovenHeight: 60, microwaveHeight: 38, doors: 2, shelves: 1 },
    configurableFields: ["height", "width", "depth", "ovenOpening", "ovenHeight", "microwaveOpening", "microwaveHeight", "doors", "shelves", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_despensa",
    category: "tower",
    label: "Torre despensa",
    description: "Torre alta con repisas ajustables y puertas para gran capacidad",
    icon: "🗼",
    defaultDimensions: { height: 220, width: 45, depth: 60 },
    defaultOptions: { drawers: 0, doors: 4, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "drawerSystem", "boardMaterial", "color"],
  },
  {
    type: "torre_despensa_jalable",
    category: "tower",
    label: "Torre despensa (puerta jalable)",
    description: "Despensero de puerta única cuyos estantes se jalan junto con la puerta al abrir, para acceso total sin agacharse",
    icon: "🚪",
    defaultDimensions: { height: 220, width: 40, depth: 55 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 1, doorStyle: "Lisa", doorPullOut: [true] },
    configurableFields: ["height", "width", "depth", "shelves", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_refrigerador",
    category: "tower",
    label: "Torre refrigerador",
    description: "Columna de nichos laterales y superiores que enmarcan el refrigerador",
    icon: "🧊",
    defaultDimensions: { height: 220, width: 120, depth: 65 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1 },
    configurableFields: ["height", "width", "depth", "shelves", "doors", "doorStyle", "boardMaterial", "color"],
  },
  {
    type: "torre_almacenamiento",
    category: "tower",
    label: "Torre de almacenamiento",
    description: "Torre modular multipropósito con cajones y repisas",
    icon: "🏛️",
    defaultDimensions: { height: 220, width: 60, depth: 60 },
    defaultOptions: { drawers: 2, doors: 2, shelves: 1, doorStyle: "Lisa" },
    configurableFields: ["height", "width", "depth", "drawers", "shelves", "doors", "doorStyle", "drawerSystem", "boardMaterial", "color"],
  },
  // Tall open-shelf column (many closely-spaced shelves) with a mirror on
  // its back face instead of plain board — no doors, since it's meant to be
  // spun to whichever face is needed rather than opened. See
  // LibreroGiratorioMesh.
  {
    // Fixed gray outer housing (narrow width, generous depth — the depth is
    // what lets the inner shelf unit's width swing through as it rotates)
    // framing a second body that spins 180° on a vertical axis: shelf grid
    // facing front at rest, full-size mirror facing front once rotated. See
    // LibreroGiratorioMesh — a dedicated mesh, not the generic cabinet one.
    type: "librero_giratorio_espejo",
    category: "tower",
    label: "Librero giratorio con espejo",
    description: "Columna angosta y profunda: un cuerpo giratorio con cuadrícula de repisas de un lado y espejo de cuerpo completo del otro",
    icon: "🪞",
    defaultDimensions: { height: 200, width: 50, depth: 65 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0 },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color"],
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
    defaultOptions: { drawers: 4, doors: 4, shelves: 1, countertopMaterial: "Cuarzo engineered", includesCountertop: true },
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
    type: "especiero_aluminio",
    category: "accessory",
    label: "Especiero de aluminio",
    description: "Repisa especiera de aluminio, fija o montada en interior de gabinete",
    icon: "🧂",
    defaultDimensions: { height: 25, width: 60, depth: 12 },
    defaultOptions: {},
    configurableFields: ["height", "width"],
  },
];

// ─── Helper Functions ──────────────────────────────────────────────────────────
export function getCatalogEntry(type: KitchenModuleType): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((entry) => entry.type === type);
}

export function getModulesByCategory(category: ModuleCategory): ModuleCatalogEntry[] {
  return MODULE_CATALOG.filter((entry) => entry.category === category);
}

// ─── Sample kitchens (demo drafts) ──────────────────────────────────────────────
// Three fully furnished demo layouts, picked from a dropdown next to the
// "Cocina de muestra" button so a first-time user sees a real room instead of
// an empty one, each demonstrating a different upper-cabinet configuration:
//   1. Normal  — no island, two rows of upper cabinets at the SAME depth.
//   2. Isla    — a central island under a "cocina de puente": a shallower
//                base row of uppers with a deeper row bridging above it.
//   3. Corona  — a single row of upper cabinets topped by one continuous
//                light crown spanning the full wall.
type ModulePatch = { dimensions?: Partial<ModuleDimensions>; options?: Partial<ModuleOptions>; rotation?: KitchenModule["rotation"] };
type AddModuleFn = (type: KitchenModuleType, x: number, z: number, patch?: ModulePatch) => void;

function makeModuleAdder(modules: KitchenModule[]): AddModuleFn {
  return (type, x, z, patch) => {
    const mod = buildNewModule(type, x, z, patch?.rotation ?? 0);
    modules.push({
      ...mod,
      dimensions: patch?.dimensions ? { ...mod.dimensions, ...patch.dimensions } : mod.dimensions,
      options: patch?.options ? { ...mod.options, ...patch.options } : mod.options,
    });
  };
}

// Shared by variants 1 and 2 — an L-shaped kitchen's lower cabinetry,
// sink/stove/hood and west-wall appliances. Widths are pinned explicitly so
// the north-wall run sums exactly to roomWidth (580: 150 corner (90 front +
// 60 blind) + 90 + 90 + 70 stove gap + 90 + 45 + 45). No separate "cubierta"
// modules — every base cabinet already renders its own built-in countertop
// slab, so a continuous counter comes for free.
function addLShapeBaseCabinetry(add: AddModuleFn) {
  // NW corner — lower esquinero. Real blind-corner cabinet: dimensions.width
  // is just the visible door front — the carcass actually grows a blind
  // depth-wide extension to its own left, tucked against the west wall (x is
  // that widened Wt-box's center). See CornerBlindCabinetMesh.
  add("gabinete_bajo_esquinero_puertas", 75, 30, { dimensions: { width: 90 } });

  add("gabinete_bajo_cajones", 195, 30, { dimensions: { width: 90 } });
  add("bajo_tarja", 285, 30, { dimensions: { width: 90 } });
  // No "bajo_estufa" cabinet here — as is customary in Mexican kitchens, the
  // run just leaves a 70cm gap and the freestanding "estufa" below (with its
  // own floor-to-counter body) drops straight into it.
  add("gabinete_bajo_puertas", 445, 30, { dimensions: { width: 90 } });
  add("despensero_bajo", 512.5, 30);
  add("torre_despensa", 557.5, 30);

  // Sink and the freestanding stove/oven filling the gap left in the run
  // above, plus a standalone factory-style extractor hood (no housing
  // cabinet — see the campana_extractora mesh for the hood's own look)
  add("tarja", 285, 31);
  add("estufa", 365, 30);
  add("campana_extractora", 365, 15, { options: { mountHeight: 150 } });

  // West wall — continues the L from the corner block's blind extension
  // (z ≥ 60): a small cabinet with a countertop microwave, a dishwasher, a
  // standalone fridge and an oven/microwave tower. Rotation 90 backs each
  // against the west wall (x = 0) instead of the north one; x is that unit's
  // own depth/2, the same convention as z above, just on the rotated axis.
  add("gabinete_bajo_puertas", 30, 90, { rotation: 90, dimensions: { width: 60 } });
  add("microondas", 30, 90, { rotation: 90 });
  add("lavavajillas", 30, 150, { rotation: 90, dimensions: { width: 60 } });
  add("refrigerador", 35, 225, { rotation: 90 });
  add("torre_horno_microondas", 30, 300, { rotation: 90 });
  add("alacena_aerea", 15, 90, { rotation: 90, dimensions: { width: 60 } });
}

const L_SHAPE_OPENINGS: WallOpening[] = [
  { id: "sample_win_north", type: "window", wall: "north", offset: 255, width: 90, height: 90, sillHeight: 100 },
  { id: "sample_win_east", type: "window", wall: "east", offset: 170, width: 110, height: 140, sillHeight: 90 },
  { id: "sample_win_west", type: "window", wall: "west", offset: 130, width: 50, height: 100, sillHeight: 90 },
  { id: "sample_door_south", type: "door", wall: "south", offset: 320, width: 90, height: 205, sillHeight: 0 },
];

// 1. Normal — no island; a plain L-shaped kitchen with a double row of upper
// cabinets stacked at the SAME depth (30cm), instead of a deeper bridge.
function buildSampleKitchenNormal(): KitchenDraft {
  const modules: KitchenModule[] = [];
  const add = makeModuleAdder(modules);

  addLShapeBaseCabinetry(add);

  // Upper corner + row 1 (mountHeight 144, tops out at 214) — a gap is left
  // over the sink for the window, and none above the stove/hood or the tower.
  add("gabinete_superior_esquinero_puertas", 75, 15, { dimensions: { width: 120 } });
  add("alacena_aerea", 195, 15, { dimensions: { width: 90 } });
  add("gabinete_superior", 445, 15, { dimensions: { width: 90 } });
  add("despensero_alto", 512.5, 15);

  // Row 2 — stacked directly above row 1 at the SAME depth (z=15, 30cm),
  // reaching up toward the 280cm ceiling. Unlike the "isla" variant's bridge,
  // there's no extra depth to reach further into the room here.
  const ROW2_MOUNT = 214;
  const ROW2_HEIGHT = 64; // top lands at 278, just under the ceiling
  const row2Options = { mountHeight: ROW2_MOUNT };
  add("gabinete_superior_esquinero_puertas", 75, 15, { dimensions: { width: 120, height: ROW2_HEIGHT }, options: row2Options });
  add("alacena_aerea", 195, 15, { dimensions: { width: 90, height: ROW2_HEIGHT }, options: row2Options });
  add("gabinete_superior", 445, 15, { dimensions: { width: 90, height: ROW2_HEIGHT }, options: row2Options });
  add("despensero_alto", 512.5, 15, { dimensions: { height: ROW2_HEIGHT }, options: row2Options });

  return {
    clientName: "Familia Rodríguez",
    clientPhone: "871 123 4567",
    projectName: "Cocina de muestra — Normal",
    notes: "Cocina normal en L, sin isla: doble fila de alacenas aéreas apiladas a la misma profundidad (30cm) hasta casi el techo (2.80m). Diseño de ejemplo generado automáticamente.",
    roomWidth: 580,
    roomDepth: 380,
    ceilingHeight: 280,
    modules,
    openings: L_SHAPE_OPENINGS.map((o) => ({ ...o })),
    editingModuleId: null,
  };
}

// 2. Isla — a central island under a "cocina de puente": row 1 uppers at the
// normal 30cm depth, with a second row bridging above them at 60cm depth.
function buildSampleKitchenIsla(): KitchenDraft {
  const modules: KitchenModule[] = [];
  const add = makeModuleAdder(modules);

  addLShapeBaseCabinetry(add);

  // Upper corner + row 1 (mountHeight 144, tops out at 214) — a gap is left
  // over the sink for the window, and none above the stove/hood or the tower.
  add("gabinete_superior_esquinero_puertas", 75, 15, { dimensions: { width: 120 } });
  add("alacena_aerea", 195, 15, { dimensions: { width: 90 } });
  add("gabinete_superior", 445, 15, { dimensions: { width: 90 } });
  add("despensero_alto", 512.5, 15);

  // The "puente" — a second row of upper cabinets bridging above the first,
  // starting right where row 1 tops out (214) and reaching to 274, just
  // under the 280cm ceiling. Deeper than row 1 (60 instead of 30 — less
  // obstructed up there, so it can reach further into the room) and opened
  // with a single lift-up (abatible) door each, hinged at the top, rather
  // than a pair of side-hinged doors — easier to reach one-handed from
  // below. Spans across the corner and clear over the window above the sink,
  // the way a real bridge run ties two banks of uppers together; skipped
  // above the extractor (duct clearance) and above the tower (already tall
  // enough on its own).
  const BRIDGE_MOUNT = 216;
  const BRIDGE_HEIGHT = 60;
  const BRIDGE_DEPTH = 60;
  const bridgeOptions = { mountHeight: BRIDGE_MOUNT, doors: 1, doorHingeSides: ["arriba" as const] };
  add("gabinete_superior_esquinero_puertas", 75, 30, { dimensions: { width: 90, height: BRIDGE_HEIGHT, depth: BRIDGE_DEPTH }, options: bridgeOptions });
  add("alacena_aerea", 195, 30, { dimensions: { width: 90, height: BRIDGE_HEIGHT, depth: BRIDGE_DEPTH }, options: bridgeOptions });
  add("gabinete_superior", 285, 30, { dimensions: { width: 90, height: BRIDGE_HEIGHT, depth: BRIDGE_DEPTH }, options: bridgeOptions });
  add("gabinete_superior", 445, 30, { dimensions: { width: 90, height: BRIDGE_HEIGHT, depth: BRIDGE_DEPTH }, options: bridgeOptions });

  // Freestanding island — clear of both wall runs, roughly centered on the
  // open floor to the south-east of the L.
  add("isla_central", 360, 220);

  return {
    clientName: "Familia Rodríguez",
    clientPhone: "871 123 4567",
    projectName: "Cocina de muestra — Isla",
    notes: "Cocina de isla con cocina de puente: alacenas de la fila base a 30cm de fondo y una segunda fila más profunda (60cm) encima, hasta casi el techo (2.80m). Diseño de ejemplo generado automáticamente.",
    roomWidth: 580,
    roomDepth: 380,
    ceilingHeight: 280,
    modules,
    openings: L_SHAPE_OPENINGS.map((o) => ({ ...o })),
    editingModuleId: null,
  };
}

// 3. Corona — a single straight wall run with just one row of upper
// cabinets, topped by one continuous "Corona de luz" spanning the full wall.
function buildSampleKitchenCorona(): KitchenDraft {
  const modules: KitchenModule[] = [];
  const add = makeModuleAdder(modules);

  // Single north-wall run, widths at their catalog defaults summing exactly
  // to ROOM_WIDTH (45 + 90 + 90 + 70 stove gap + 90 + 45 = 430).
  const ROOM_WIDTH = 430;
  const ROOM_DEPTH = 300;

  add("despensero_bajo", 22.5, 30);
  add("gabinete_bajo_cajones", 90, 30);
  add("bajo_tarja", 180, 30);
  add("gabinete_bajo_puertas", 340, 30);
  add("torre_despensa", 407.5, 30);

  add("tarja", 180, 31);
  add("estufa", 260, 30);
  add("campana_extractora", 260, 15, { options: { mountHeight: 150 } });

  // Single row of upper cabinets (mountHeight 144, tops out at 214) — none
  // above the sink (window instead), the stove/hood (duct clearance), or the
  // tower (already tall on its own).
  add("despensero_alto", 22.5, 15);
  add("alacena_aerea", 90, 15);
  add("alacena_aerea", 340, 15);

  // Corona de luz — one continuous crown across the FULL wall width, mounted
  // flush on top of the upper row (mountHeight 214, its catalog default) at
  // the SAME depth (30cm, overriding its 15cm default) so its lit front edge
  // lines up exactly with the cabinet doors below instead of sitting recessed.
  add("corona_luz", ROOM_WIDTH / 2, 15, { dimensions: { width: ROOM_WIDTH, depth: 30 } });

  // West wall — just a fridge, enough to round out the room without
  // competing with the corona as the visual centerpiece.
  add("refrigerador", 35, 110, { rotation: 90 });

  const openings: WallOpening[] = [
    { id: "sample3_win_north", type: "window", wall: "north", offset: 215, width: 90, height: 90, sillHeight: 100 },
    { id: "sample3_door_south", type: "door", wall: "south", offset: 300, width: 90, height: 205, sillHeight: 0 },
  ];

  return {
    clientName: "Familia Rodríguez",
    clientPhone: "871 123 4567",
    projectName: "Cocina de muestra — Corona de luz",
    notes: "Cocina de una sola pared: una fila de alacenas aéreas y, justo encima, una corona de luz continua a todo lo ancho. Diseño de ejemplo generado automáticamente.",
    roomWidth: ROOM_WIDTH,
    roomDepth: ROOM_DEPTH,
    ceilingHeight: 250,
    modules,
    openings,
    editingModuleId: null,
  };
}

export type SampleKitchenVariant = 1 | 2 | 3;

export function buildSampleKitchen(variant: SampleKitchenVariant = 1): KitchenDraft {
  if (variant === 2) return buildSampleKitchenIsla();
  if (variant === 3) return buildSampleKitchenCorona();
  return buildSampleKitchenNormal();
}

// Appliance niches ("Nicho para...", "Espacio para...") are an empty opening
// sized for a specific freestanding accessory — this maps a niche's type to
// that accessory's own catalog type, for the ModuleInspector's "Colocar
// aquí" shortcut (see useKitchenStore's placeAccessoryInNiche). Left out
// where there's no matching standalone accessory in the catalog yet
// (nicho_horno, espacio_centro_bebidas, espacio_cava_vinos).
export const NICHE_ACCESSORY_MATCH: Partial<Record<KitchenModuleType, KitchenModuleType>> = {
  nicho_refrigerador: "refrigerador",
  nicho_microondas: "microondas",
  espacio_lavavajillas: "lavavajillas",
};

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

// ─── Placement helpers (used by duplicateModule) ────────────────────────────
// Mirrors the same "floor" (lower/tower/corner/appliance) vs "wall" (upper)
// grouping KitchenAssemblyScene's own overlap-prevention uses — see
// placementBand there — kept as a separate, cm-based copy here since the
// store works in cm/whole modules rather than the scene's meters/live-drag-
// candidate shape. Countertop/accessory aren't checked for the same reason
// they aren't checked there: they're overlays by design.
function placementBandFor(mod: Pick<KitchenModule, "category" | "type">): "floor" | "wall" | null {
  const isWallMounted = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
  if (isWallMounted) return "wall";
  if (mod.category === "lower" || mod.category === "tower" || mod.category === "corner" || mod.category === "appliance") return "floor";
  return null;
}

const BLIND_CORNER_TYPES = new Set<KitchenModuleType>(["gabinete_bajo_esquinero_puertas", "gabinete_superior_esquinero_puertas"]);

function footprintHalfExtentsCm(mod: Pick<KitchenModule, "type" | "dimensions" | "rotation">): { halfW: number; halfD: number } {
  const footprintWidth = BLIND_CORNER_TYPES.has(mod.type) ? mod.dimensions.width + mod.dimensions.depth : mod.dimensions.width;
  const isRotated = mod.rotation === 90 || mod.rotation === 270;
  return isRotated
    ? { halfW: mod.dimensions.depth / 2, halfD: footprintWidth / 2 }
    : { halfW: footprintWidth / 2, halfD: mod.dimensions.depth / 2 };
}

const OVERLAP_TOLERANCE_CM = 0.3;

function footprintsOverlap(
  ax: number, az: number, a: { halfW: number; halfD: number },
  bx: number, bz: number, b: { halfW: number; halfD: number },
): boolean {
  return Math.abs(ax - bx) < a.halfW + b.halfW - OVERLAP_TOLERANCE_CM && Math.abs(az - bz) < a.halfD + b.halfD - OVERLAP_TOLERANCE_CM;
}

// Finds a spot near `mod`'s own position for a duplicate that doesn't land on
// top of another same-band module — searching outward ring by ring (right,
// down, left, up, then the diagonals) instead of the old fixed "+20cm on x"
// offset, which for anything wider than 40cm always landed the copy
// overlapping the original, awkward to then drag apart by hand.
export function findFreeSpotNear(mod: KitchenModule, modules: KitchenModule[], roomWidth: number, roomDepth: number): { x: number; z: number } {
  const band = placementBandFor(mod);
  const self = footprintHalfExtentsCm(mod);
  const others = band ? modules.filter((m) => m.id !== mod.id && placementBandFor(m) === band) : [];
  const inBounds = (x: number, z: number) =>
    x - self.halfW >= 0 && x + self.halfW <= roomWidth && z - self.halfD >= 0 && z + self.halfD <= roomDepth;
  const isFree = (x: number, z: number) =>
    others.every((o) => !footprintsOverlap(x, z, self, o.x, o.z, footprintHalfExtentsCm(o)));

  const step = Math.max(self.halfW, self.halfD) * 2 + 8; // clears the original's own footprint plus a small gap
  const directions: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let ring = 1; ring <= 6; ring++) {
    for (const [dx, dz] of directions) {
      const x = mod.x + dx * step * ring;
      const z = mod.z + dz * step * ring;
      if (inBounds(x, z) && isFree(x, z)) return { x, z };
    }
  }
  // Nothing clear nearby (a packed room) — original spot, same as before this
  // feature; at least it's an exact, obvious overlap rather than a
  // half-overlapping few-cm offset that's fiddly to even grab correctly.
  return { x: mod.x, z: mod.z };
}

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  lower: "Muebles bajos",
  upper: "Muebles altos",
  tower: "Torres",
  corner: "Esquineros",
  countertop: "Encimeras",
  appliance: "Electrodomésticos",
  accessory: "Accesorios",
};

export const CATEGORY_ICONS: Record<ModuleCategory, string> = {
  lower: "🗄️",
  upper: "📦",
  tower: "🏗️",
  corner: "📐",
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

  // Pull-out accessories nested behind a door (canasta/basurero/soporte
  // garrafón) — tallied by type across the whole project, one consolidated
  // line each, the same "N pza" pattern as the ready-made accessory modules.
  const pullOutAgg = new Map<PullOutAccessoryType, number>();
  const addPullOut = (accType: PullOutAccessoryType) => {
    pullOutAgg.set(accType, (pullOutAgg.get(accType) ?? 0) + 1);
  };

  // Edge banding (canto) is the same handful of profiles regardless of which
  // cabinet it's wrapping, so it's tallied by PROFILE across the whole
  // project — one line per profile, with a per-module sub-breakdown — instead
  // of a separate near-identical line per module.
  const edgeAgg = new Map<string, { quantity: number; perModule: Map<string, number> }>();
  const addEdge = (profile: string, moduleLabel: string, ml: number) => {
    if (ml <= 0) return;
    const cur = edgeAgg.get(profile) ?? { quantity: 0, perModule: new Map() };
    cur.quantity += ml;
    cur.perModule.set(moduleLabel, (cur.perModule.get(moduleLabel) ?? 0) + ml);
    edgeAgg.set(profile, cur);
  };

  // Lambrín — solid decorative covering panels (a desayunador's exposed back,
  // or any side panel set to "lambrin") pooled project-wide by total area
  // needed, then covered with 3m×15cm stock pieces (see the emission below,
  // same "how many whole pieces, what's left over" idea as edge/countertop).
  let lambrinAreaM2 = 0;
  const addLambrin = (widthM: number, heightM: number) => {
    if (widthM <= 0 || heightM <= 0) return;
    lambrinAreaM2 += widthM * heightM;
  };

  // Espejo (mirror) back panels — priced by area, pooled project-wide.
  let espejoAreaM2 = 0;
  const addEspejo = (widthM: number, heightM: number) => {
    if (widthM <= 0 || heightM <= 0) return;
    espejoAreaM2 += widthM * heightM;
  };

  // Zócalo — MDF is folded into the normal board pools like any other cut
  // piece; aluminum is bought as fixed 3m strips, pooled by total linear
  // meters needed.
  let zocaloAluminioMeters = 0;

  // Countertops are tracked per PHYSICAL SEGMENT (not just summed by
  // material) — stock is bought and cut per contiguous run against a single
  // wall, never pooled across the whole project: a slab can't bend around a
  // corner or bridge a gap (an open floor gap like the stove's, or simply
  // switching to a different wall), so each such break needs its own piece.
  // See the run-building pass right before the "Cubierta" lines are emitted.
  const STANDARD_COUNTERTOP_DEPTH_M = 0.62; // 60cm cabinet depth + 2cm standard overhang
  interface CountertopSegment { alongWall: number; wallKey: string; rotation: KitchenModule["rotation"] | null; moduleLabel: string; widthM: number; label: string; pricePerM2: number }
  const countertopSegments: CountertopSegment[] = [];
  let freestandingCounter = 0;
  const addCountertop = (label: string, widthM: number, pricePerM2: number, mod: KitchenModule, freestanding = false) => {
    if (widthM <= 0) return;
    // rotation picks which wall a run-forming (non-freestanding) segment is
    // against; the OTHER axis is that wall's fixed depth offset — two runs
    // at the same rotation but a different depth are different planes and
    // must never merge (rounded to mm to shrug off float noise).
    const isEastWest = mod.rotation === 90 || mod.rotation === 270;
    const depthCoord = isEastWest ? mod.x : mod.z; // cm — fine as an opaque grouping key
    const alongWall = (isEastWest ? mod.z : mod.x) / 100; // → meters, to match widthM for the run-gap math below
    const wallKey = freestanding ? `freestanding_${freestandingCounter++}` : `${mod.rotation}|${Math.round(depthCoord * 10)}`;
    countertopSegments.push({ alongWall, wallKey, rotation: freestanding ? null : mod.rotation, moduleLabel: mod.label, widthM, label, pricePerM2 });
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
  // Set once per iteration of the modules loop below — addPiece reads it so
  // every call site doesn't need its own moduleId/moduleLabel arguments.
  // Lets the summary UI filter "which cuts belong to this module".
  let currentModuleId = "";
  let currentModuleLabel = "";
  const addPiece = (poolLabel: keyof typeof boardPools, material: BoardMaterial, width: number, height: number, part: string) => {
    if (width <= 0 || height <= 0) return;
    const pool = boardPools[poolLabel];
    const list = pool.get(material) ?? [];
    list.push({ width, height, label: part, moduleId: currentModuleId, moduleLabel: currentModuleLabel });
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
    currentModuleId = mod.id;
    currentModuleLabel = mod.label;
    const { dimensions: d, options: o } = mod;
    const w = d.width / 100;
    const dp = d.depth / 100;
    // gabinete_bajo_esquinero_puertas has no internal wall between the
    // original cabinet and its blind extension (see CornerBlindCabinetMesh) —
    // the top, bottom, back and shelves are each a single continuous board
    // the full ancho+fondo wide, not two smaller boards joined at the seam.
    // Doors and side panels still key off the original d.width/d.depth —
    // only these structural, wall-to-wall panels grow to panelWidth.
    const panelWidth = mod.type === "gabinete_bajo_esquinero_puertas" ? d.width + d.depth : d.width;

    if (mod.category === "lower" || mod.category === "upper" || mod.category === "tower" || mod.category === "corner") {
      if (mod.type === "corona_luz") {
        // Not a real cabinet carcass — a shallow lit valance box (see
        // CoronaLuzMesh). Top is interior board (hidden against the wall/
        // soffit above it), but unlike every other module here its front
        // AND underside are both exterior board, and it has no back panel
        // (nothing to build against — it sits flush on the wall) or doors
        // (the front panel itself is the visible face, not a door on a box).
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases");
        addPiece("Exterior", o.exteriorMaterial, panelWidth, d.depth, "Cara inferior");
        addPiece("Exterior", o.exteriorMaterial, panelWidth, d.height, "Frente");
      } else if (mod.type === "cava_vinos") {
        // 20-hole bottle grid (see CavaVinosMesh): full top/bottom/back
        // panels plus cut dividers — 4 horizontal (5 rows) and 3 per row
        // (4 columns each) — instead of the normal handful of shelves. Open
        // front (no doors), same as a real built-in wine rack.
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // top
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // bottom
        addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        const rowH = d.height / CAVA_VINOS_ROWS;
        const colW = panelWidth / CAVA_VINOS_COLS;
        for (let r = 1; r < CAVA_VINOS_ROWS; r++) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Divisiones horizontales (cava)");
        for (let r = 0; r < CAVA_VINOS_ROWS; r++) {
          for (let c = 1; c < CAVA_VINOS_COLS; c++) addPiece("Interior", o.boardMaterial, colW, d.depth, "Divisiones verticales (cava)");
        }
        void rowH; // (kept for symmetry with the mesh's own row math — not needed for the flat cut list)
      } else if (mod.type === "aereo_hueco_inferior") {
        // Two doors cover only the top zone; the bottom is left fully open,
        // split into two cubbies by one shelf (see AereoHuecoInferiorMesh).
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // top
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // bottom
        addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "División puertas/hueco");
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "División hueco inferior");
        const doorZoneH = d.height * AEREO_HUECO_DOOR_ZONE_PCT;
        addPiece("Exterior", o.exteriorMaterial, panelWidth / 2, doorZoneH, "Puertas");
        addPiece("Exterior", o.exteriorMaterial, panelWidth / 2, doorZoneH, "Puertas");
        addHardware("bisagra", "Bisagras", 2, "pares", o.drawerSystem === "Soft-close" ? 65 : 35);
      } else if (mod.type === "librero_giratorio_espejo") {
        // Fixed outer housing (left/right/top/bottom, open front — see
        // LibreroGiratorioMesh) plus a separate inner rotating body: its own
        // small carcass, LIBRERO_ROWS-1 horizontal dividers, one center
        // vertical divider (2 columns), and a full-size mirror on its back
        // face. The housing's DEPTH sets the rotating unit's front-facing
        // WIDTH (has to fit swinging through), and the housing's WIDTH sets
        // the unit's THICKNESS (its usable shelf depth) — LIBRERO_CLEARANCE_CM
        // is the gap on each side for it to spin freely.
        addPiece("Exterior", o.exteriorMaterial, d.depth, d.height, "Carcasa costados"); // left
        addPiece("Exterior", o.exteriorMaterial, d.depth, d.height, "Carcasa costados"); // right
        addPiece("Exterior", o.exteriorMaterial, d.width, d.depth, "Carcasa tapa/base"); // top
        addPiece("Exterior", o.exteriorMaterial, d.width, d.depth, "Carcasa tapa/base"); // bottom
        const unitW = Math.max(d.depth - LIBRERO_CLEARANCE_CM, 0);
        const unitThick = Math.max(d.width - LIBRERO_CLEARANCE_CM, 0);
        const unitH = Math.max(d.height - LIBRERO_CLEARANCE_CM, 0);
        addPiece("Exterior", o.exteriorMaterial, unitThick, unitH, "Cuerpo giratorio costados"); // left
        addPiece("Exterior", o.exteriorMaterial, unitThick, unitH, "Cuerpo giratorio costados"); // right
        addPiece("Exterior", o.exteriorMaterial, unitW, unitThick, "Cuerpo giratorio tapa/base"); // top
        addPiece("Exterior", o.exteriorMaterial, unitW, unitThick, "Cuerpo giratorio tapa/base"); // bottom
        for (let r = 1; r < LIBRERO_ROWS; r++) addPiece("Exterior", o.exteriorMaterial, unitW, unitThick, "Divisiones horizontales (librero)");
        addPiece("Exterior", o.exteriorMaterial, unitThick, unitH, "División central (librero)");
        addEspejo(unitW / 100, unitH / 100);
      } else {
        // Structural carcass panels — always interior board (dimensions in cm).
        // A module with its own countertop skips the top panel — the slab
        // rests directly on the sides/back and closes the box itself, same as
        // the 3D mesh (Carcass's hasTop prop).
        if (!o.includesCountertop) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases");  // top
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases");  // bottom
        // bajo_tarja skips the back panel — that's where the supply lines and
        // drain trap need to pass through to the wall, same as the 3D mesh
        // (Carcass's hasBack prop). Everyone else's back panel follows
        // backPanelMaterial — plain interior board by default, but a
        // desayunador's exposed back goes to lambrín and a librero
        // giratorio's goes to a mirror instead of the normal board pool.
        if (mod.type !== "bajo_tarja") {
          const backMode = o.backPanelMaterial ?? "interior";
          if (backMode === "lambrin") addLambrin(panelWidth / 100, d.height / 100);
          else if (backMode === "espejo") addEspejo(panelWidth / 100, d.height / 100);
          else if (backMode === "exterior") addPiece("Exterior", o.exteriorMaterial, panelWidth, d.height, "Respaldo (acabado)");
          else addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        }
      }
      for (let i = 0; i < o.shelves; i++) addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Repisas");

      // Side panels — manual per-module choice: skip, route to interior/exterior
      // pool, or (lambrín) skip the board pools and pool linear stock instead.
      if (o.leftSidePanel === "lambrin") addLambrin(d.depth / 100, d.height / 100);
      else if (o.leftSidePanel !== "ninguno") {
        const poolLabel = o.leftSidePanel === "exterior" ? "Exterior" : "Interior";
        const material = o.leftSidePanel === "exterior" ? o.exteriorMaterial : o.boardMaterial;
        addPiece(poolLabel, material, d.depth, d.height, poolLabel === "Exterior" ? "Costados (acabado)" : "Costados");
      }
      if (o.rightSidePanel === "lambrin") addLambrin(d.depth / 100, d.height / 100);
      else if (o.rightSidePanel !== "ninguno") {
        const poolLabel = o.rightSidePanel === "exterior" ? "Exterior" : "Interior";
        const material = o.rightSidePanel === "exterior" ? o.exteriorMaterial : o.boardMaterial;
        addPiece(poolLabel, material, d.depth, d.height, poolLabel === "Exterior" ? "Costados (acabado)" : "Costados");
      }

      // ── Doors — always exterior board (visible face); use detailed defs when available ──
      // aereo_hueco_inferior's two doors are sized to its own door zone
      // above (not the module's full usable height), and already accounted
      // for there — skip the generic full-height door sizing for it.
      const doors = mod.type === "aereo_hueco_inferior" ? [] : resolveDoors(mod);
      for (const door of doors) {
        addPiece("Exterior", o.exteriorMaterial, (door.widthPct / 100) * d.width, door.heightCm, "Puertas");
        if (door.pullOutAccessory) addPullOut(door.pullOutAccessory);
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

      // gabinete_bajo_esquinero_puertas: the top/bottom/back/shelves above
      // already grew to the full panelWidth as single pieces — nothing more
      // to add there; there's no divider between the original cabinet and
      // the extension, just one open cavity. The only extra is the
      // extension's own front face (leftFrontSidePanel, "costado frontal
      // izquierdo") — open by default, or a plain interior-board filler
      // (never exterior board, which would read as a fake door front).
      if (mod.type === "gabinete_bajo_esquinero_puertas" && o.leftFrontSidePanel === "interior") {
        const toeKick = o.hasToeKick ? o.toeKickHeight : 0;
        const ctThickCm = o.includesCountertop ? o.countertopThickness : 0;
        const blindH = Math.max(d.height - toeKick - ctThickCm - TOP_FACE_MARGIN_CM, 0);
        addPiece("Interior", o.boardMaterial, d.depth, blindH, "Panel frontal");
      }

      // Zócalo (toe-kick) — every floor-standing cabinet with hasToeKick
      // renders its own trim strip (ToeKick in ModulePreview3D.tsx); this was
      // previously never costed at all. MDF becomes a real cut piece (same
      // exterior finish the mesh actually uses); aluminum pools into 3m
      // stock pieces (see the emission below, alongside lambrín/espejo).
      // Upper cabinets carry hasToeKick:true in their options by default
      // (DEFAULT_OPTIONS) even though they never render one — same guard the
      // 3D mesh uses to suppress it there.
      const isUpperForToeKick = mod.category === "upper" || mod.type === "gabinete_superior_esquinero_puertas";
      if (!isUpperForToeKick && o.hasToeKick) {
        if (o.zocaloMaterial === "Aluminio") zocaloAluminioMeters += panelWidth / 100;
        else addPiece("Exterior", o.exteriorMaterial, panelWidth, o.toeKickHeight, "Zoclo");
      }

      // Edge banding
      const edgeMl = 2 * (panelWidth + d.height + d.depth) / 100 * 1.15;
      addEdge(o.edgeProfile, mod.label, edgeMl);

      // Countertop — lower cabinets have one on by default; upper/tower can
      // still carry one if the user explicitly toggles it on in the inspector.
      // panelWidth folds the corner extension's width in as one continuous
      // run (see CornerCabinetMesh) rather than a second line item.
      if (o.includesCountertop) {
        const { label, cost } = resolveCountertopCost(o);
        addCountertop(label, panelWidth / 100, cost, mod);
      }
      // Backsplash — the wall strip between this run's countertop and the
      // upper cabinets above it (e.g. WPC mármol). Only wall-run lower/corner
      // cabinets carry one here; a freestanding countertop's own backsplash
      // (rare, but possible on a raised bar side) is handled just below.
      if ((mod.category === "lower" || mod.category === "corner") && o.hasBacksplash) {
        const bsCost = BACKSPLASH_COSTS[o.backsplashMaterial] ?? 350;
        addLine(`[${mod.label}] Salpicadero ${o.backsplashMaterial}`, (panelWidth / 100) * (o.backsplashHeight / 100), "m²", bsCost, { category: "countertop" });
      }
    } else if (mod.category === "countertop") {
      const { label, cost } = resolveCountertopCost(o);
      // Freestanding (island/peninsula) — never merged into a wall run, always its own piece.
      addCountertop(label, w, cost, mod, true);
      if (o.hasBacksplash) {
        const bsCost = BACKSPLASH_COSTS[o.backsplashMaterial] ?? 350;
        addLine(`[${mod.label}] Salpicadero ${o.backsplashMaterial}`, w * (o.backsplashHeight / 100), "m²", bsCost, { category: "countertop" });
      }
    } else if (mod.category === "appliance") {
      // A nicho/espacio is an open frame, not a full carcass (see
      // AppliancePreviewMesh/ApplianceMesh: two side panels plus a top and a
      // bottom, open front and back) — this used to cost nothing at all.
      addPiece("Interior", o.boardMaterial, d.depth, d.height, "Costado"); // left
      addPiece("Interior", o.boardMaterial, d.depth, d.height, "Costado"); // right
      addPiece("Interior", o.boardMaterial, d.width, d.depth, "Tapa"); // top
      addPiece("Interior", o.boardMaterial, d.width, d.depth, "Base"); // bottom
    } else if (mod.category === "accessory") {
      // Ready-made accessory parts bought as a single unit — herrajes,
      // organizadores and panel_* stay uncosted (no entry in the map, same
      // as before this feature) unless/until the shop prices them too.
      const unitCost = ACCESSORY_UNIT_COSTS[mod.type];
      if (unitCost) addLine(mod.label, 1, "pza", unitCost, { category: "hardware" });
    }
  }

  // ── Edge banding — one consolidated line per profile; expandable into a
  // sub-line per module once more than one module uses that profile.
  const EDGE_UNIT_COST = 12;
  for (const [profile, { quantity, perModule }] of edgeAgg) {
    const subLines = Array.from(perModule.entries()).map(([label, ml]) => ({
      label,
      quantity: parseFloat(ml.toFixed(3)),
      unit: "ml",
      unitCost: EDGE_UNIT_COST,
      subtotal: parseFloat((ml * EDGE_UNIT_COST).toFixed(2)),
    }));
    addLine(`Canto ${profile}`, quantity, "ml", EDGE_UNIT_COST, {
      category: "edge",
      subLines: subLines.length > 1 ? subLines : undefined,
    });
  }

  // ── Lambrín, espejo and zócalo de aluminio — each sold as a fixed-size
  // stock piece (3m strips for lambrín/zócalo), so the pooled area/length
  // is covered with whole pieces the same way as edge banding, reporting
  // what's bought and what's left over rather than a raw quantity.
  if (lambrinAreaM2 > 0) {
    const stripsNeeded = Math.ceil(lambrinAreaM2 / (LAMBRIN_PIECE_LENGTH_M * LAMBRIN_STRIP_WIDTH_M) - 1e-9);
    const coveredM2 = stripsNeeded * LAMBRIN_PIECE_LENGTH_M * LAMBRIN_STRIP_WIDTH_M;
    addLine(
      `Lambrín (3m×15cm) — ${stripsNeeded} ${stripsNeeded === 1 ? "pieza" : "piezas"} (sobran ${(coveredM2 - lambrinAreaM2).toFixed(2)} m²)`,
      stripsNeeded, "pza", LAMBRIN_PRICE_PER_PIECE, { category: "edge" },
    );
  }
  if (espejoAreaM2 > 0) {
    addLine("Espejo", parseFloat(espejoAreaM2.toFixed(3)), "m²", MIRROR_PRICE_PER_M2, { category: "board" });
  }
  if (zocaloAluminioMeters > 0) {
    const piecesNeeded = Math.ceil(zocaloAluminioMeters / ZOCALO_ALUMINIO_PIECE_LENGTH_M - 1e-9);
    const coveredM = piecesNeeded * ZOCALO_ALUMINIO_PIECE_LENGTH_M;
    addLine(
      `Zoclo de aluminio (3m) — ${piecesNeeded} ${piecesNeeded === 1 ? "pieza" : "piezas"} (sobran ${(coveredM - zocaloAluminioMeters).toFixed(1)} m)`,
      piecesNeeded, "pza", ZOCALO_ALUMINIO_PRICE_PER_PIECE, { category: "edge" },
    );
  }

  // ── Countertops — sold by the shop only as 6' or 12' stock pieces (never
  // cut-to-order or by the running meter), so the quote has to say exactly
  // which whole pieces to buy, not just a raw length. A 12' piece is worth
  // exactly two 6' ones, so the cheapest (and only relevant) choice is
  // however many 6'-equivalents cover the needed length — whether those are
  // bought as 6' pieces or paired up into 12' pieces doesn't change the
  // total feet purchased (and so not the cost), only the piece count/seams,
  // so pairing into 12' pieces whenever possible is preferred purely to
  // minimize joints.
  //
  // Stock is bought PER RUN, not pooled across the whole project: first
  // group segments by (wall + depth-plane + material) — never merging across
  // materials, since a material change is itself a seam — then within each
  // group walk them in wall order and break into a new run wherever there's
  // a real gap (WALL_GAP_TOLERANCE_M), e.g. the open floor space left for a
  // freestanding stove. Freestanding pieces (islands/peninsulas) already got
  // their own unique wallKey from addCountertop, so they never merge with
  // anything and always land as a single-segment run.
  const M_TO_FT = 1 / 0.3048;
  // Stock countertop lengths the shop actually carries. Largest first so
  // that, when two combinations tie on total waste, pickCountertopStock's
  // tie-break (fewest pieces) also prefers fewer, longer pieces over more,
  // shorter ones — same "reach for the big piece first" instinct the old
  // 6'/12'-only version had.
  const COUNTERTOP_STOCK_LENGTHS_FT = [12, 10, 8, 6, 4];
  const WALL_GAP_TOLERANCE_M = 0.02;
  const WALL_LABELS: Record<number, string> = { 0: "Norte", 90: "Oeste", 180: "Sur", 270: "Este" };
  const fmtFt = (n: number) => {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  // Cheapest way to cover neededFt of countertop from COUNTERTOP_STOCK_LENGTHS_FT
  // stock pieces: smallest total footage (that's what's billed) that's >=
  // neededFt, breaking ties toward fewer pieces. Plain unbounded-coin-change
  // DP over whole feet — stock lengths are all even, so every even total
  // from 4' up is reachable and the search below never runs off the end of
  // the table.
  const pickCountertopStock = (neededFt: number): { totalFt: number; pieces: { length: number; count: number }[] } => {
    // Tiny epsilon guards against a length that's meant to land exactly on a
    // stock-length boundary reading as e.g. 12.0000001' from float
    // conversion and rounding up to an extra, unnecessary piece.
    const target = Math.ceil(neededFt - 1e-9);
    const maxLen = Math.max(...COUNTERTOP_STOCK_LENGTHS_FT);
    const maxSum = target + maxLen;
    const minPieces = new Array(maxSum + 1).fill(Infinity);
    const usedLength = new Array(maxSum + 1).fill(0);
    minPieces[0] = 0;
    for (let s = 1; s <= maxSum; s++) {
      for (const len of COUNTERTOP_STOCK_LENGTHS_FT) {
        if (len <= s && minPieces[s - len] + 1 < minPieces[s]) {
          minPieces[s] = minPieces[s - len] + 1;
          usedLength[s] = len;
        }
      }
    }
    let totalFt = Math.max(target, 0);
    while (totalFt <= maxSum && !Number.isFinite(minPieces[totalFt])) totalFt++;
    const countByLength = new Map<number, number>();
    let remaining = totalFt;
    while (remaining > 0) {
      const len = usedLength[remaining];
      countByLength.set(len, (countByLength.get(len) ?? 0) + 1);
      remaining -= len;
    }
    const pieces = COUNTERTOP_STOCK_LENGTHS_FT
      .filter((len) => countByLength.has(len))
      .map((len) => ({ length: len, count: countByLength.get(len)! }));
    return { totalFt, pieces };
  };

  const segmentsByGroup = new Map<string, CountertopSegment[]>();
  for (const seg of countertopSegments) {
    const key = `${seg.wallKey}::${seg.label}`;
    const list = segmentsByGroup.get(key) ?? [];
    list.push(seg);
    segmentsByGroup.set(key, list);
  }
  interface CountertopRun { label: string; pricePerM2: number; meters: number; rotation: KitchenModule["rotation"] | null; moduleLabel: string; startAlongWall: number }
  const countertopRuns: CountertopRun[] = [];
  for (const segs of segmentsByGroup.values()) {
    segs.sort((a, b) => a.alongWall - b.alongWall);
    let run: CountertopSegment[] = [];
    let runEnd = -Infinity;
    const flushRun = () => {
      if (run.length === 0) return;
      const meters = run.reduce((sum, s) => sum + s.widthM, 0);
      countertopRuns.push({
        label: run[0].label, pricePerM2: run[0].pricePerM2, meters, rotation: run[0].rotation, moduleLabel: run[0].moduleLabel,
        startAlongWall: run[0].alongWall - run[0].widthM / 2,
      });
      run = [];
    };
    for (const seg of segs) {
      const start = seg.alongWall - seg.widthM / 2;
      if (run.length > 0 && start - runEnd > WALL_GAP_TOLERANCE_M) flushRun();
      run.push(seg);
      runEnd = seg.alongWall + seg.widthM / 2;
    }
    flushRun();
  }
  // Left-to-right per wall so, when a wall needs numbering below, "1" is the
  // leftmost run and "2" the next one along — not insertion order, which
  // depends on module iteration order and would number them arbitrarily.
  countertopRuns.sort((a, b) => (a.rotation ?? -1) - (b.rotation ?? -1) || a.startAlongWall - b.startAlongWall);

  // A material name alone is ambiguous once it spans more than one run (two
  // separate walls, or a wall run plus an island) — only then is a
  // disambiguating suffix appended, so the common single-run case stays plain.
  // Two runs can also share the SAME wall (split by a gap, e.g. the stove) —
  // those need a running number on top of the wall name, not just the name
  // twice, so "Norte" alone only appears when that wall has exactly one run.
  const runsPerLabel = new Map<string, number>();
  const runsPerLabelWall = new Map<string, number>();
  for (const r of countertopRuns) {
    runsPerLabel.set(r.label, (runsPerLabel.get(r.label) ?? 0) + 1);
    runsPerLabelWall.set(`${r.label}|${r.rotation}`, (runsPerLabelWall.get(`${r.label}|${r.rotation}`) ?? 0) + 1);
  }
  const wallRunSeen = new Map<string, number>();

  for (const { label, pricePerM2, meters, rotation, moduleLabel } of countertopRuns) {
    const neededFt = meters * M_TO_FT;
    const { totalFt, pieces: stockPieces } = pickCountertopStock(neededFt);
    const wasteFt = totalFt - neededFt;
    const pieces = stockPieces.map(({ length, count }) => `${count} ${count === 1 ? "pieza" : "piezas"} de ${length}'`);
    const pricePerFt = pricePerM2 * STANDARD_COUNTERTOP_DEPTH_M * 0.3048; // $/m² · m(depth) = $/linear m → $/linear ft
    let wallSuffix = "";
    if ((runsPerLabel.get(label) ?? 0) > 1) {
      if (rotation !== null) {
        const wallKey = `${label}|${rotation}`;
        if ((runsPerLabelWall.get(wallKey) ?? 0) > 1) {
          const idx = (wallRunSeen.get(wallKey) ?? 0) + 1;
          wallRunSeen.set(wallKey, idx);
          wallSuffix = ` (${WALL_LABELS[rotation]} ${idx})`;
        } else {
          wallSuffix = ` (${WALL_LABELS[rotation]})`;
        }
      } else {
        wallSuffix = ` (${moduleLabel})`;
      }
    }
    addLine(`Cubierta ${label}${wallSuffix} — ${pieces.join(" + ")} (sobran ${fmtFt(wasteFt)}')`, totalFt, "pies", parseFloat(pricePerFt.toFixed(2)), { category: "countertop" });
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

  // ── Pull-out accessories nested behind a door — one line per type.
  for (const [accType, qty] of pullOutAgg) {
    addLine(PULL_OUT_ACCESSORY_LABELS[accType], qty, "pza", PULL_OUT_ACCESSORY_COSTS[accType], { category: "hardware" });
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
      // so a carpenter can see roughly where each cut goes on each physical
      // sheet — moduleId/moduleLabel ride along so the summary UI can filter
      // "just this module's pieces" (see the module picker in KitchenSummary.tsx).
      const sheetLayouts: { part: string; x: number; y: number; width: number; height: number; moduleId?: string; moduleLabel?: string }[][] = Array.from(
        { length: result.sheets },
        () => []
      );
      for (const p of result.placements) {
        sheetLayouts[p.sheet]?.push({ part: p.label ?? "", x: p.x, y: p.y, width: p.width, height: p.height, moduleId: p.moduleId, moduleLabel: p.moduleLabel });
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
