"use client";

import dynamic from "next/dynamic";
import { Trash2, Copy, RotateCw } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, Textarea } from "@/components/ui/input";
import { BOARD_COSTS, COUNTERTOP_COSTS } from "@/services/kitchenData";
import { WOOD_TEXTURES } from "@/components/3d/woodTextures";
import type { BoardMaterial, CountertopMaterial, ExteriorTextureId, KitchenModule } from "@/types/kitchen";

const ModulePreview3D = dynamic(
  () => import("@/components/3d/ModulePreview3D").then((m) => ({ default: m.ModulePreview3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-55 w-full items-center justify-center rounded-xl border border-white/8 bg-[#080810]">
        <span className="text-xs text-zinc-600">Cargando vista 3D…</span>
      </div>
    ),
  }
);

type ModOptions = KitchenModule["options"];

// ─── Field helpers (kept local to this component — the legacy ModuleForm used
// by the Constructor tab is being migrated away from, not shared with) ────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min = 0, max = 9999, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string;
}) {
  return (
    <div className="relative">
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">{unit}</span>}
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
      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#111118]">{o.label}</option>
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
            value === t.id ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/3 hover:border-white/25"
          }`}
        >
          <span className="h-8 w-12 rounded-md border border-black/20" style={{ backgroundColor: t.swatch }} />
          <span className="text-[10px] text-zinc-400">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

const BOARD_OPTIONS = (Object.keys(BOARD_COSTS) as BoardMaterial[]).map((k) => ({ value: k, label: k }));
const COUNTERTOP_OPTIONS = (Object.keys(COUNTERTOP_COSTS) as CountertopMaterial[]).map((k) => ({ value: k, label: k }));

// ─── Main component ────────────────────────────────────────────────────────────
// The simplified, per-type-aware replacement for the Constructor's Distribución
// + Opciones tabs — opened from the gear icon on a selected module in Vista 3D,
// without leaving that tab. Field set is fully tailored for "cajonera" so far;
// other lower/upper/tower types get a reasonable generic fallback until they're
// migrated too.
export function ModuleInspector() {
  const { getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule } = useKitchenStore();
  const module = getEditingModule();

  if (!module) return null;

  const opt = module.options;
  const dim = module.dimensions;
  const { category, type } = module;

  const updateDim = (key: keyof typeof dim, val: number) => updateModule(module.id, { dimensions: { ...dim, [key]: val } });
  const updateOpt = (key: keyof ModOptions, val: unknown) => updateModule(module.id, { options: { ...opt, [key]: val } as ModOptions });

  const isLower = category === "lower";
  const isUpper = category === "upper";
  const isTower = category === "tower";
  const isCountertop = category === "countertop";
  const isAppliance = category === "appliance";
  const isCajonera = type === "cajonera";
  const showHeightField = !(isCountertop && type === "cubierta");
  const showCountertopAppearance = isCountertop || opt.includesCountertop;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
        <p className="truncate text-sm font-semibold text-white">{module.label}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => rotateModule(module.id)} title="Rotar 90°" className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/8 hover:text-white transition-colors">
            <RotateCw size={15} />
          </button>
          <button onClick={() => duplicateModule(module.id)} title="Duplicar" className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/8 hover:text-white transition-colors">
            <Copy size={15} />
          </button>
          <button
            onClick={() => { removeModule(module.id); }}
            title="Eliminar"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <button onClick={() => setEditingModule(null)} className="ml-1 text-xl leading-none text-zinc-500 hover:text-white transition-colors">&times;</button>
        </div>
      </div>

      {/* ── 3D Preview ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4">
        <ModulePreview3D module={module} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
          </div>
        </Section>

        {/* ── Boards ────────────────────────────────────────────────────── */}
        {!isCountertop && !isAppliance && (
          <>
            <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Tablero interior</p>
              <p className="mt-0.5 text-xs text-zinc-300">Melamina blanca 15mm · Blanco</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">Estándar del taller — no configurable por mueble.</p>
            </div>

            <Section label="Tablero exterior (puertas, cajones y remates visibles)">
              <div className="space-y-3">
                <FieldGroup label="Material">
                  <SelectInput value={opt.exteriorMaterial} onChange={(v) => updateOpt("exteriorMaterial", v)} options={BOARD_OPTIONS} />
                </FieldGroup>
                <FieldGroup label="Acabado / textura">
                  <TexturePicker value={opt.exteriorTexture} onChange={(v) => updateOpt("exteriorTexture", v)} />
                </FieldGroup>
              </div>
            </Section>

            <Section label="Paneles laterales">
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Costado izquierdo">
                  <SelectInput
                    value={opt.leftSidePanel}
                    onChange={(v) => updateOpt("leftSidePanel", v)}
                    options={[
                      { value: "ninguno", label: "Ninguno (vecino)" },
                      { value: "interior", label: "Interior" },
                      { value: "exterior", label: "Exterior (de punta)" },
                    ]}
                  />
                </FieldGroup>
                <FieldGroup label="Costado derecho">
                  <SelectInput
                    value={opt.rightSidePanel}
                    onChange={(v) => updateOpt("rightSidePanel", v)}
                    options={[
                      { value: "ninguno", label: "Ninguno (vecino)" },
                      { value: "interior", label: "Interior" },
                      { value: "exterior", label: "Exterior (de punta)" },
                    ]}
                  />
                </FieldGroup>
              </div>
            </Section>
          </>
        )}

        {/* ── Doors & Drawers (smart per type) ─────────────────────────── */}
        {(isLower || isUpper || isTower) && (
          <Section label={isCajonera ? "Cajones" : "Puertas y cajones"}>
            <div className="grid grid-cols-2 gap-3">
              {!isCajonera && (
                <FieldGroup label="Núm. puertas">
                  <NumInput value={opt.doors} onChange={(v) => updateOpt("doors", v)} min={0} max={6} />
                </FieldGroup>
              )}
              <FieldGroup label="Núm. cajones">
                <NumInput value={opt.drawers} onChange={(v) => updateOpt("drawers", v)} min={0} max={8} />
              </FieldGroup>
              {!isCajonera && (
                <FieldGroup label="Repisas">
                  <NumInput value={opt.shelves} onChange={(v) => updateOpt("shelves", v)} min={0} max={10} />
                </FieldGroup>
              )}
              {!isCajonera && (
                <FieldGroup label="Estilo de puerta">
                  <SelectInput
                    value={opt.doorStyle}
                    onChange={(v) => updateOpt("doorStyle", v)}
                    options={[
                      { value: "Lisa", label: "Lisa" },
                      { value: "Marco y panel", label: "Marco y panel" },
                      { value: "Vidrio esmerilado", label: "Vidrio esmerilado" },
                      { value: "Vidrio transparente", label: "Vidrio transparente" },
                      { value: "Sin puerta", label: "Sin puerta (abierto)" },
                    ]}
                  />
                </FieldGroup>
              )}
              <FieldGroup label="Estilo de cajón">
                <SelectInput
                  value={opt.drawerSystem}
                  onChange={(v) => updateOpt("drawerSystem", v)}
                  options={[
                    { value: "Simple", label: "Simple" },
                    { value: "Extracción total", label: "Extracción total" },
                    { value: "Soft-close", label: "Soft-close" },
                    { value: "Con frente decorativo", label: "Con frente decorativo" },
                  ]}
                />
              </FieldGroup>
              <FieldGroup label="Herrajes">
                <SelectInput
                  value={opt.hardwareFinish}
                  onChange={(v) => updateOpt("hardwareFinish", v)}
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
            <p className="mt-2 text-[10px] text-zinc-600">Los cajones se distribuyen automáticamente en el área disponible.</p>
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
            </div>
          </Section>
        )}

        {/* ── Upper cabinet extras ──────────────────────────────────────── */}
        {isUpper && (
          <Section label="Instalación">
            <FieldGroup label="Altura de montaje">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={100} max={220} unit="cm" />
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
          </Section>
        )}

        {/* ── Countertop appearance ─────────────────────────────────────── */}
        {showCountertopAppearance && (
          <Section label="Cubierta">
            <div className="space-y-3">
              <FieldGroup label="Material">
                <SelectInput value={opt.countertopMaterial} onChange={(v) => updateOpt("countertopMaterial", v)} options={COUNTERTOP_OPTIONS} />
              </FieldGroup>
              <FieldGroup label="Color">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={opt.countertopColor || "#8e8070"}
                    onChange={(e) => updateOpt("countertopColor", e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1"
                  />
                  <Input
                    value={opt.countertopColor || ""}
                    onChange={(e) => updateOpt("countertopColor", e.target.value)}
                    placeholder="Automático según material"
                    className="font-mono text-sm"
                  />
                </div>
              </FieldGroup>
              <FieldGroup label="Textura">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateOpt("countertopTexture", "ninguna")}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] transition-colors ${
                      !opt.countertopTexture || opt.countertopTexture === "ninguna"
                        ? "border-indigo-500 bg-indigo-500/10 text-white"
                        : "border-white/10 bg-white/3 text-zinc-400 hover:border-white/25"
                    }`}
                  >
                    Ninguna (color liso)
                  </button>
                  {WOOD_TEXTURES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => updateOpt("countertopTexture", t.id)}
                      title={t.label}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                        opt.countertopTexture === t.id ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/3 hover:border-white/25"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: t.swatch }} />
                      <span className="text-[10px] text-zinc-400">{t.label}</span>
                    </button>
                  ))}
                </div>
              </FieldGroup>
            </div>
          </Section>
        )}

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <FieldGroup label="Observaciones">
          <Textarea value={opt.notes} onChange={(e) => updateOpt("notes", e.target.value)} rows={2} placeholder="Detalles especiales, acabados o instrucciones..." />
        </FieldGroup>
      </div>
    </div>
  );
}
