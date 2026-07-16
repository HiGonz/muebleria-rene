"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, Textarea } from "@/components/ui/input";
import { RoomOpeningsEditor } from "./RoomOpeningsEditor";

export function KitchenProjectForm() {
  const { draft, updateProject } = useKitchenStore();

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

      {/* Kitchen area */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Área de la cocina</p>
        <p className="mb-3 text-xs text-zinc-500">Define el área rectangular disponible; los módulos se colocan y arrastran libremente dentro de ella.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Ancho</span>
            <div className="relative">
              <Input type="number" min={100} max={1500} value={draft.roomWidth} onChange={(e) => updateProject({ roomWidth: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
            </div>
          </label>
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Largo</span>
            <div className="relative">
              <Input type="number" min={100} max={1500} value={draft.roomDepth} onChange={(e) => updateProject({ roomDepth: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
            </div>
          </label>
          <label className="space-y-1 text-sm text-zinc-300">
            <span>Altura de techo</span>
            <div className="relative">
              <Input type="number" min={200} max={400} value={draft.ceilingHeight} onChange={(e) => updateProject({ ceilingHeight: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">cm</span>
            </div>
          </label>
        </div>
      </div>

      <RoomOpeningsEditor />
    </div>
  );
}
