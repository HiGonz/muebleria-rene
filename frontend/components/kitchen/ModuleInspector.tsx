"use client";

import { Fragment, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Trash2, Copy, RotateCw, Lock, Unlock } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, NumberInput, Textarea } from "@/components/ui/input";
import { BOARD_COSTS, COUNTERTOP_MODELS, PULL_OUT_ACCESSORY_LABELS, NICHE_ACCESSORY_MATCH, getCatalogEntry } from "@/services/kitchenData";
import { WOOD_TEXTURES } from "@/components/3d/woodTextures";
import type { BoardMaterial, ExteriorTextureId, KitchenModule, PullOutAccessoryType, SidePanelMode } from "@/types/kitchen";

const ModulePreview3D = dynamic(
  () => import("@/components/3d/ModulePreview3D").then((m) => ({ default: m.ModulePreview3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-55 w-full items-center justify-center rounded-xl border border-ivory/8 bg-surface">
        <span className="text-xs text-warmgray/70">Cargando vista 3D…</span>
      </div>
    ),
  }
);

type ModOptions = KitchenModule["options"];

const SIDE_PANEL_OPTIONS: { value: SidePanelMode; label: string }[] = [
  { value: "ninguno", label: "Ninguno (vecino)" },
  { value: "interior", label: "Interior" },
  { value: "exterior", label: "Exterior (de punta)" },
  { value: "lambrin", label: "Lambrín" },
];

const BACK_PANEL_OPTIONS: { value: NonNullable<ModOptions["backPanelMaterial"]>; label: string }[] = [
  { value: "interior", label: "Interior (oculto contra el muro)" },
  { value: "exterior", label: "Exterior (acabado)" },
  { value: "lambrin", label: "Lambrín" },
  { value: "puertas", label: "Puertas" },
  { value: "alacena", label: "Alacena abierta" },
  { value: "espejo", label: "Espejo" },
];

const ZOCALO_MATERIAL_OPTIONS: { value: NonNullable<ModOptions["zocaloMaterial"]>; label: string }[] = [
  { value: "Exterior", label: "Tablero exterior (cortado a medida)" },
  { value: "Interior", label: "Tablero interior (cortado a medida)" },
  { value: "Aluminio", label: "Aluminio (tira de 3m)" },
];

const DOOR_ACCESSORY_OPTIONS: { value: "" | PullOutAccessoryType; label: string }[] = [
  { value: "", label: "Ninguno" },
  ...(Object.entries(PULL_OUT_ACCESSORY_LABELS) as [PullOutAccessoryType, string][]).map(([value, label]) => ({ value, label })),
];

const DOOR_HINGE_OPTIONS: { value: "izquierda" | "derecha"; label: string }[] = [
  { value: "izquierda", label: "Izquierda (abre a la izquierda)" },
  { value: "derecha", label: "Derecha (abre a la derecha)" },
];

// Upper cabinets only: a third choice, hinged along the bottom edge and
// opening upward like a lift/flap door — doesn't make sense on a base
// cabinet (nothing to swing up into), so it's excluded from DOOR_HINGE_OPTIONS.
const DOOR_HINGE_OPTIONS_UPPER: { value: "izquierda" | "derecha" | "arriba"; label: string }[] = [
  { value: "izquierda", label: "Izquierda (abre a la izquierda)" },
  { value: "derecha", label: "Derecha (abre a la derecha)" },
  { value: "arriba", label: "Abatible (bisagra arriba, jaladera abajo)" },
];

// Independent of hinge side — a chapulina hinge swings open to ~170°
// instead of a standard hinge's more limited angle, regardless of which
// edge it's mounted on.
const DOOR_HINGE_TYPE_OPTIONS: { value: "normal" | "chapulina"; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "chapulina", label: "Chapulina (abre 170°)" },
];

// No "exterior" choice here on purpose — a finished exterior-board panel on
// the corner extension's front would read as a fake door that doesn't open.
const FRONT_FILLER_OPTIONS: { value: "ninguno" | "interior"; label: string }[] = [
  { value: "ninguno", label: "Ninguno (abierto)" },
  { value: "interior", label: "Interior (panel liso)" },
];

// ─── Field helpers (kept local to this component — the legacy ModuleForm used
// by the Constructor tab is being migrated away from, not shared with) ────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-warmgray">{label}</p>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-warmgray uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// Default (no manual override) drawer-zone height shown in the field below —
// mirrors resolveDrawerZoneHeight's auto branch in ModulePreview3D.tsx /
// kitchenData.ts (~16cm per drawer, capped so the door zone underneath
// keeps at least 40cm), just for the number this input starts at.
const AUTO_DRAWER_HEIGHT_CM = 16;
const MIN_DOOR_ZONE_CM = 40;
function defaultDrawerZoneHeight(module: KitchenModule): number {
  const { dimensions: d, options: o, category, type } = module;
  const isUpper = category === "upper" || type === "esquinero_triangular" || type === "esquinero_triangular_puerta" || type === "gabinete_pared_esquinero_puertas";
  const toeKick = !isUpper && o.hasToeKick ? o.toeKickHeight : 0;
  const ctThick = o.includesCountertop ? o.countertopThickness : 0;
  const topMargin = isUpper ? 0 : 6;
  const usableH = Math.max(d.height - toeKick - ctThick - topMargin, 0);
  const maxDrawerZone = Math.max(usableH - MIN_DOOR_ZONE_CM, 0);
  return Math.round(Math.min(o.drawers * AUTO_DRAWER_HEIGHT_CM, maxDrawerZone));
}

function NumInput({ value, onChange, min = 0, max = 9999, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string;
}) {
  return <NumberInput value={value} onChange={onChange} min={min} max={max} unit={unit} />;
}

// Quick presets for a numeric field — most cabinets are either 1 or 2 doors,
// so these sit above the NumInput to set the common case in one click while
// the number field still covers everything else (0, 3+).
function QuickCountButtons({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
            value === n ? "border-brass bg-brass/15 text-brass-soft" : "border-ivory/10 bg-ivory/3 text-ivory/70 hover:border-ivory/25"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function SelectInput<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-3 text-sm text-ivory"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
      ))}
    </select>
  );
}

function TexturePicker({ value, onChange }: { value: ExteriorTextureId; onChange: (v: ExteriorTextureId) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WOOD_TEXTURES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          title={t.label}
          className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
            value === t.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
          }`}
        >
          <span className="h-8 w-12 rounded-md border border-black/20" style={{ backgroundColor: t.swatch }} />
          <span className="text-[10px] text-warmgray">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function CountertopModelPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {COUNTERTOP_MODELS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
            value === m.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
          }`}
        >
          <span className="h-7 w-7 shrink-0 rounded-md border border-black/20" style={{ backgroundColor: m.color }} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-medium text-ivory">{m.label}</span>
            <span className="block text-[10px] text-warmgray">${m.pricePerM2.toLocaleString("es-MX")}/m²</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const BOARD_OPTIONS = (Object.keys(BOARD_COSTS) as BoardMaterial[]).map((k) => ({ value: k, label: k }));

// ─── Main component ────────────────────────────────────────────────────────────
// The simplified, per-type-aware replacement for the Constructor's Distribución
// + Opciones tabs — opened from the gear icon on a selected module in Vista 3D,
// without leaving that tab. Field set is fully tailored for "cajonera" so far;
// other lower/upper/tower types get a reasonable generic fallback until they're
// migrated too.
export function ModuleInspector() {
  const {
    getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
  } = useKitchenStore();
  const module = getEditingModule();
  // Delete used to live in the header right next to the "×" close button,
  // where a mis-click permanently removed a module with no way back — moved
  // to its own footer row, away from close, and now needs a second
  // confirming click instead of firing immediately. Tracked by module id
  // (not a plain boolean) so switching to a different module can't leave a
  // stale "confirming" state armed on the wrong one.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  if (!module) return null;

  const opt = module.options;
  const dim = module.dimensions;
  const { category, type } = module;

  const updateDim = (key: keyof typeof dim, val: number) => updateModule(module.id, { dimensions: { ...dim, [key]: val } });
  const updateOpt = (key: keyof ModOptions, val: unknown) => updateModule(module.id, { options: { ...opt, [key]: val } as ModOptions });

  const isConfirmingDelete = confirmDeleteId === module.id;
  const handleDeleteClick = () => {
    if (isConfirmingDelete) {
      removeModule(module.id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(module.id);
    }
  };

  // The triangular esquineros and the wall blind-corner cabinet are category
  // "corner" (so they group under Esquineros in the catalog) but are
  // wall-mounted like any other aéreo — treat them as isUpper, not isLower,
  // for every field this drives (zócalo section, mountHeight, door-hinge
  // options).
  const isUpperCorner = type === "esquinero_triangular" || type === "esquinero_triangular_puerta" || type === "gabinete_pared_esquinero_puertas";
  const isLower = (category === "lower" || category === "corner") && !isUpperCorner;
  const isUpper = category === "upper" || isUpperCorner;
  const isTower = category === "tower";
  const isCountertop = category === "countertop";
  const isAppliance = category === "appliance";
  const isAccessory = category === "accessory";
  // Decorative door/window — just a shape + color, no board material,
  // doors/shelves, or countertop concept at all.
  const isOpening = category === "opening";
  const isCajonera = type === "cajonera";
  // Corona de luz is a decorative light valance, not a storage cabinet — no
  // doors/drawers/countertop concept, so those generic sections are skipped
  // in favor of its own "Iluminación" section below.
  const isLightCrown = type === "corona_luz";
  // Cajón con hueco superior has its own dedicated mesh (CajonHuecoSuperiorMesh)
  // with a fixed single drawer and a fixed open cubby above it — doors/
  // drawers/shelves counts and drawer-zone height aren't read by that mesh
  // at all, so those fields would silently do nothing if shown.
  const isFixedDrawerHueco = type === "cajon_hueco_superior";
  const showHeightField = !(isCountertop && type === "cubierta");
  // Cabinets can optionally carry their own built-in countertop; standalone
  // countertop modules (cubierta, isla, etc.) always are one, so there's
  // nothing to toggle — and it's meaningless for an appliance/accessory.
  const canToggleCountertop = (isLower || isUpper || isTower) && !isLightCrown;
  const showCountertopSection = isCountertop || canToggleCountertop;
  const showCountertopAppearance = isCountertop || (opt.includesCountertop && canToggleCountertop);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-3 py-2 md:px-5 md:py-4">
        <p className="truncate font-display text-sm font-semibold text-ivory">{opt.locked && "🔒 "}{module.label}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => rotateModule(module.id)}
            title={opt.locked ? "Desbloquea el mueble para rotarlo" : "Rotar 90°"}
            disabled={opt.locked}
            className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <RotateCw size={15} />
          </button>
          <button onClick={() => duplicateModule(module.id)} title="Duplicar" className="rounded-lg p-1.5 text-warmgray hover:bg-ivory/8 hover:text-ivory transition-colors">
            <Copy size={15} />
          </button>
          <button
            onClick={() => toggleModuleLock(module.id)}
            title={opt.locked ? "Desbloquear mueble" : "Bloquear mueble"}
            className={`rounded-lg p-1.5 transition-colors ${opt.locked ? "text-brass-soft hover:bg-brass/15 hover:text-brass" : "text-warmgray hover:bg-ivory/8 hover:text-ivory"}`}
          >
            {opt.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button onClick={() => setEditingModule(null)} className="ml-1 text-xl leading-none text-warmgray hover:text-ivory transition-colors">&times;</button>
        </div>
      </div>

      {opt.locked && (
        <div className="flex shrink-0 items-center gap-2 border-b border-ivory/8 bg-brass/10 px-4 py-2 text-xs text-brass-soft">
          <Lock size={13} className="shrink-0" />
          <span className="flex-1">Mueble bloqueado — desbloquéalo para editarlo, moverlo o eliminarlo.</span>
          <button onClick={() => toggleModuleLock(module.id)} className="shrink-0 font-semibold underline hover:text-brass">
            Desbloquear
          </button>
        </div>
      )}

      {/* ── 3D Preview ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4">
        <ModulePreview3D module={module} />
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-5 ${opt.locked ? "pointer-events-none opacity-50" : ""}`}>
        {/* ── Name ──────────────────────────────────────────────────────── */}
        <FieldGroup label="Nombre del mueble">
          <Input value={module.label} onChange={(e) => updateModule(module.id, { label: e.target.value })} />
        </FieldGroup>

        {/* ── Dimensions ────────────────────────────────────────────────── */}
        <Section label="Dimensiones">
          <div className="grid grid-cols-3 gap-3">
            {showHeightField && (
              <FieldGroup label="Alto">
                <NumInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
              </FieldGroup>
            )}
            <FieldGroup label="Ancho">
              <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Fondo">
              <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
            </FieldGroup>
            {isLightCrown && (
              <FieldGroup label="Separación del muro">
                <NumInput value={opt.wallOffset ?? 30} onChange={(v) => updateOpt("wallOffset", v)} min={0} max={60} unit="cm" />
              </FieldGroup>
            )}
          </div>
          {isLightCrown && (
            <p className="mt-2 text-[10px] text-warmgray/70">
              La corona no va pegada al muro como un aéreo — es una visera. Ajusta la separación para que quede encima
              y por delante de los muebles aéreos de abajo.
            </p>
          )}
        </Section>

        {/* ── Puerta/ventana decorativa: just a color, no board material ──── */}
        {isOpening && (
          <Section label="Apariencia">
            <FieldGroup label={type === "ventana_decorativa" ? "Color del marco" : "Color de la puerta"}>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={opt.color || "#8b6142"}
                  onChange={(e) => updateOpt("color", e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-ivory/10 bg-transparent p-1"
                />
                <Input value={opt.color || ""} onChange={(e) => updateOpt("color", e.target.value)} placeholder="#8b6142" className="font-mono text-sm" />
              </div>
            </FieldGroup>
          </Section>
        )}

        {/* ── Boards ────────────────────────────────────────────────────── */}
        {!isCountertop && !isAppliance && !isAccessory && !isOpening && (
          <>
            <div className="rounded-xl border border-ivory/8 bg-ivory/3 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-warmgray">Tablero interior</p>
              <p className="mt-0.5 text-xs text-ivory/80">Melamina blanca 15mm · Blanco</p>
              <p className="mt-0.5 text-[10px] text-warmgray/70">Estándar del taller — no configurable por mueble.</p>
            </div>

            <Section label="Tablero exterior (puertas, cajones y remates visibles)">
              <div className="space-y-3">
                <FieldGroup label="Material">
                  <SelectInput value={opt.exteriorMaterial} onChange={(v) => applyExteriorToAll(v, opt.exteriorTexture)} options={BOARD_OPTIONS} />
                </FieldGroup>
                <FieldGroup label="Acabado / textura">
                  <TexturePicker value={opt.exteriorTexture} onChange={(v) => applyExteriorToAll(opt.exteriorMaterial, v)} />
                </FieldGroup>
                <p className="text-[10px] text-warmgray/70">Se aplica a toda la cocina — es el mismo acabado en todos los muebles.</p>
              </div>
            </Section>

            {category === "corner" && (
              <Section label="Orientación del esquinero">
                <FieldGroup label="Lado de la extensión ciega">
                  <div className="flex gap-1.5">
                    {([
                      { value: "izquierda", label: "Izquierda" },
                      { value: "derecha", label: "Derecha" },
                    ] as const).map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => updateOpt("cornerBlindSide", o.value)}
                        aria-pressed={(opt.cornerBlindSide ?? "izquierda") === o.value}
                        className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                          (opt.cornerBlindSide ?? "izquierda") === o.value
                            ? "border-brass bg-brass/15 text-brass-soft"
                            : "border-ivory/10 bg-ivory/3 text-ivory/70 hover:border-ivory/25"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </FieldGroup>
                <p className="mt-2 text-[10px] text-warmgray/70">
                  Invierte todo el mueble para que la esquina ciega quede del lado contrario — útil cuando la pared corre hacia el otro lado.
                </p>
              </Section>
            )}

            <Section label="Paneles laterales">
              <div className="grid grid-cols-2 gap-3">
                {category === "corner" ? (
                  <>
                    <FieldGroup label="Costado frontal izquierdo">
                      <SelectInput value={opt.leftFrontSidePanel} onChange={(v) => updateOpt("leftFrontSidePanel", v)} options={FRONT_FILLER_OPTIONS} />
                    </FieldGroup>
                    <FieldGroup label="Costado lateral izquierdo (extensión)">
                      <SelectInput value={opt.leftSidePanel} onChange={(v) => updateOpt("leftSidePanel", v)} options={SIDE_PANEL_OPTIONS} />
                    </FieldGroup>
                  </>
                ) : (
                  <FieldGroup label="Costado izquierdo">
                    <SelectInput value={opt.leftSidePanel} onChange={(v) => updateOpt("leftSidePanel", v)} options={SIDE_PANEL_OPTIONS} />
                  </FieldGroup>
                )}
                <FieldGroup label="Costado derecho">
                  <SelectInput value={opt.rightSidePanel} onChange={(v) => updateOpt("rightSidePanel", v)} options={SIDE_PANEL_OPTIONS} />
                </FieldGroup>
              </div>
              {category === "corner" && (
                <p className="mt-2 text-[10px] text-warmgray/70">
                  El costado frontal izquierdo es el propio frente de la extensión (abierto o cerrado con un panel liso, nunca una puerta); el costado lateral izquierdo es su borde exterior, para cuando se une a otro mueble.
                </p>
              )}
            </Section>

            {(type === "desayunador" || type === "librero_giratorio_espejo" || opt.islandMode || opt.backPanelMaterial === "puertas" || opt.backPanelMaterial === "alacena") && (
              <Section label="Panel trasero">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Material">
                    <SelectInput
                      value={opt.backPanelMaterial ?? "interior"}
                      onChange={(v) => updateOpt("backPanelMaterial", v)}
                      options={type === "librero_giratorio_espejo" ? BACK_PANEL_OPTIONS.filter((o) => o.value !== "puertas" && o.value !== "alacena") : BACK_PANEL_OPTIONS.filter((o) => o.value !== "espejo")}
                    />
                  </FieldGroup>
                  {(type === "desayunador" || opt.islandMode) && (
                    <FieldGroup label="Vuelo extra de cubierta">
                      <NumInput value={opt.barOverhangCm ?? (type === "desayunador" ? 30 : 0)} onChange={(v) => updateOpt("barOverhangCm", v)} min={0} max={60} unit="cm" />
                    </FieldGroup>
                  )}
                  {opt.backPanelMaterial === "puertas" && (
                    <FieldGroup label="Núm. puertas traseras">
                      <NumInput value={opt.backDoors ?? 0} onChange={(v) => updateOpt("backDoors", v)} min={0} max={6} />
                    </FieldGroup>
                  )}
                  {opt.backPanelMaterial === "alacena" && (
                    <FieldGroup label="Entrepaños traseros">
                      <NumInput value={opt.backShelves ?? 0} onChange={(v) => updateOpt("backShelves", v)} min={0} max={10} />
                    </FieldGroup>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-warmgray/70">
                  {type === "desayunador"
                    ? "El respaldo queda expuesto hacia el lado del banquillo (no contra un muro), por eso lleva un acabado en vez de tablero liso. La cubierta vuela este tanto extra sobre ese lado."
                    : type === "librero_giratorio_espejo"
                    ? "El respaldo lleva un espejo en vez de tablero — visible por el lado opuesto a los estantes."
                    : "Este mueble está en modo isla (lejos de cualquier muro): el respaldo queda expuesto hacia el cuarto. Puedes dejarlo con un acabado plano, ponerle sus propias puertas, o abrirlo tipo alacena."}
                </p>
              </Section>
            )}

            {isLightCrown && (
              <Section label="Iluminación">
                <div className="space-y-3">
                  <FieldGroup label="Tipo de luz">
                    <SelectInput
                      value={opt.lightMode ?? "tira"}
                      onChange={(v) => updateOpt("lightMode", v)}
                      options={[
                        { value: "tira", label: "Tira de LED" },
                        { value: "foquitos", label: "Foquitos individuales" },
                      ]}
                    />
                  </FieldGroup>
                  {(opt.lightMode ?? "tira") === "tira" ? (
                    <FieldGroup label="Ancho de la tira">
                      <NumInput value={opt.lightStripWidth ?? 3} onChange={(v) => updateOpt("lightStripWidth", v)} min={1} max={10} unit="cm" />
                    </FieldGroup>
                  ) : (
                    <FieldGroup label="Cantidad de foquitos">
                      <NumInput value={opt.bulbCount ?? 6} onChange={(v) => updateOpt("bulbCount", v)} min={1} max={20} />
                    </FieldGroup>
                  )}
                  <FieldGroup label="Color de luz">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={opt.lightColor || "#fff2d0"}
                        onChange={(e) => updateOpt("lightColor", e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-xl border border-ivory/10 bg-transparent p-1"
                      />
                      <Input
                        value={opt.lightColor || ""}
                        onChange={(e) => updateOpt("lightColor", e.target.value)}
                        placeholder="#fff2d0"
                        className="font-mono text-sm"
                      />
                    </div>
                  </FieldGroup>
                  {(opt.lightMode ?? "tira") === "foquitos" && (
                    <p className="text-[10px] text-warmgray/70">Los foquitos se reparten en partes iguales a lo ancho del mueble.</p>
                  )}
                </div>
              </Section>
            )}
          </>
        )}


        {/* ── Doors & Drawers (smart per type) ─────────────────────────── */}
        {(isLower || isUpper || isTower) && !isLightCrown && (
          <Section label={isCajonera ? "Cajones" : "Puertas y cajones"}>
            <div className="grid grid-cols-2 gap-3">
              {!isCajonera && !isFixedDrawerHueco && (
                <FieldGroup label="Núm. puertas">
                  <div className="space-y-1.5">
                    <QuickCountButtons value={opt.doors} options={[1, 2]} onChange={(v) => updateOpt("doors", v)} />
                    <NumInput value={opt.doors} onChange={(v) => updateOpt("doors", v)} min={0} max={6} />
                  </div>
                </FieldGroup>
              )}
              {!isFixedDrawerHueco && (
                <FieldGroup label="Núm. cajones">
                  <NumInput value={opt.drawers} onChange={(v) => updateOpt("drawers", v)} min={0} max={8} />
                </FieldGroup>
              )}
              {!isCajonera && opt.doors > 0 && opt.drawers > 0 && (
                <FieldGroup label="Altura de cajones">
                  <NumInput
                    value={opt.drawerZoneHeight ?? defaultDrawerZoneHeight(module)}
                    onChange={(v) => updateOpt("drawerZoneHeight", v)}
                    min={5}
                    max={Math.max(dim.height - 40, 5)}
                    unit="cm"
                  />
                </FieldGroup>
              )}
              {!isCajonera && !isFixedDrawerHueco && (
                <FieldGroup label="Repisas">
                  <NumInput value={opt.shelves} onChange={(v) => updateOpt("shelves", v)} min={0} max={10} />
                </FieldGroup>
              )}
              <FieldGroup label="Herrajes">
                <SelectInput
                  value={opt.hardwareFinish}
                  onChange={(v) => applyHardwareToAll(v)}
                  options={[
                    { value: "Acero inoxidable", label: "Acero inoxidable" },
                    { value: "Negro mate", label: "Negro mate" },
                    { value: "Dorado", label: "Dorado" },
                    { value: "Bronce", label: "Bronce" },
                    { value: "Cromo", label: "Cromo" },
                    { value: "Sin jaladores", label: "Sin jaladores" },
                  ]}
                />
              </FieldGroup>
            </div>
            <p className="mt-2 text-[10px] text-warmgray/70">
              {opt.doors > 0 && opt.drawers > 0
                ? "Los cajones se reparten en partes iguales dentro de la altura fijada arriba, justo encima de la(s) puerta(s). Los herrajes se aplican a toda la cocina."
                : "Los cajones se distribuyen automáticamente en el área disponible. Los herrajes se aplican a toda la cocina."}
            </p>
          </Section>
        )}

        {/* ── Door hinge sides (independent per door) — lower/corner cabinets
             get izquierda/derecha; upper cabinets also get arriba (abatible). ── */}
        {(category === "lower" || category === "corner" || category === "upper") && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Apertura de puertas">
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: opt.doors }, (_, i) => {
                const defaultSide = i % 2 === 0 ? "izquierda" : "derecha";
                const current = opt.doorHingeSides?.[i] ?? defaultSide;
                const currentType = opt.doorHingeType?.[i] ?? "normal";
                const currentGlass = opt.doorGlass?.[i] ? "cristal" : "normal";
                return (
                  <Fragment key={i}>
                    <FieldGroup label={`Puerta ${i + 1}`}>
                      <SelectInput
                        value={current}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorHingeSides?.[j] ?? (j % 2 === 0 ? "izquierda" : "derecha"));
                          next[i] = v;
                          updateOpt("doorHingeSides", next);
                        }}
                        options={isUpper ? DOOR_HINGE_OPTIONS_UPPER : DOOR_HINGE_OPTIONS}
                      />
                    </FieldGroup>
                    <FieldGroup label={`Puerta ${i + 1}: bisagra`}>
                      <SelectInput
                        value={currentType}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorHingeType?.[j] ?? "normal");
                          next[i] = v;
                          updateOpt("doorHingeType", next);
                        }}
                        options={DOOR_HINGE_TYPE_OPTIONS}
                      />
                    </FieldGroup>
                    <FieldGroup label={`Puerta ${i + 1}: frente`}>
                      <SelectInput
                        value={currentGlass}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorGlass?.[j] ?? false);
                          next[i] = v === "cristal";
                          updateOpt("doorGlass", next);
                        }}
                        options={[
                          { value: "normal", label: "Tablero sólido" },
                          { value: "cristal", label: "Cristal (marco + panel de vidrio)" },
                        ]}
                      />
                    </FieldGroup>
                  </Fragment>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-warmgray/70">La bisagra queda en el lado contrario a la apertura elegida (o arriba, con la jaladera abajo, para la opción abatible). Chapulina abre más (170°) sin importar el lado.</p>
          </Section>
        )}

        {/* ── Per-door: opening type (hinged/pull-out) and interior accessory —
             independent settings, not tied to each other. A pull-out door
             takes any assigned accessory (or the module's fixed shelves)
             along with it; a hinged door with an accessory slides just the
             accessory out on its own rails when opened. ─────────────────── */}
        {(isLower || isUpper || isTower) && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Puertas: apertura y accesorio interior">
            <div className="space-y-3">
              {Array.from({ length: opt.doors }, (_, i) => {
                const currentAccessory = opt.doorAccessories?.[i] ?? "";
                const currentPullOut = opt.doorPullOut?.[i] ?? false;
                return (
                  <div key={i} className="grid grid-cols-2 gap-3 rounded-xl border border-ivory/8 bg-ivory/3 p-3">
                    <FieldGroup label={`Puerta ${i + 1}: apertura`}>
                      <SelectInput
                        value={currentPullOut ? "jalable" : "abatible"}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorPullOut?.[j] ?? false);
                          next[i] = v === "jalable";
                          updateOpt("doorPullOut", next);
                        }}
                        options={[
                          { value: "abatible", label: "Abatible (bisagra)" },
                          { value: "jalable", label: "Jalable (sobre rieles)" },
                        ]}
                      />
                    </FieldGroup>
                    <FieldGroup label="Accesorio interior">
                      <SelectInput
                        value={currentAccessory}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorAccessories?.[j] ?? null);
                          next[i] = v || null;
                          updateOpt("doorAccessories", next);
                        }}
                        options={DOOR_ACCESSORY_OPTIONS}
                      />
                    </FieldGroup>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-warmgray/70">
              Con puerta abatible, el accesorio se extrae sobre sus propios rieles al abrir la puerta. Con puerta jalable, es la puerta la que se desliza y lleva el accesorio (o las repisas fijas, si no tiene accesorio) consigo.
            </p>
          </Section>
        )}

        {/* ── Lower cabinet extras ──────────────────────────────────────── */}
        {isLower && (
          <Section label="Base">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Zoclo">
                <SelectInput
                  value={opt.hasToeKick ? "si" : "no"}
                  onChange={(v) => updateOpt("hasToeKick", v === "si")}
                  options={[{ value: "si", label: "Con zoclo" }, { value: "no", label: "Sin zoclo" }]}
                />
              </FieldGroup>
              {opt.hasToeKick && (
                <FieldGroup label="Alto zoclo">
                  <NumInput value={opt.toeKickHeight} onChange={(v) => updateOpt("toeKickHeight", v)} min={4} max={20} unit="cm" />
                </FieldGroup>
              )}
              {opt.hasToeKick && (
                <FieldGroup label="Material del zoclo">
                  <SelectInput value={opt.zocaloMaterial ?? "Exterior"} onChange={(v) => applyZocaloMaterialToAll(v)} options={ZOCALO_MATERIAL_OPTIONS} />
                </FieldGroup>
              )}
            </div>
            {opt.hasToeKick && (
              <p className="mt-2 text-[10px] text-warmgray/70">
                El material del zoclo se aplica a toda la cocina.
                {opt.zocaloMaterial === "Aluminio" && " Se compra en tiras de 3m — la cotización redondea al número de piezas necesarias."}
              </p>
            )}
          </Section>
        )}

        {/* ── Upper cabinet extras ──────────────────────────────────────── */}
        {/* Campana extractora/compacta are category "accessory", not
            "upper", but they're wall-mounted the same way (mountHeight
            already drives their own mesh's vertical offset — see
            KitchenAssemblyScene.tsx) and just never got a field to edit it
            from. */}
        {(isUpper || type === "campana_extractora" || type === "campana_extractora_compacta") && (
          <Section label="Instalación">
            <FieldGroup label="Altura de montaje">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={100} max={220} unit="cm" />
            </FieldGroup>
          </Section>
        )}

        {/* ── Ventana: sill height — a door sits on the floor, but a window
             needs its own mount height like an aéreo. ────────────────────── */}
        {type === "ventana_decorativa" && (
          <Section label="Instalación">
            <FieldGroup label="Altura del alféizar">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={0} max={220} unit="cm" />
            </FieldGroup>
          </Section>
        )}

        {/* ── Appliance ─────────────────────────────────────────────────── */}
        {isAppliance && (
          <Section label="Espacio para electrodoméstico">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Ancho hueco">
                <NumInput value={opt.applianceWidth} onChange={(v) => updateOpt("applianceWidth", v)} min={30} max={200} unit="cm" />
              </FieldGroup>
              <FieldGroup label="Alto hueco">
                <NumInput value={opt.applianceHeight} onChange={(v) => updateOpt("applianceHeight", v)} min={30} max={250} unit="cm" />
              </FieldGroup>
            </div>
            {NICHE_ACCESSORY_MATCH[type] && (
              <button
                type="button"
                onClick={() => placeAccessoryInNiche(module.id, NICHE_ACCESSORY_MATCH[type]!)}
                className="mt-3 w-full rounded-xl border border-brass/30 bg-brass/10 px-3 py-2.5 text-sm font-medium text-brass-soft transition-colors hover:bg-brass/15"
              >
                Colocar {getCatalogEntry(NICHE_ACCESSORY_MATCH[type]!)?.label.toLowerCase()} aquí
              </button>
            )}
          </Section>
        )}

        {/* ── Countertop appearance ─────────────────────────────────────── */}
        {showCountertopSection && (
          <Section label="Cubierta">
            <div className="space-y-3">
              {canToggleCountertop && (
                <FieldGroup label="¿Incluye cubierta?">
                  <SelectInput
                    value={opt.includesCountertop ? "si" : "no"}
                    onChange={(v) => updateOpt("includesCountertop", v === "si")}
                    options={[
                      { value: "si", label: "Con cubierta" },
                      { value: "no", label: "Sin cubierta" },
                    ]}
                  />
                </FieldGroup>
              )}
              {showCountertopAppearance && (
              <>
              <FieldGroup label="Modelo">
                <CountertopModelPicker
                  value={opt.countertopModel}
                  onChange={(id) => {
                    const model = COUNTERTOP_MODELS.find((m) => m.id === id);
                    if (!model) return;
                    applyCountertopToAll(model.id, model.color, opt.countertopTexture ?? "ninguna");
                  }}
                />
                <p className="mt-1 text-[10px] text-warmgray/70">Se aplica a toda la cocina. Catálogo inicial — más adelante se administrará desde un panel dedicado.</p>
              </FieldGroup>
              <FieldGroup label="Color (ajuste fino)">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={opt.countertopColor || "#8e8070"}
                    onChange={(e) => applyCountertopToAll(opt.countertopModel ?? "", e.target.value, opt.countertopTexture ?? "ninguna")}
                    className="h-10 w-14 cursor-pointer rounded-xl border border-ivory/10 bg-transparent p-1"
                  />
                  <Input
                    value={opt.countertopColor || ""}
                    onChange={(e) => applyCountertopToAll(opt.countertopModel ?? "", e.target.value, opt.countertopTexture ?? "ninguna")}
                    placeholder="Automático según material"
                    className="font-mono text-sm"
                  />
                </div>
              </FieldGroup>
              <FieldGroup label="Textura">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyCountertopToAll(opt.countertopModel ?? "", opt.countertopColor ?? "", "ninguna")}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] transition-colors ${
                      !opt.countertopTexture || opt.countertopTexture === "ninguna"
                        ? "border-brass bg-brass/10 text-ivory"
                        : "border-ivory/10 bg-ivory/3 text-warmgray hover:border-ivory/25"
                    }`}
                  >
                    Ninguna (color liso)
                  </button>
                  {WOOD_TEXTURES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyCountertopToAll(opt.countertopModel ?? "", opt.countertopColor ?? "", t.id)}
                      title={t.label}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                        opt.countertopTexture === t.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: t.swatch }} />
                      <span className="text-[10px] text-warmgray">{t.label}</span>
                    </button>
                  ))}
                </div>
              </FieldGroup>
              </>
              )}
            </div>
          </Section>
        )}

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <FieldGroup label="Observaciones">
          <Textarea value={opt.notes} onChange={(e) => updateOpt("notes", e.target.value)} rows={2} placeholder="Detalles especiales, acabados o instrucciones..." />
        </FieldGroup>
      </div>

      {/* ── Delete ────────────────────────────────────────────────────────
          Deliberately its own row, separated from the header — was next to
          the "×" close button and got mis-clicked as a delete. */}
      <div className="shrink-0 border-t border-ivory/8 px-4 py-3">
        {opt.locked ? (
          <p className="text-center text-[11px] text-warmgray/50">Desbloquea el mueble para eliminarlo.</p>
        ) : isConfirmingDelete ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteClick}
              className="flex-1 rounded-lg bg-terracotta/90 px-3 py-2 text-xs font-semibold text-ivory transition-colors hover:bg-terracotta"
            >
              Confirmar eliminación
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-lg border border-ivory/15 px-3 py-2 text-xs text-warmgray transition-colors hover:text-ivory"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-warmgray transition-colors hover:bg-terracotta/15 hover:text-terracotta"
          >
            <Trash2 size={14} />
            Eliminar mueble
          </button>
        )}
      </div>
    </div>
  );
}
