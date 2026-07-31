// ─── Categories ────────────────────────────────────────────────────────────────
export type ModuleCategory =
  | "lower"       // Muebles bajos (piso)
  | "upper"       // Muebles altos (aéreos)
  | "tower"       // Torres
  | "corner"      // Esquineros — variantes de esquina de muebles existentes
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
  | "base_refrigerador"
  | "desayunador";

// Esquineros reuse a base module's own options/materials/hardware logic
// unchanged — only the carcass/countertop/shelf geometry grows a blind
// fondo×fondo extension. See CornerBlindCabinetMesh in ModulePreview3D.tsx.
export type CornerModuleType =
  | "gabinete_bajo_esquinero_puertas"
  | "gabinete_superior_esquinero_puertas";

export type UpperModuleType =
  | "alacena_aerea"
  | "gabinete_superior"
  | "esquinero_superior"
  | "campanero"
  | "alacena_cristal"
  | "despensero_alto"
  | "gabinete_microondas"
  | "corona_luz"
  | "aereo_hueco_inferior"
  | "cava_vinos";

export type TowerModuleType =
  | "torre_horno_microondas"
  | "torre_despensa"
  | "torre_despensa_jalable"
  | "torre_refrigerador"
  | "torre_almacenamiento"
  | "librero_giratorio_espejo";

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
  | "panel_lateral"
  | "panel_remate"
  | "panel_decorativo"
  | "organizador_especias"
  | "cubertero"
  | "especiero_aluminio";

// Pull-out accessories that live INSIDE a cabinet, behind one specific door —
// not freestanding modules of their own. Picked per-door via
// ModuleOptions.doorAccessories (see DoorDef.pullOutAccessory) and rendered
// sliding out in sync with that door's own open animation (DoorPanel).
export type PullOutAccessoryType = "canasta_especiero_cromado" | "basurero_extraible" | "soporte_garrafon";

export type KitchenModuleType =
  | LowerModuleType
  | UpperModuleType
  | TowerModuleType
  | CornerModuleType
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
/** Whether a module's left/right side needs a panel, and which material pool it draws from.
 *  "lambrin" is a solid decorative wood/MDF-look panel with a subtle vertical
 *  slat (tablilla) relief — a cosmetic covering finish, not a wire mesh —
 *  sold as 3m×15cm strips, e.g. a desayunador's bar-facing side. */
export type SidePanelMode = "ninguno" | "interior" | "exterior" | "lambrin";
/** Same idea as SidePanelMode, for a module's BACK panel — normally hidden against
 *  a wall (plain interior board), but a desayunador/peninsula's back is exposed
 *  toward the seating side, so it can be finished in exterior board or lambrín
 *  instead, and a librero giratorio's back carries a mirror ("espejo"). */
export type BackPanelMode = "interior" | "exterior" | "lambrin" | "espejo";
/** Toe-kick (zócalo) trim material — MDF cut to size, or aluminum strip stock sold in 3m pieces. */
export type ZocaloMaterial = "MDF" | "Aluminio";

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
  hingeLeft: boolean;      // hinge side (ignored when hingeTop is true)
  // Upper cabinets only: hinges along the TOP edge instead of a side,
  // opening outward/upward like a flap or awning door (bottom edge swings
  // out and rises) — hingeLeft is ignored when set.
  hingeTop?: boolean;
  doorStyle: DoorStyle;
  // A pull-out (canasta/basurero/soporte garrafón) mounted just inside this
  // door. Independent of `pullOut` below — with `pullOut` false (the
  // default) it's a hinged door and the accessory slides out on its own
  // rails in sync with the door swinging open; with `pullOut` true, the door
  // itself slides forward on rails and carries the accessory (or the
  // module's fixed shelves, if no accessory is set) with it. Populated from
  // ModuleOptions.doorAccessories, index-aligned with door order, same
  // convention as doorHingeSides.
  pullOutAccessory?: PullOutAccessoryType | null;
  // This door slides straight out on rails instead of swinging on a hinge —
  // see pullOutAccessory above for how it interacts with an assigned
  // accessory. Populated from ModuleOptions.doorPullOut, index-aligned with
  // door order.
  pullOut?: boolean;
}

// ─── Module Options ────────────────────────────────────────────────────────────
export interface ModuleOptions {
  // Structural
  drawers: number;
  doors: number;
  shelves: number;
  // When a module has both drawers and doors (drawers stacked above a door
  // below), this is the height of the whole drawer stack — cm, undefined
  // falls back to the auto default (see AUTO_DRAWER_ZONE_HEIGHT_CM in
  // ModulePreview3D.tsx / kitchenData.ts). Ignored when doors or drawers is 0
  // (nothing to split — the one that exists just fills the usable height).
  drawerZoneHeight?: number;
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
  backsplashMaterial: BoardMaterial | CountertopMaterial | "Azulejo" | "Piedra" | "Vidrio" | "WPC mármol";
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
  // For corner-category modules, leftSidePanel is repurposed to mean the
  // extension's own outer edge ("costado lateral izquierdo") — the extra
  // seam between the original cabinet and the extension gets its own
  // independent slot below.
  leftSidePanel: SidePanelMode;
  rightSidePanel: SidePanelMode;
  // Corner cabinets only ("costado frontal izquierdo"): the extension's own
  // FRONT face — same plane as the doors, but fixed/non-opening since the
  // extension has no door. No "exterior" choice on purpose: a finished
  // exterior-board panel there would read as a fake door front. "ninguno"
  // leaves it open (reach in from the front); "interior" closes it with a
  // plain interior-board filler. There is no internal divider between the
  // original cabinet and the extension — they always share one open cavity.
  leftFrontSidePanel: "ninguno" | "interior";
  // Per-door hinge side override (index-aligned with the auto-generated door
  // order, left to right). Undefined/missing entries fall back to the
  // default alternating pattern (even index = hinges left, odd = hinges
  // right) — same as before this existed, so it's opt-in and non-breaking.
  // "arriba" (upper cabinets only) hinges along the bottom edge instead,
  // opening upward like a lift/flap door.
  doorHingeSides?: ("izquierda" | "derecha" | "arriba")[];
  // Per-door pull-out accessory (index-aligned with the auto-generated door
  // order, same convention as doorHingeSides). null/undefined = no accessory
  // behind that door.
  doorAccessories?: (PullOutAccessoryType | null)[];
  // Per-door: true = this door slides straight out on rails instead of
  // swinging on a hinge (index-aligned with door order). Independent of
  // doorAccessories — a door can be pull-out with or without an accessory
  // assigned (fixed shelves ride along with it either way), and a door with
  // an accessory doesn't require being pull-out (the accessory then slides
  // on its own rails behind the still-hinged door instead).
  doorPullOut?: boolean[];
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
  // Corona de luz only — indirect lighting on the underside: either a
  // continuous LED strip or a row of individual round bulbs spread evenly
  // across the width. Both are flat (negligible thickness).
  lightMode?: "tira" | "foquitos";
  lightStripWidth?: number;   // cm, front-to-back width of the flat LED strip (lightMode "tira")
  bulbCount?: number;         // how many flat round bulbs (lightMode "foquitos")
  lightColor?: string;        // emissive color, e.g. warm white
  // Back panel — see BackPanelMode. Defaults to "interior" (plain board,
  // hidden against the wall) for every module except desayunador.
  backPanelMaterial?: BackPanelMode;
  // Desayunador only — extra countertop depth (cm) added toward the seating
  // side, on top of the cabinet's own (shallower) depth.
  barOverhangCm?: number;
  // Zócalo accessory only — MDF cut to size, or aluminum strip (3m stock pieces).
  zocaloMaterial?: ZocaloMaterial;
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
  // Windows & doors — rendered as flat markers on the perimeter walls in the 3D view
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
    sheets: { part: string; x: number; y: number; width: number; height: number; moduleId?: string; moduleLabel?: string }[][];
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
