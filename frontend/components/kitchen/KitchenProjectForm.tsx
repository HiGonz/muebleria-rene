"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, Textarea } from "@/components/ui/input";
import type { KitchenStyle } from "@/types/kitchen";

const STYLES: KitchenStyle[] = ["Lineal", "En L", "En U", "En G", "Isla central", "Dos paredes"];

const STYLE_ICONS: Record<KitchenStyle, string> = {
  Lineal: "━",
  "En L": "┐",
  "En U": "┤",
  "En G": "⌐",
  "Isla central": "▦",
  "Dos paredes": "║",
};

export function KitchenProjectForm() {
  const { draft, updateProject } = useKitchenStore();

  const needsWallB = ["En L", "En U", "En G", "Dos paredes", "Isla central"].includes(draft.kitchenStyle);
  const needsWallC = ["En U", "En G"].includes(draft.kitchenStyle);

  return (
    <div className="space-y-6">
      {/* Client / project info */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Información del proyecto</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1 text-sm text-zinc-300">
            <span>Nombre del proyecto</span>
            <Input value={draft.projectName} onChange={(e) => updateProject({ projectName: e.target.value })} placeholder="Ej. Cocina Robles" />
          </label>
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Cliente</span>
            <Input value={draft.clientName} onChange={(e) => updateProject({ clientName: e.target.value })} placeholder="Nombre completo" />
          </label>
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Teléfono</span>
            <Input value={draft.clientPhone} onChange={(e) => updateProject({ clientPhone: e.target.value })} placeholder="871 000 0000" />
          </label>
          <label className="col-span-2 space-y-1 text-sm text-zinc-300">
            <span>Observaciones generales</span>
            <Textarea value={draft.notes} onChange={(e) => updateProject({ notes: e.target.value })} placeholder="Notas generales del proyecto..." />
          </label>
        </div>
      </div>

      {/* Kitchen layout */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Distribución de cocina</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {STYLES.map((style) => (
            <button
              key={style}
              onClick={() => updateProject({ kitchenStyle: style })}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 transition-all ${
                draft.kitchenStyle === style
                  ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-300"
                  : "border-white/8 bg-white/4 text-zinc-400 hover:border-white/15 hover:text-zinc-300"
              }`}
            >
              <span className="text-xl font-mono">{STYLE_ICONS[style]}</span>
              <span className="text-[11px] font-medium leading-tight text-center">{style}</span>
            </button>
          ))}
        </div>

        {/* Wall dimensions */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Longitud Pared A</span>
            <div className="relative">
              <Input type="number" min={60} max={1500} value={draft.wallALength} onChange={(e) => updateProject({ wallALength: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
            </div>
          </label>
          {needsWallB && (
            <label className="space-y-1 text-sm text-zinc-300">
              <span>Longitud Pared B</span>
              <div className="relative">
                <Input type="number" min={0} max={1500} value={draft.wallBLength} onChange={(e) => updateProject({ wallBLength: Number(e.target.value) })} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
              </div>
            </label>
          )}
          {needsWallC && (
            <label className="space-y-1 text-sm text-zinc-300">
              <span>Longitud Pared C</span>
              <div className="relative">
                <Input type="number" min={0} max={1500} value={draft.wallCLength} onChange={(e) => updateProject({ wallCLength: Number(e.target.value) })} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
              </div>
            </label>
          )}
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Altura de techo</span>
            <div className="relative">
              <Input type="number" min={200} max={400} value={draft.ceilingHeight} onChange={(e) => updateProject({ ceilingHeight: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
