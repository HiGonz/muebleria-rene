"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { ModuleCard } from "./ModuleCard";
import { Button } from "@/components/ui/button";

export function ModuleList() {
  const { draft, openSelector, getModulesByWall, setActiveWall } = useKitchenStore();
  const { activeWall, kitchenStyle } = draft;

  const walls = getWallsForStyle(kitchenStyle);
  const modules = getModulesByWall(activeWall);

  return (
    <div className="flex h-full flex-col">
      {/* Wall selector */}
      {walls.length > 1 && (
        <div className="flex gap-1 border-b border-white/8 px-4 py-2">
          {walls.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveWall(w.id)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                activeWall === w.id ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40" : "text-zinc-500 hover:text-white hover:bg-white/6"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {/* Module list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {modules.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="text-4xl opacity-40">🗄️</div>
            <p className="text-sm text-zinc-500">No hay módulos en esta pared.<br />Agrega el primero.</p>
          </div>
        )}
        {modules.map((mod) => (
          <ModuleCard
            key={mod.id}
            module={mod}
            isEditing={draft.editingModuleId === mod.id}
          />
        ))}
      </div>

      {/* Add button */}
      <div className="border-t border-white/8 p-4">
        <Button variant="primary" className="w-full gap-2" onClick={() => openSelector()}>
          <span className="text-lg">+</span> Agregar módulo
        </Button>
      </div>
    </div>
  );
}

function getWallsForStyle(style: string): { id: "A" | "B" | "C" | "isla"; label: string }[] {
  switch (style) {
    case "En L":
      return [{ id: "A", label: "Pared A" }, { id: "B", label: "Pared B" }];
    case "En U":
      return [{ id: "A", label: "Pared A" }, { id: "B", label: "Pared B" }, { id: "C", label: "Pared C" }];
    case "En G":
      return [{ id: "A", label: "Pared A" }, { id: "B", label: "Pared B" }, { id: "C", label: "Pared C" }];
    case "Isla central":
      return [{ id: "A", label: "Pared A" }, { id: "isla", label: "Isla" }];
    case "Dos paredes":
      return [{ id: "A", label: "Pared A" }, { id: "B", label: "Pared B" }];
    default:
      return [{ id: "A", label: "Pared A" }];
  }
}
