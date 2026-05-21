import { Input } from "@/components/ui/input";
import type { ProjectDraft } from "@/store/useProjectStore";

export function Step1({ draft, updateDraft }: { draft: ProjectDraft; updateDraft: (payload: Partial<ProjectDraft>) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Nombre cliente *</span>
        <Input value={draft.clientName} onChange={(e) => updateDraft({ clientName: e.target.value })} placeholder="Juan Pérez" />
      </label>
      <label className="space-y-2 text-sm text-zinc-300">
        <span>Teléfono *</span>
        <Input value={draft.clientPhone} onChange={(e) => updateDraft({ clientPhone: e.target.value })} placeholder="871 123 4567" />
      </label>
      <label className="space-y-2 text-sm text-zinc-300 md:col-span-2">
        <span>Nombre del proyecto *</span>
        <Input value={draft.projectName} onChange={(e) => updateDraft({ projectName: e.target.value })} placeholder="Closet principal" />
      </label>
      <label className="space-y-2 text-sm text-zinc-300 md:col-span-2">
        <span>Tipo de mueble *</span>
        <select className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white" value={draft.type} onChange={(e) => updateDraft({ type: e.target.value as ProjectDraft['type'] })}>
          <option className="bg-[#111118]">Closet</option>
          <option className="bg-[#111118]">Escritorio</option>
          <option className="bg-[#111118]">Mueble TV</option>
        </select>
      </label>
    </div>
  );
}
