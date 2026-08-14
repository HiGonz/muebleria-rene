"use client";

import { useEffect } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { ClosetAssemblyScene } from "@/components/3d/ClosetAssemblyScene";
import { ClosetModuleStackEditor } from "./ClosetModuleStackEditor";
import { isNicheSpace } from "@/types/closet";

const DEFAULT_MODULE_WIDTH_CM = 60;
const DEFAULT_MODULE_DEPTH_CM = 60;

export function ClosetBuilder() {
  const project = useClosetStore((s) => s.project);
  const selectedModuleId = useClosetStore((s) => s.selectedModuleId);
  const initNiche = useClosetStore((s) => s.initNiche);
  const addModule = useClosetStore((s) => s.addModule);
  const removeModule = useClosetStore((s) => s.removeModule);
  const selectModule = useClosetStore((s) => s.selectModule);

  // First-ever visit (nothing in localStorage yet) starts from a reasonable
  // default niche so the scene isn't empty on load.
  useEffect(() => {
    if (!project) initNiche(300, 240, 60);
  }, [project, initNiche]);

  if (!project) return null;
  const area = project.areas[0];
  const conjunto = area?.conjuntos[0];
  if (!area || !conjunto || !isNicheSpace(area.space)) return null;
  // Destructure right after the guard (same pattern ClosetAssemblyScene
  // uses) rather than reading area.space.height later past intervening
  // JSX/derived values — keeps the niche-narrowing trivially in scope.
  const { height: areaHeightCm } = area.space;

  const selectedModule = conjunto.modules.find((m) => m.id === selectedModuleId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold">{project.projectName}</h1>
        <button
          onClick={() => addModule(DEFAULT_MODULE_WIDTH_CM, DEFAULT_MODULE_DEPTH_CM)}
          className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass-soft"
        >
          + Agregar módulo
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ClosetAssemblyScene project={project} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ivory/8">
          <div className="border-b border-ivory/8 p-3">
            <p className="text-xs font-semibold text-ivory">Módulos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conjunto.modules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectModule(m.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${m.id === selectedModuleId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {selectedModule ? (
            <>
              <ClosetModuleStackEditor module={selectedModule} maxHeightCm={areaHeightCm} />
              <div className="mt-auto border-t border-ivory/8 p-3">
                <button
                  onClick={() => removeModule(selectedModule.id)}
                  className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                >
                  Eliminar módulo
                </button>
              </div>
            </>
          ) : (
            <p className="p-3 text-xs text-warmgray">Selecciona un módulo para editar sus bloques.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
