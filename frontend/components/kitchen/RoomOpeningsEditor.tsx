"use client";

import { Trash2 } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WallSide } from "@/types/kitchen";

const WALL_LABELS: Record<WallSide, string> = { north: "Norte", south: "Sur", east: "Este", west: "Oeste" };
const WALLS: WallSide[] = ["north", "south", "east", "west"];

function SelectInput<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#111118]">{o.label}</option>
      ))}
    </select>
  );
}

function NumField({ value, onChange, min = 0, max = 999 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <Input type="number" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))} className="h-9 text-xs" />
  );
}

// Windows & doors on the room's perimeter walls — rendered as gaps in the 3D
// view so it reads visually as "access here" / "light comes in here", instead
// of the room looking like a sealed box.
export function RoomOpeningsEditor() {
  const { draft, addOpening, removeOpening, updateOpening } = useKitchenStore();
  const wallLength = (wall: WallSide) => (wall === "north" || wall === "south" ? draft.roomWidth : draft.roomDepth);

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Ventanas y puertas</p>
      <p className="mb-3 text-xs text-zinc-500">Se muestran como huecos en los muros de la vista 3D — las ventanas además iluminan el interior.</p>
      <div className="mb-3 flex gap-2">
        <Button variant="secondary" className="h-9 flex-1 px-2 text-xs" onClick={() => addOpening("window", "north")}>
          + Ventana
        </Button>
        <Button variant="secondary" className="h-9 flex-1 px-2 text-xs" onClick={() => addOpening("door", "north")}>
          + Puerta
        </Button>
      </div>

      {draft.openings.length === 0 ? (
        <p className="text-xs italic text-zinc-600">Sin ventanas ni puertas agregadas.</p>
      ) : (
        <div className="space-y-2">
          {draft.openings.map((o) => (
            <div key={o.id} className="space-y-2 rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">{o.type === "window" ? "🪟 Ventana" : "🚪 Puerta"}</span>
                <button onClick={() => removeOpening(o.id)} className="text-zinc-500 transition-colors hover:text-rose-300" aria-label="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Muro</span>
                  <SelectInput value={o.wall} onChange={(wall) => updateOpening(o.id, { wall })}
                    options={WALLS.map((w) => ({ value: w, label: WALL_LABELS[w] }))} />
                </label>
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Posición (cm)</span>
                  <NumField value={o.offset} max={wallLength(o.wall)} onChange={(offset) => updateOpening(o.id, { offset })} />
                </label>
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Ancho (cm)</span>
                  <NumField value={o.width} min={40} max={wallLength(o.wall)} onChange={(width) => updateOpening(o.id, { width })} />
                </label>
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Alto (cm)</span>
                  <NumField value={o.height} min={40} max={280} onChange={(height) => updateOpening(o.id, { height })} />
                </label>
                {o.type === "window" && (
                  <label className="col-span-2 space-y-1 text-[11px] text-zinc-400">
                    <span>Altura de antepecho (cm)</span>
                    <NumField value={o.sillHeight} min={0} max={200} onChange={(sillHeight) => updateOpening(o.id, { sillHeight })} />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
