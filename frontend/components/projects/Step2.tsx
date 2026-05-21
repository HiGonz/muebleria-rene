import { Input, Textarea } from "@/components/ui/input";
import type { ProjectDraft } from "@/store/useProjectStore";

const clampByType = {
  Closet: { height: [180, 280], width: [120, 320], depth: [45, 80] },
  Escritorio: { height: [70, 85], width: [100, 240], depth: [50, 90] },
  "Mueble TV": { height: [45, 90], width: [120, 300], depth: [35, 65] },
} as const;

export function Step2({ draft, updateDraft }: { draft: ProjectDraft; updateDraft: (payload: Partial<ProjectDraft>) => void }) {
  const limits = clampByType[draft.type];
  const numberField = (key: keyof Pick<ProjectDraft, "height" | "width" | "depth" | "shelves" | "drawers" | "doors">, label: string, min: number, max: number) => (
    <label className="space-y-2 text-sm text-zinc-300">
      <span>{label}</span>
      <div className="relative">
        <Input type="number" min={min} max={max} value={draft[key]} onChange={(event) => updateDraft({ [key]: Number(event.target.value) } as Partial<ProjectDraft>)} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs uppercase tracking-[0.2em] text-zinc-500">cm</span>
      </div>
      <p className="text-xs text-zinc-500">Rango sugerido: {min} - {max}</p>
    </label>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {numberField("height", "Alto", limits.height[0], limits.height[1])}
      {numberField("width", "Ancho", limits.width[0], limits.width[1])}
      {numberField("depth", "Fondo", limits.depth[0], limits.depth[1])}
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Número de repisas</span>
        <Input type="number" min={0} max={8} value={draft.shelves} onChange={(e) => updateDraft({ shelves: Number(e.target.value) })} />
      </label>
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Número de cajones</span>
        <Input type="number" min={0} max={8} value={draft.drawers} onChange={(e) => updateDraft({ drawers: Number(e.target.value) })} />
      </label>
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Número de puertas</span>
        <Input type="number" min={0} max={6} value={draft.doors} onChange={(e) => updateDraft({ doors: Number(e.target.value) })} />
      </label>
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Material principal</span>
        <select className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white" value={draft.material} onChange={(e) => updateDraft({ material: e.target.value as ProjectDraft['material'] })}>
          {['MDF', 'Melamina blanca', 'Melamina nogal', 'Triplay'].map((item) => <option key={item} className="bg-[#111118]">{item}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Color</span>
        <div className="flex gap-3">
          <Input type="color" className="h-12 w-16 rounded-xl p-1" value={draft.color} onChange={(e) => updateDraft({ color: e.target.value })} />
          <Input value={draft.color} onChange={(e) => updateDraft({ color: e.target.value })} />
        </div>
      </label>
      <label className="space-y-2 text-sm text-zinc-300 md:col-span-2">
        <span>Observaciones</span>
        <Textarea value={draft.notes} onChange={(e) => updateDraft({ notes: e.target.value })} placeholder="Detalles de herrajes, acabados o instalación." />
      </label>
    </div>
  );
}
