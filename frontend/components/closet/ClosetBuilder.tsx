"use client";

import { useEffect, useState } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { ClosetAssemblyScene } from "@/components/3d/ClosetAssemblyScene";
import { ClosetModuleStackEditor } from "./ClosetModuleStackEditor";
import { ClosetTopShelfEditor } from "./ClosetTopShelfEditor";
import { NumericField } from "./NumericField";
import { isNicheSpace } from "@/types/closet";

const DEFAULT_MODULE_WIDTH_CM = 60;
const DEFAULT_MODULE_DEPTH_CM = 60;

export function ClosetBuilder() {
  const hasHydrated = useClosetStore((s) => s._hasHydrated);
  const project = useClosetStore((s) => s.project);
  const selectedConjuntoId = useClosetStore((s) => s.selectedConjuntoId);
  const selectedModuleId = useClosetStore((s) => s.selectedModuleId);
  const initNiche = useClosetStore((s) => s.initNiche);
  const addModule = useClosetStore((s) => s.addModule);
  const removeModule = useClosetStore((s) => s.removeModule);
  const selectModule = useClosetStore((s) => s.selectModule);
  const addConjunto = useClosetStore((s) => s.addConjunto);
  const removeConjunto = useClosetStore((s) => s.removeConjunto);
  const selectConjunto = useClosetStore((s) => s.selectConjunto);
  const updateConjuntoX = useClosetStore((s) => s.updateConjuntoX);
  // Width is set once here at creation time (also editable later per-module
  // in ClosetModuleStackEditor) — a hangrod module often needs to be wider
  // than a drawer module next to it, so a single fixed default isn't enough.
  const [newModuleWidthCm, setNewModuleWidthCm] = useState(DEFAULT_MODULE_WIDTH_CM);

  // First-ever visit (nothing in localStorage yet) starts from a reasonable
  // default niche so the scene isn't empty on load. Gated on hasHydrated so
  // this can never fire before persist's rehydration has genuinely applied
  // (or genuinely confirmed there's nothing to restore) — otherwise a real
  // draft can be silently overwritten by a fresh empty niche on refresh.
  useEffect(() => {
    if (hasHydrated && !project) initNiche(300, 240, 60);
  }, [hasHydrated, project, initNiche]);

  // Not yet hydrated: render nothing rather than treating "haven't checked
  // storage yet" the same as "genuinely empty" (which would otherwise flash
  // briefly before the real draft applies).
  if (!hasHydrated) return null;
  if (!project) return null;
  const area = project.areas[0];
  if (!area || !isNicheSpace(area.space)) return null;
  const { height: areaHeightCm } = area.space;

  const selectedConjunto = area.conjuntos.find((c) => c.id === selectedConjuntoId) ?? area.conjuntos[0] ?? null;
  const selectedModule = selectedConjunto?.modules.find((m) => m.id === selectedModuleId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold">{project.projectName}</h1>
        <button
          onClick={() => addConjunto()}
          className="rounded-lg border border-ivory/15 px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-ivory/8"
        >
          + Agregar conjunto
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ClosetAssemblyScene project={project} onConjuntoMove={updateConjuntoX} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ivory/8">
          <div className="border-b border-ivory/8 p-3">
            <p className="text-xs font-semibold text-ivory">Conjuntos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {area.conjuntos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConjunto(c.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${c.id === selectedConjuntoId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {selectedConjunto ? (
            <>
              <div className="border-b border-ivory/8 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ivory">Módulos</p>
                  <button
                    onClick={() => removeConjunto(selectedConjunto.id)}
                    className="text-[10px] text-terracotta hover:underline"
                  >
                    Eliminar conjunto
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedConjunto.modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectModule(m.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${m.id === selectedModuleId ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-warmgray">
                    Ancho (cm)
                    <NumericField
                      value={newModuleWidthCm} min={20}
                      onCommit={setNewModuleWidthCm}
                      className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
                      ariaLabel="Ancho del nuevo módulo en centímetros"
                    />
                  </label>
                  <button
                    onClick={() => addModule(newModuleWidthCm, DEFAULT_MODULE_DEPTH_CM)}
                    className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass-soft"
                  >
                    + Agregar módulo
                  </button>
                </div>
              </div>

              {selectedModule && (
                <>
                  <ClosetModuleStackEditor module={selectedModule} maxHeightCm={areaHeightCm} />
                  <div className="border-b border-ivory/8 p-3">
                    <button
                      onClick={() => removeModule(selectedModule.id)}
                      className="w-full rounded-lg border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta hover:bg-terracotta/10"
                    >
                      Eliminar módulo
                    </button>
                  </div>
                </>
              )}

              <ClosetTopShelfEditor conjunto={selectedConjunto} />
            </>
          ) : (
            <p className="p-3 text-xs text-warmgray">Agrega un conjunto para empezar.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
