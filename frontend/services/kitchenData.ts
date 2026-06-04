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
} from "@/types/kitchen";

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
  boardMaterial: "Melamina blanca 18mm",
  color: "#e8e0d4",
  finish: "Natural",
  useDetailedLayout: false,
  drawerDefs: [],
  doorDefs: [],
};

// ─── Material Costs (MXN per unit) ────────────────────────────────────────────
export const BOARD_COSTS: Record<BoardMaterial, number> = {
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
    defaultOptions: { drawers: 1, doors: 2, shelves: 0 },
    configurableFields: ["height", "width", "depth", "drawers", "doors", "doorStyle", "includesCountertop", "countertopMaterial", "boardMaterial", "color"],
  },
  {
    type: "bajo_parrilla",
    category: "lower",
    label: "Mueble para parrilla",
    description: "Mueble base reforzado para parrilla de asador",
    icon: "🍖",
    defaultDimensions: { height: 82, width: 80, depth: 65 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, hasVentilation: true },
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
    defaultOptions: { drawers: 0, doors: 0, shelves: 0 },
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
    description: "Estufa empotrable de gas o inducción",
    icon: "🔥",
    defaultDimensions: { height: 10, width: 60, depth: 60 },
    defaultOptions: { stoveType: "4 quemadores" },
    configurableFields: ["width", "depth", "stoveType"],
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

export function buildNewModule(type: KitchenModuleType, position = 0, wall: KitchenModule["wall"] = "A"): KitchenModule {
  const entry = getCatalogEntry(type)!;
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: entry.category,
    type,
    label: entry.label,
    dimensions: { ...entry.defaultDimensions },
    options: { ...DEFAULT_OPTIONS, ...entry.defaultOptions },
    wall,
    position,
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

  const addLine = (desc: string, qty: number, unit: string, unitCost: number) => {
    if (qty <= 0) return;
    lines.push({ description: desc, quantity: parseFloat(qty.toFixed(3)), unit, unitCost, subtotal: parseFloat((qty * unitCost).toFixed(2)) });
  };

  for (const mod of modules) {
    const { dimensions: d, options: o } = mod;
    const boardCost = BOARD_COSTS[o.boardMaterial] ?? 180;
    const w = d.width / 100;
    const h = d.height / 100;
    const dp = d.depth / 100;

    if (mod.category === "lower") {
      // Side panels × 2, top, bottom, back
      const panelArea = (2 * h * dp + 2 * w * dp + w * h) * 1.08;
      addLine(`[${mod.label}] Tableros ${o.boardMaterial}`, panelArea, "m²", boardCost);
      if (o.shelves > 0) addLine(`[${mod.label}] Repisas interiores`, o.shelves * (w * dp) * 1.05, "m²", boardCost);
      if (o.doors > 0) addLine(`[${mod.label}] Frentes de puerta ${o.doorStyle}`, o.doors * (h * (w / o.doors)), "m²", boardCost);
      if (o.drawers > 0) addLine(`[${mod.label}] Frentes de cajón`, o.drawers * ((h * 0.2) * w), "m²", boardCost);
      // Edge banding
      const edgeMl = 2 * (d.width + d.height + d.depth) / 100 * 1.15;
      addLine(`[${mod.label}] Canto ${o.edgeProfile}`, edgeMl, "ml", 12);
      // Hardware
      if (o.doors > 0) addLine(`[${mod.label}] Bisagras (pares)`, o.doors, "pares", o.drawerSystem === "Soft-close" ? 65 : 35);
      if (o.drawers > 0) addLine(`[${mod.label}] Correderas cajón`, o.drawers, "pares", HARDWARE_COSTS.corredera_softclose);
      if (o.includesCountertop && mod.type !== "base_refrigerador") {
        const ctCost = COUNTERTOP_COSTS[o.countertopMaterial] ?? 420;
        addLine(`[${mod.label}] Cubierta ${o.countertopMaterial}`, w * (dp + o.countertopOverhang / 100), "m²", ctCost);
      }
    } else if (mod.category === "upper") {
      const panelArea = (2 * h * dp + 2 * w * dp + w * h) * 1.08;
      addLine(`[${mod.label}] Tableros ${o.boardMaterial}`, panelArea, "m²", boardCost);
      if (o.shelves > 0) addLine(`[${mod.label}] Repisas interiores`, o.shelves * w * dp * 1.05, "m²", boardCost);
      if (o.doors > 0) addLine(`[${mod.label}] Frentes de puerta ${o.doorStyle}`, o.doors * h * (w / o.doors), "m²", boardCost);
      const edgeMl = 2 * (d.width + d.height + d.depth) / 100 * 1.15;
      addLine(`[${mod.label}] Canto ${o.edgeProfile}`, edgeMl, "ml", 12);
      if (o.doors > 0) addLine(`[${mod.label}] Bisagras (pares)`, o.doors, "pares", 65);
    } else if (mod.category === "tower") {
      const panelArea = (2 * h * dp + 2 * w * dp + w * h) * 1.08;
      addLine(`[${mod.label}] Tableros ${o.boardMaterial}`, panelArea, "m²", boardCost);
      if (o.shelves > 0) addLine(`[${mod.label}] Repisas interiores`, o.shelves * w * dp * 1.05, "m²", boardCost);
      if (o.doors > 0) addLine(`[${mod.label}] Frentes de puerta ${o.doorStyle}`, o.doors * (h / 3) * w, "m²", boardCost);
      const edgeMl = 2 * (d.width + d.height + d.depth) / 100 * 1.15;
      addLine(`[${mod.label}] Canto ${o.edgeProfile}`, edgeMl, "ml", 12);
    } else if (mod.category === "countertop") {
      const ctCost = COUNTERTOP_COSTS[o.countertopMaterial] ?? 420;
      addLine(`[${mod.label}] ${o.countertopMaterial}`, w * (dp + o.countertopOverhang / 100), "m²", ctCost);
      if (o.hasBacksplash) addLine(`[${mod.label}] Salpicadero ${o.backsplashMaterial}`, w * (o.backsplashHeight / 100), "m²", 350);
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const laborPct = 30;
  const profitPct = 20;
  const laborCost = subtotal * (laborPct / 100);
  const profitCost = (subtotal + laborCost) * (profitPct / 100);
  const total = subtotal + laborCost + profitCost;

  return {
    lines,
    summary: { materialLines: lines, subtotalMaterials: subtotal, laborCost, profitCost, total, laborPct, profitPct },
  };
}

// Re-export types needed by consumers
export type { KitchenModule };
