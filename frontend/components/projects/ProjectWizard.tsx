"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import { Step3 } from "./Step3";
import { useProjectStore } from "@/store/useProjectStore";

const SceneCanvas = dynamic(() => import("@/components/3d/SceneCanvas").then((mod) => mod.SceneCanvas), { ssr: false });

const steps = [
  { id: 1, label: "Cliente" },
  { id: 2, label: "Configuración" },
  { id: 3, label: "Revisión" },
];

export function ProjectWizard() {
  const { draft, step, setStep, updateDraft, resetDraft } = useProjectStore();

  const stepContent = useMemo(() => {
    if (step === 1) return <Step1 draft={draft} updateDraft={updateDraft} />;
    if (step === 2) return <Step2 draft={draft} updateDraft={updateDraft} />;
    return <Step3 draft={draft} />;
  }, [draft, step, updateDraft]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(360px,30%)_1fr]">
      <Card className="space-y-6">
        <div>
          <p className="text-sm text-indigo-300">Wizard de 3 pasos</p>
          <h3 className="mt-1 text-2xl font-semibold">Nuevo proyecto</h3>
        </div>
        <div className="flex items-center gap-3">
          {steps.map((item) => (
            <div key={item.id} className="flex flex-1 items-center gap-2">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm ${step >= item.id ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 text-zinc-500'}`}>{item.id}</div>
              <span className="text-sm text-zinc-300">{item.label}</span>
            </div>
          ))}
        </div>
        {stepContent}
        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => setStep(Math.max(step - 1, 1))} disabled={step === 1}>Anterior</Button>
          <div className="flex gap-3">
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>Continuar</Button>
            ) : (
              <Button
                onClick={() => {
                  toast.success("Proyecto guardado en modo demo.");
                  resetDraft();
                }}
              >
                Guardar proyecto
              </Button>
            )}
          </div>
        </div>
      </Card>
      <SceneCanvas type={draft.type} width={draft.width} height={draft.height} depth={draft.depth} shelves={draft.shelves} drawers={draft.drawers} doors={draft.doors} color={draft.color} />
    </div>
  );
}
