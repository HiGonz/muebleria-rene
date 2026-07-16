"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { ModuleCard } from "./ModuleCard";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/services/kitchenData";
import type { ModuleCategory } from "@/types/kitchen";

const CATEGORY_ORDER: ModuleCategory[] = ["lower", "upper", "tower", "countertop", "appliance", "accessory"];

export function ModuleList() {
  const { draft, openSelector } = useKitchenStore();
  const { modules } = draft;

  return (
    <div className="flex h-full flex-col">
      {/* Module list, grouped by category for scannability */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {modules.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="text-4xl opacity-40">🗄️</div>
            <p className="text-sm text-zinc-500">No hay módulos todavía.<br />Agrega el primero.</p>
          </div>
        )}
        {CATEGORY_ORDER.map((category) => {
          const categoryModules = modules.filter((m) => m.category === category);
          if (categoryModules.length === 0) return null;
          return (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{CATEGORY_LABELS[category]}</p>
              <div className="space-y-2">
                {categoryModules.map((mod) => (
                  <ModuleCard key={mod.id} module={mod} isEditing={draft.editingModuleId === mod.id} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add button — desktop only; mobile uses the floating action button instead */}
      <div className="hidden border-t border-white/8 p-4 lg:block">
        <Button variant="primary" className="w-full gap-2" onClick={() => openSelector()}>
          <span className="text-lg">+</span> Agregar módulo
        </Button>
      </div>
    </div>
  );
}
