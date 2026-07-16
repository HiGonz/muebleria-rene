// ─── Categories ────────────────────────────────────────────────────────────────
export type ModuleCategory =
  | "lower"       // Muebles bajos (piso)
  | "upper"       // Muebles altos (aéreos)
  | "tower"       // Torres
  | "countertop"  // Encimeras y superficies
  | "appliance"   // Espacios para electrodomésticos
  | "accessory";  // Accesorios y complementos

// ─── Module Types ──────────────────────────────────────────────────────────────
export type LowerModuleType =
  | "cajonera"
  | "bajo_tarja"
  | "bajo_estufa"
  | "bajo_parrilla"
  | "bajo_horno_empotrable"
  | "esquinero_inferior"
  | "gabinete_bajo_puertas"
  | "gabinete_bajo_cajones"
  | "botellero_extraible"
  | "despensero_bajo"
  | "bajo_lavavajillas"
  | "base_refrigerador";

export type UpperModuleType =
  | "alacena_aerea"
  | "gabinete_superior"
  | "esquinero_superior"
  | "campanero"
  | "alacena_cristal"
  | "despensero_alto"
  | "gabinete_microondas";

export type TowerModuleType =
  | "torre_horno_microondas"
  | "torre_despensa"
  | "torre_despensa_jalable"
  | "torre_refrigerador"
  | "torre_almacenamiento";

export type CountertopModuleType =
  | "cubierta"
  | "barra_desayunadora"
  | "isla_central"
  | "peninsula"
  | "cubierta_tarja"
  | "cubierta_parrilla";

export type ApplianceModuleType =
  | "nicho_refrigerador"
  | "nicho_microondas"
  | "nicho_horno"
  | "espacio_lavavajillas"
  | "espacio_centro_bebidas"
  | "espacio_cava_vinos";

export type AccessoryModuleType =
  | "tarja"
  | "parrilla"
  | "estufa"
  | "refrigerador"
  | "microondas"
  | "lavavajillas"
  | "campana_extractora"
  | "herrajes"
  | "zoclo"
  | "panel_lateral"
  | "panel_remate"
  | "panel_decorativo"
  | "organizador_especias"
  | "cubertero"
  | "basurero_extraible";

export type KitchenModuleType =
  | LowerModuleType
  | UpperModuleType
  | TowerModuleType
  | CountertopModuleType
  | ApplianceModuleType
  | AccessoryModuleType;

// ─── Materials ─────────────────────────────────────────────────────────────────
export type BoardMaterial =
  | "Melamina blanca 15mm"
  | "MDF 15mm"
  | "MDF 18mm"
  | "Melamina blanca 18mm"
  | "Melamina nogal 18mm"
  | "Melamina roble 18mm"
  | "Melamina wengue 18mm"
  | "Triplay 18mm"
  | "MDF lacado brillante"
  | "MDF lacado mate";

// ─── Exterior wood textures ────────────────────────────────────────────────────
// Small hand-picked catalog for now — a future ERP screen will let the shop add
// more. Each id maps to a procedurally-generated wood-grain texture (see
// components/3d/woodTextures.ts) so no image assets are needed.
export type ExteriorTextureId = "blanco_liso" | "roble_claro" | "nogal_oscuro" | "naranja_vibrante";

export type CountertopMaterial =
  | "Granito natural"
  | "Granito reconstituido"
  | "Cuarzo engineered"
  | "Mármol"
  | "Acero inoxidable"
  | "Postformado"
  | "Cemento pulido"
  | "Corian";

export type SinkMaterial = "Acero inoxidable" | "Porcelana" | "Granito negro" | "Compuesto";
export type SinkStyle = "Un seno" | "Dos senos" | "Seno con escurridor" | "Empotrada" | "Sobre encimera";

export type DoorStyle = "Lisa" | "Marco y panel" | "Vidrio esmerilado" | "Vidrio transparente" | "Sin puerta";
export type DrawerSystem = "Simple" | "Extracción total" | "Soft-close" | "Con frente decorativo";
export type EdgeProfile = "PVC 0.4mm" | "PVC 2mm" | "ABS 1mm" | "Madera sólida";
export type HardwareFinish = "Acero inoxidable" | "Negro mate" | "Dorado" | "Bronce" | "Cromo" | "Sin jaladores";

// ─── Side panels ───────────────────────────────────────────────────────────────
/** Whether a module's left/right side needs a panel, and which material pool it draws from. */
export type SidePanelMode = "ninguno" | "interior" | "exterior";

// ─── Module Dimensions ─────────────────────────────────────────────────────────
export interface ModuleDimensions {
  height: number;  // cm
  width: number;   // cm
  depth: number;   // cm
}

// ─── Face Layout (detailed) ───────────────────────────────────────────────────
/** Individual drawer/facade panel for detailed face layout */
export interface DrawerDef {
  id: string;
  label: string;
  heightCm: number;        // face panel height in cm
  fromBottomCm: number;    // distance from interior floor in cm
  isGhost: boolean;        // true = visual panel only (no runners, no extra cost)
  widthPct: number;        // percentage of interior width, 0-100 (default 100)
  offsetPct: number;       // left-offset percentage, 0-100 (default 0)
  drawerSystem: DrawerSystem;
  orientation?: "horizontal" | "vertical";  // handle orientation (default "horizontal")
}

/** Individual door panel for detailed face layout */
export interface DoorDef {
  id: string;
  label: string;
  widthPct: number;        // percentage of interior width, 0-100
  offsetPct: number;       // left-offset percentage, 0-100
  fromBottomCm: number;    // distance from interior floor in cm
  heightCm: number;        // face panel height in cm
  hingeLeft: boolean;      // hinge side
  doorStyle: DoorStyle;
}

// ─── Module Options ────────────────────────────────────────────────────────────
export interface ModuleOptions {
  // Structural
  drawers: number;
  doors: number;
  shelves: number;
  // When true (and the module has exactly one door), the shelves mount to
  // the inside of that door and swing out with it instead of sitting fixed
  // in the carcass — a "puerta con estantes jalables" pull-out larder door.
  pullOutShelves?: boolean;
  // Lower cabinet specifics
  hasToeKick: boolean;
  toeKickHeight: number;        // cm (default 8)
  hasLegs: boolean;
  // Countertop integration
  includesCountertop: boolean;
  countertopMaterial: CountertopMaterial;
  countertopThickness: number;  // cm (default 3)
  countertopOverhang: number;   // cm extra on front (default 2)
  // Door & drawer style
  doorStyle: DoorStyle;
  drawerSystem: DrawerSystem;
  // Hardware
  hardwareFinish: HardwareFinish;
  // Edge
  edgeProfile: EdgeProfile;
  // Upper cabinet specifics
  mountHeight: number;          // cm from floor (default 144)
  hasUnderLight: boolean;
  // Sink (bajo_tarja / cubierta_tarja / tarja)
  sinkMaterial: SinkMaterial;
  sinkStyle: SinkStyle;
  sinkHoles: number;
  // Countertop details (cubierta, isla, barra)
  hasBacksplash: boolean;
  backsplashHeight: number;     // cm (default 60)
  backsplashMaterial: BoardMaterial | CountertopMaterial | "Azulejo" | "Piedra" | "Vidrio";
  // Tower openings
  ovenOpening: boolean;
  microwaveOpening: boolean;
  ovenHeight: number;           // cm space for oven
  microwaveHeight: number;      // cm space for microwave
  // Corner cabinets
  cornerType: "magic_corner" | "lazy_susan" | "diagonal" | "dead_corner";
  // Appliance space
  applianceWidth: number;       // cm (standard appliance width)
  applianceHeight: number;      // cm
  hasVentilation: boolean;
  // Accessory specifics
  stoveType: "4 quemadores" | "5 quemadores" | "6 quemadores" | "Vitrocerámica" | "Inducción";
  hoodType: "Telescópica" | "Decorativa" | "De pared" | "Integrada en mueble";
  hoodWidth: number;
  // General
  notes: string;
  // Materials (interior board — carcass: top/bottom/back/shelves)
  boardMaterial: BoardMaterial;
  color: string;
  finish: "Natural" | "Lacado brillante" | "Lacado mate" | "Textured";
  // Materials (exterior board — visible/finished faces: doors, drawer fronts, and
  // any side panel manually marked "exterior". Comes from a different sheet/pool.)
  exteriorMaterial: BoardMaterial;
  exteriorColor: string;
  exteriorFinish: "Natural" | "Lacado brillante" | "Lacado mate" | "Textured";
  // Wood-grain finish for exterior faces (doors, drawer fronts, exterior side
  // panels, and the zócalo's front) — takes over from exteriorColor when set.
  exteriorTexture: ExteriorTextureId;
  // Side panels: a module neighboring another on one side doesn't need a panel there;
  // marked manually per module since adjacency isn't inferred from geometry.
  leftSidePanel: SidePanelMode;
  rightSidePanel: SidePanelMode;
  // Detailed face layout (when true, drawerDefs/doorDefs override drawers/doors count)
  useDetailedLayout?: boolean;
  drawerDefs?: DrawerDef[];
  doorDefs?: DoorDef[];
  // Countertop appearance overrides (cubierta, isla, barra, peninsula) — when
  // set, these take over from the countertopMaterial's default look so a shop
  // can fine-tune a specific slab without inventing a whole new material.
  countertopColor?: string;
  countertopTexture?: ExteriorTextureId | "ninguna";
  // References a CountertopModel id (services/kitchenData.ts) — a specific
  // stocked slab bundling name/color/price in one pick. Picking one also sets
  // countertopMaterial + countertopColor; left unset for legacy modules that
  // only ever had the plain material dropdown.
  countertopModel?: string;
}

// ─── Kitchen Module ────────────────────────────────────────────────────────────
export interface KitchenModule {
  id: string;
  category: ModuleCategory;
  type: KitchenModuleType;
  label: string;             // Custom label (e.g., "Cajonera bajo estufa")
  dimensions: ModuleDimensions;
  options: ModuleOptions;
  x: number;                 // cm — center of the module's footprint, room-space X
  z: number;                 // cm — center of the module's footprint, room-space Z
  rotation: 0 | 90 | 180 | 270; // degrees around Y, set at placement, changed via "rotate" button
}

// ─── Room Openings (windows & doors) ──────────────────────────────────────────
export type WallSide = "north" | "south" | "east" | "west";
export type OpeningType = "window" | "door";

export interface WallOpening {
  id: string;
  type: OpeningType;
  wall: WallSide;
  offset: number;      // cm — from the wall's start corner (x=0 for north/south, z=0 for east/west) to the opening's center
  width: number;       // cm
  height: number;       // cm — opening height, sill to lintel
  sillHeight: number;   // cm — floor to the opening's bottom edge (0 for doors)
}

// ─── Kitchen Draft (for project creation) ─────────────────────────────────────
export interface KitchenDraft {
  // Project metadata
  clientName: string;
  clientPhone: string;
  projectName: string;
  notes: string;
  // Kitchen configuration — a free rectangular room, modules placed freely inside it
  roomWidth: number;     // cm
  roomDepth: number;     // cm
  ceilingHeight: number; // cm
  // Modules
  modules: KitchenModule[];
  // Windows & doors — rendered as gaps in the perimeter walls in the 3D view
  openings: WallOpening[];
  // UI state
  editingModuleId: string | null;
}

// ─── Module Catalog Entry ─────────────────────────────────────────────────────
export interface ModuleCatalogEntry {
  type: KitchenModuleType;
  category: ModuleCategory;
  label: string;
  description: string;
  icon: string;          // emoji icon
  defaultDimensions: ModuleDimensions;
  defaultOptions: Partial<ModuleOptions>;
  configurableFields: Array<keyof ModuleOptions | keyof ModuleDimensions>;
}

// ─── Kitchen Quote ─────────────────────────────────────────────────────────────
export type KitchenCostCategory = "board" | "hardware" | "countertop" | "edge";

export interface KitchenMaterialLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  category?: KitchenCostCategory;
  /** Per-part cut breakdown (sheet lines only) — exact width×height (cm) and quantity of each cut. */
  cutDetails?: { part: string; width: number; height: number; count: number; areaM2: number }[];
  /** Simple per-sheet cut diagram (sheet lines only) — where each piece sits on its sheet. */
  cutLayout?: {
    sheetWidthCm: number;
    sheetHeightCm: number;
    sheets: { part: string; x: number; y: number; width: number; height: number }[][];
  };
  /** Sub-items when this line groups several related items (e.g. hardware types) under one row. */
  subLines?: { label: string; quantity: number; unit: string; unitCost: number; subtotal: number }[];
}

export interface KitchenQuoteSummary {
  materialLines: KitchenMaterialLine[];
  subtotalMaterials: number;
  laborCost: number;
  profitCost: number;
  total: number;
  laborPct: number;
  profitPct: number;
  /** Share of the materials subtotal each cost category takes — e.g. "Tableros: 76%". */
  categoryBreakdown: { category: KitchenCostCategory | "other"; label: string; subtotal: number; pct: number }[];
}
