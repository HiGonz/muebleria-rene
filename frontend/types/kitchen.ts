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
  | "MDF 15mm"
  | "MDF 18mm"
  | "Melamina blanca 18mm"
  | "Melamina nogal 18mm"
  | "Melamina roble 18mm"
  | "Melamina wengue 18mm"
  | "Triplay 18mm"
  | "MDF lacado brillante"
  | "MDF lacado mate";

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
export type KitchenStyle = "Lineal" | "En L" | "En U" | "En G" | "Isla central" | "Dos paredes";

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
  // Materials
  boardMaterial: BoardMaterial;
  color: string;
  finish: "Natural" | "Lacado brillante" | "Lacado mate" | "Textured";
  // Detailed face layout (when true, drawerDefs/doorDefs override drawers/doors count)
  useDetailedLayout?: boolean;
  drawerDefs?: DrawerDef[];
  doorDefs?: DoorDef[];
}

// ─── Kitchen Module ────────────────────────────────────────────────────────────
export interface KitchenModule {
  id: string;
  category: ModuleCategory;
  type: KitchenModuleType;
  label: string;             // Custom label (e.g., "Cajonera bajo estufa")
  dimensions: ModuleDimensions;
  options: ModuleOptions;
  wall: "A" | "B" | "C" | "isla"; // Which wall this module belongs to
  position: number;          // Index within its wall
}

// ─── Kitchen Draft (for project creation) ─────────────────────────────────────
export interface KitchenDraft {
  // Project metadata
  clientName: string;
  clientPhone: string;
  projectName: string;
  notes: string;
  // Kitchen configuration
  kitchenStyle: KitchenStyle;
  wallALength: number;   // cm - primary wall
  wallBLength: number;   // cm - secondary wall (for L/U)
  wallCLength: number;   // cm - tertiary wall (for U/G)
  ceilingHeight: number; // cm
  // Modules
  modules: KitchenModule[];
  // UI state
  editingModuleId: string | null;
  activeWall: "A" | "B" | "C" | "isla";
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
export interface KitchenMaterialLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
}

export interface KitchenQuoteSummary {
  materialLines: KitchenMaterialLine[];
  subtotalMaterials: number;
  laborCost: number;
  profitCost: number;
  total: number;
  laborPct: number;
  profitPct: number;
}
