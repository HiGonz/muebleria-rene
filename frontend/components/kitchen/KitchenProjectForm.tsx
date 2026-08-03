"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, NumberInput, Textarea } from "@/components/ui/input";
import { RoomOpeningsEditor } from "./RoomOpeningsEditor";

export function KitchenProjectForm() {
  const { draft, updateProject } = useKitchenStore();

  return (
    <div className="space-y-6">
      {/* Client / project info */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-warmgray">Información del proyecto</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1 text-sm text-ivory/80">
            <span>Nombre del proyecto</span>
            <Input value={draft.projectName} onChange={(e) => updateProject({ projectName: e.target.value })} placeholder="Ej. Cocina Robles" />
          </label>
          <label className="space-y-1 text-sm text-ivory/80">
            <span>Cliente</span>
            <Input value={draft.clientName} onChange={(e) => updateProject({ clientName: e.target.value })} placeholder="Nombre completo" />
          </label>
          <label className="space-y-1 text-sm text-ivory/80">
            <span>Teléfono</span>
            <Input value={draft.clientPhone} onChange={(e) => updateProject({ clientPhone: e.target.value })} placeholder="871 000 0000" />
          </label>
          <label className="col-span-2 space-y-1 text-sm text-ivory/80">
            <span>Observaciones generales</span>
            <Textarea value={draft.notes} onChange={(e) => updateProject({ notes: e.target.value })} placeholder="Notas generales del proyecto..." />
          </label>
        </div>
      </div>

      {/* Kitchen area */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-warmgray">Área de la cocina</p>
        <p className="mb-3 text-xs text-warmgray">Define el área rectangular disponible; los módulos se colocan y arrastran libremente dentro de ella.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-ivory/80">
            <span>Ancho</span>
            <NumberInput min={100} max={1500} value={draft.roomWidth} onChange={(v) => updateProject({ roomWidth: v })} unit="cm" />
          </label>
          <label className="space-y-1 text-sm text-ivory/80">
            <span>Largo</span>
            <NumberInput min={100} max={1500} value={draft.roomDepth} onChange={(v) => updateProject({ roomDepth: v })} unit="cm" />
          </label>
          <label className="space-y-1 text-sm text-ivory/80">
            <span>Altura de techo</span>
            <NumberInput min={200} max={400} value={draft.ceilingHeight} onChange={(v) => updateProject({ ceilingHeight: v })} unit="cm" />
          </label>
        </div>
      </div>

      <RoomOpeningsEditor />
    </div>
  );
}
