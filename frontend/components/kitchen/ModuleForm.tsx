"use client";

import { Input } from "@/components/ui/input";
import type { KitchenModule } from "@/types/kitchen";
import { BOARD_COSTS, COUNTERTOP_COSTS } from "@/services/kitchenData";

type ModOptions = KitchenModule["options"];

interface Props {
  module: KitchenModule;
  onChange: (patch: Partial<KitchenModule>) => void;
}

// ─── Reusable field helpers ────────────────────────────────────────────────────
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min = 0, max = 9999, step = 1, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div className="relative">
      <Input type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2 hover:border-white/15 transition-colors">
      <div
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-indigo-500" : "bg-white/20"}`}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-sm text-zinc-300">{label}</span>
    </label>
  );
}

// ─── Module Form ──────────────────────────────────────────────────────────────
export function ModuleForm({ module, onChange }: Props) {
  const opt = module.options;
  const dim = module.dimensions;

  const updateDim = (key: keyof typeof dim, val: number) =>
    onChange({ dimensions: { ...dim, [key]: val } });

  const updateOpt = (key: keyof ModOptions, val: unknown) =>
    onChange({ options: { ...opt, [key]: val } as ModOptions });

  const { category, type } = module;

  const isLower    = category === "lower";
  const isUpper    = category === "upper";
  const isTower    = category === "tower";
  const isCounter  = category === "countertop";
  const isAppliance = category === "appliance";
  const isAccessory = category === "accessory";

  return (
    <div className="space-y-5">
      {/* ── Label ─────────────────────────────────────────────────── */}
      <FieldGroup label="Nombre del módulo">
        <Input value={module.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Ej. Cajonera esquina izquierda" />
      </FieldGroup>

      {/* ── Dimensions ────────────────────────────────────────────── */}
      {!isAccessory && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Dimensiones</p>
          <div className="grid grid-cols-3 gap-3">
            {!(isCounter && type === "cubierta") && (
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
        </div>
      )}

      {/* ── Material principal ─────────────────────────────────────── */}
      {!isCounter && !isAppliance && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Tablero interior</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Tablero interior">
              <SelectInput
                value={opt.boardMaterial}
                onChange={(v) => updateOpt("boardMaterial", v)}
                options={(Object.keys(BOARD_COSTS) as (keyof typeof BOARD_COSTS)[]).map((k) => ({ value: k, label: k }))}
              />
            </FieldGroup>
            <FieldGroup label="Color">
              <div className="flex gap-2">
                <input type="color" value={opt.color} onChange={(e) => updateOpt("color", e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1" />
                <Input value={opt.color} onChange={(e) => updateOpt("color", e.target.value)} className="font-mono text-sm" />
              </div>
            </FieldGroup>
            <FieldGroup label="Acabado">
              <SelectInput
                value={opt.finish}
                onChange={(v) => updateOpt("finish", v)}
                options={[
                  { value: "Natural", label: "Natural" },
                  { value: "Lacado brillante", label: "Lacado brillante" },
                  { value: "Lacado mate", label: "Lacado mate" },
                  { value: "Textured", label: "Texturizado" },
                ]}
              />
            </FieldGroup>
            <FieldGroup label="Canto">
              <SelectInput
                value={opt.edgeProfile}
                onChange={(v) => updateOpt("edgeProfile", v)}
                options={[
                  { value: "PVC 0.4mm", label: "PVC 0.4mm" },
                  { value: "PVC 2mm", label: "PVC 2mm" },
                  { value: "ABS 1mm", label: "ABS 1mm" },
                  { value: "Madera sólida", label: "Madera sólida" },
                ]}
              />
            </FieldGroup>
          </div>

          <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Tablero exterior (puertas, cajones y remates visibles)</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Tablero exterior">
              <SelectInput
                value={opt.exteriorMaterial}
                onChange={(v) => updateOpt("exteriorMaterial", v)}
                options={(Object.keys(BOARD_COSTS) as (keyof typeof BOARD_COSTS)[]).map((k) => ({ value: k, label: k }))}
              />
            </FieldGroup>
            <FieldGroup label="Color exterior">
              <div className="flex gap-2">
                <input type="color" value={opt.exteriorColor} onChange={(e) => updateOpt("exteriorColor", e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1" />
                <Input value={opt.exteriorColor} onChange={(e) => updateOpt("exteriorColor", e.target.value)} className="font-mono text-sm" />
              </div>
            </FieldGroup>
            <FieldGroup label="Acabado exterior">
              <SelectInput
                value={opt.exteriorFinish}
                onChange={(v) => updateOpt("exteriorFinish", v)}
                options={[
                  { value: "Natural", label: "Natural" },
                  { value: "Lacado brillante", label: "Lacado brillante" },
                  { value: "Lacado mate", label: "Lacado mate" },
                  { value: "Textured", label: "Texturizado" },
                ]}
              />
            </FieldGroup>
          </div>

          <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Paneles laterales</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Costado izquierdo">
              <SelectInput
                value={opt.leftSidePanel}
                onChange={(v) => updateOpt("leftSidePanel", v)}
                options={[
                  { value: "ninguno", label: "Ninguno (vecino de otro mueble)" },
                  { value: "interior", label: "Interior" },
                  { value: "exterior", label: "Exterior (mueble de punta)" },
                ]}
              />
            </FieldGroup>
            <FieldGroup label="Costado derecho">
              <SelectInput
                value={opt.rightSidePanel}
                onChange={(v) => updateOpt("rightSidePanel", v)}
                options={[
                  { value: "ninguno", label: "Ninguno (vecino de otro mueble)" },
                  { value: "interior", label: "Interior" },
                  { value: "exterior", label: "Exterior (mueble de punta)" },
                ]}
              />
            </FieldGroup>
          </div>
        </div>
      )}

      {/* ── Doors & Drawers ────────────────────────────────────────── */}
      {(isLower || isUpper || isTower) && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Puertas y Cajones</p>
          <p className="mb-3 text-[10px] text-zinc-600">El número y la posición de puertas y cajones se agregan desde la pestaña &quot;Distribución&quot;.</p>
          <div className="grid grid-cols-2 gap-3">
            {opt.shelves !== undefined && (
              <FieldGroup label="Núm. repisas">
                <NumInput value={opt.shelves} onChange={(v) => updateOpt("shelves", v)} min={0} max={10} />
              </FieldGroup>
            )}
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
            <FieldGroup label="Sistema de cajón">
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
        </div>
      )}

      {/* ── Lower Cabinet Extras ───────────────────────────────────── */}
      {isLower && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Configuración base</p>
          <div className="grid grid-cols-2 gap-3">
            <Toggle checked={opt.hasToeKick} onChange={(v) => updateOpt("hasToeKick", v)} label="Zoclo" />
            {opt.hasToeKick && (
              <FieldGroup label="Alto del zoclo">
                <NumInput value={opt.toeKickHeight} onChange={(v) => updateOpt("toeKickHeight", v)} min={4} max={20} unit="cm" />
              </FieldGroup>
            )}
            <Toggle checked={opt.includesCountertop} onChange={(v) => updateOpt("includesCountertop", v)} label="Incluir cubierta" />
          </div>
          {opt.includesCountertop && <CountertopFields opt={opt} updateOpt={updateOpt} />}
          {(type === "bajo_tarja" || type === "cubierta_tarja") && <SinkFields opt={opt} updateOpt={updateOpt} />}
          {(type === "esquinero_inferior") && <CornerFields opt={opt} updateOpt={updateOpt} />}
        </div>
      )}

      {/* ── Upper Cabinet Extras ───────────────────────────────────── */}
      {isUpper && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Instalación</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Altura de montaje">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={100} max={220} unit="cm" />
            </FieldGroup>
            <Toggle checked={opt.hasUnderLight} onChange={(v) => updateOpt("hasUnderLight", v)} label="Luz inferior LED" />
            {type === "esquinero_superior" && <CornerFields opt={opt} updateOpt={updateOpt} />}
          </div>
        </div>
      )}

      {/* ── Tower Extras ──────────────────────────────────────────── */}
      {isTower && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Nichos para electrodomésticos</p>
          <div className="grid grid-cols-2 gap-3">
            <Toggle checked={opt.ovenOpening} onChange={(v) => updateOpt("ovenOpening", v)} label="Nicho para horno" />
            {opt.ovenOpening && (
              <FieldGroup label="Alto nicho horno">
                <NumInput value={opt.ovenHeight} onChange={(v) => updateOpt("ovenHeight", v)} min={40} max={100} unit="cm" />
              </FieldGroup>
            )}
            <Toggle checked={opt.microwaveOpening} onChange={(v) => updateOpt("microwaveOpening", v)} label="Nicho para microondas" />
            {opt.microwaveOpening && (
              <FieldGroup label="Alto nicho microondas">
                <NumInput value={opt.microwaveHeight} onChange={(v) => updateOpt("microwaveHeight", v)} min={25} max={60} unit="cm" />
              </FieldGroup>
            )}
          </div>
        </div>
      )}

      {/* ── Countertop ────────────────────────────────────────────── */}
      {isCounter && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Cubierta / Encimera</p>
          <CountertopFields opt={opt} updateOpt={updateOpt} />
          {(type === "cubierta_tarja") && <SinkFields opt={opt} updateOpt={updateOpt} />}
          {(type === "isla_central" || type === "peninsula" || type === "barra_desayunadora") && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Toggle checked={opt.hasBacksplash} onChange={(v) => updateOpt("hasBacksplash", v)} label="Salpicadero / Respaldo" />
              {opt.hasBacksplash && (
                <FieldGroup label="Alto salpicadero">
                  <NumInput value={opt.backsplashHeight} onChange={(v) => updateOpt("backsplashHeight", v)} min={10} max={120} unit="cm" />
                </FieldGroup>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Appliance Space ────────────────────────────────────────── */}
      {isAppliance && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Espacio para electrodoméstico</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Ancho hueco">
              <NumInput value={opt.applianceWidth} onChange={(v) => updateOpt("applianceWidth", v)} min={30} max={200} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Alto hueco">
              <NumInput value={opt.applianceHeight} onChange={(v) => updateOpt("applianceHeight", v)} min={30} max={250} unit="cm" />
            </FieldGroup>
            <Toggle checked={opt.hasVentilation} onChange={(v) => updateOpt("hasVentilation", v)} label="Ventilación posterior" />
            <FieldGroup label="Tablero remate">
              <SelectInput
                value={opt.boardMaterial}
                onChange={(v) => updateOpt("boardMaterial", v)}
                options={(Object.keys(BOARD_COSTS) as (keyof typeof BOARD_COSTS)[]).map((k) => ({ value: k, label: k }))}
              />
            </FieldGroup>
          </div>
        </div>
      )}

      {/* ── Accessory specifics ────────────────────────────────────── */}
      {isAccessory && type === "tarja" && <SinkFields opt={opt} updateOpt={updateOpt} full />}
      {isAccessory && (type === "estufa" || type === "parrilla") && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Estufa / Parrilla</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Tipo">
              <SelectInput
                value={opt.stoveType}
                onChange={(v) => updateOpt("stoveType", v)}
                options={[
                  { value: "4 quemadores", label: "4 quemadores" },
                  { value: "5 quemadores", label: "5 quemadores" },
                  { value: "6 quemadores", label: "6 quemadores" },
                  { value: "Vitrocerámica", label: "Vitrocerámica" },
                  { value: "Inducción", label: "Inducción" },
                ]}
              />
            </FieldGroup>
            <FieldGroup label="Ancho">
              <NumInput value={module.dimensions.width} onChange={(v) => updateDim("width", v)} min={40} max={120} unit="cm" />
            </FieldGroup>
          </div>
        </div>
      )}
      {isAccessory && type === "campana_extractora" && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Campana</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Tipo de campana">
              <SelectInput
                value={opt.hoodType}
                onChange={(v) => updateOpt("hoodType", v)}
                options={[
                  { value: "Telescópica", label: "Telescópica" },
                  { value: "Decorativa", label: "Decorativa" },
                  { value: "De pared", label: "De pared" },
                  { value: "Integrada en mueble", label: "Integrada en mueble" },
                ]}
              />
            </FieldGroup>
            <FieldGroup label="Ancho">
              <NumInput value={opt.hoodWidth} onChange={(v) => updateOpt("hoodWidth", v)} min={40} max={120} unit="cm" />
            </FieldGroup>
          </div>
        </div>
      )}
      {isAccessory && (type === "herrajes" || type === "zoclo" || type === "panel_lateral" || type === "panel_remate" || type === "panel_decorativo") && (
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Material">
            <SelectInput
              value={opt.boardMaterial}
              onChange={(v) => updateOpt("boardMaterial", v)}
              options={(Object.keys(BOARD_COSTS) as (keyof typeof BOARD_COSTS)[]).map((k) => ({ value: k, label: k }))}
            />
          </FieldGroup>
          <FieldGroup label="Color">
            <div className="flex gap-2">
              <input type="color" value={opt.color} onChange={(e) => updateOpt("color", e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1" />
              <Input value={opt.color} onChange={(e) => updateOpt("color", e.target.value)} className="font-mono text-sm" />
            </div>
          </FieldGroup>
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────── */}
      <FieldGroup label="Observaciones">
        <textarea
          value={opt.notes}
          onChange={(e) => updateOpt("notes", e.target.value)}
          rows={2}
          placeholder="Detalles especiales, acabados o instrucciones..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"
        />
      </FieldGroup>
    </div>
  );
}

// ─── Sub-form fragments ────────────────────────────────────────────────────────
function CountertopFields({ opt, updateOpt }: { opt: ModOptions; updateOpt: (k: keyof ModOptions, v: unknown) => void }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <FieldGroup label="Material cubierta">
        <SelectInput
          value={opt.countertopMaterial}
          onChange={(v) => updateOpt("countertopMaterial", v)}
          options={(Object.keys(COUNTERTOP_COSTS) as (keyof typeof COUNTERTOP_COSTS)[]).map((k) => ({ value: k, label: k }))}
        />
      </FieldGroup>
      <FieldGroup label="Espesor">
        <NumInput value={opt.countertopThickness} onChange={(v) => updateOpt("countertopThickness", v)} min={2} max={8} unit="cm" />
      </FieldGroup>
      <FieldGroup label="Vuelo frontal">
        <NumInput value={opt.countertopOverhang} onChange={(v) => updateOpt("countertopOverhang", v)} min={0} max={30} unit="cm" />
      </FieldGroup>
    </div>
  );
}

function SinkFields({ opt, updateOpt, full }: { opt: ModOptions; updateOpt: (k: keyof ModOptions, v: unknown) => void; full?: boolean }) {
  return (
    <div className="mt-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Tarja</p>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Tipo de seno">
          <SelectInput
            value={opt.sinkStyle}
            onChange={(v) => updateOpt("sinkStyle", v)}
            options={[
              { value: "Un seno", label: "Un seno" },
              { value: "Dos senos", label: "Dos senos" },
              { value: "Seno con escurridor", label: "Con escurridor" },
              { value: "Empotrada", label: "Empotrada bajo encimera" },
              { value: "Sobre encimera", label: "Sobre encimera" },
            ]}
          />
        </FieldGroup>
        <FieldGroup label="Material tarja">
          <SelectInput
            value={opt.sinkMaterial}
            onChange={(v) => updateOpt("sinkMaterial", v)}
            options={[
              { value: "Acero inoxidable", label: "Acero inoxidable" },
              { value: "Porcelana", label: "Porcelana" },
              { value: "Granito negro", label: "Granito negro" },
              { value: "Compuesto", label: "Compuesto" },
            ]}
          />
        </FieldGroup>
        <FieldGroup label="Orificios para llave">
          <NumInput value={opt.sinkHoles} onChange={(v) => updateOpt("sinkHoles", v)} min={1} max={4} />
        </FieldGroup>
      </div>
    </div>
  );
}

function CornerFields({ opt, updateOpt }: { opt: ModOptions; updateOpt: (k: keyof ModOptions, v: unknown) => void }) {
  return (
    <div className="mt-3">
      <FieldGroup label="Solución de esquina">
        <SelectInput
          value={opt.cornerType}
          onChange={(v) => updateOpt("cornerType", v)}
          options={[
            { value: "magic_corner", label: "Magic Corner" },
            { value: "lazy_susan", label: "Lazy Susan" },
            { value: "diagonal", label: "Diagonal / chaflán" },
            { value: "dead_corner", label: "Esquina ciega" },
          ]}
        />
      </FieldGroup>
    </div>
  );
}
