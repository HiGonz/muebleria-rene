"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
import type { KitchenModule } from "@/types/kitchen";

export type NudgeDirection = "left" | "right" | "forward" | "back" | "up" | "down";

const STEP_OPTIONS_CM = [1, 5, 10, 25];

// Press-and-hold repeat: a short initial delay (so a single tap never fires
// twice), then repeats with a gently shrinking interval — same feel as OS
// key-repeat / most CAD nudge tools, instead of firing at a flat rate.
const HOLD_INITIAL_DELAY_MS = 350;
const HOLD_MIN_INTERVAL_MS = 60;
const HOLD_START_INTERVAL_MS = 160;
const HOLD_ACCEL_MS_PER_TICK = 12;

function useHoldRepeat(onFire: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(HOLD_START_INTERVAL_MS);

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    intervalRef.current = HOLD_START_INTERVAL_MS;
  };

  const start = () => {
    stop();
    onFire();
    const tick = () => {
      onFire();
      intervalRef.current = Math.max(HOLD_MIN_INTERVAL_MS, intervalRef.current - HOLD_ACCEL_MS_PER_TICK);
      timerRef.current = setTimeout(tick, intervalRef.current);
    };
    timerRef.current = setTimeout(tick, HOLD_INITIAL_DELAY_MS);
  };

  useEffect(() => stop, []);
  return { start, stop };
}

function NudgeButton({ direction, icon: Icon, label, onNudge }: {
  direction: NudgeDirection; icon: typeof ArrowUp; label: string; onNudge: (d: NudgeDirection) => void;
}) {
  const { start, stop } = useHoldRepeat(() => onNudge(direction));
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} — clic o mantén presionado`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ivory/85 transition-colors hover:bg-ivory/12 hover:text-ivory active:bg-brass/25 active:text-brass-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
    >
      <Icon size={13} />
    </button>
  );
}

// Compact nudge control for the module currently selected in Vista 3D — just
// the arrow cross and the step size, always relative to the module's own
// front (not the camera). Docked to the left edge, vertically centered: that
// spot is never covered by the camera controls (top), the module list/legend
// (bottom-left), or the selector/inspector panel (right-anchored) no matter
// which of those happen to be open at the same time.
export function SelectionToolbar({
  module, stepCm, onStepChange, onNudge,
}: {
  module: KitchenModule;
  stepCm: number;
  onStepChange: (step: number) => void;
  onNudge: (direction: NudgeDirection) => void;
}) {
  const canMoveHeight = module.category === "upper" || module.type === "gabinete_superior_esquinero_puertas";

  return (
    <div className="pointer-events-none fixed left-3 top-1/2 z-30 -translate-y-1/2">
      <div
        role="toolbar"
        aria-label="Mover mueble seleccionado"
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-xl border border-ivory/15 bg-ink/90 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        {/* XZ nudge cross, always relative to the module's own front */}
        <div className="flex items-center gap-0.5">
          <div className="flex flex-col gap-0.5">
            <div className="flex gap-0.5">
              <span className="h-7 w-7 shrink-0" />
              <NudgeButton direction="forward" icon={ArrowUp} label="Mover hacia el frente del mueble" onNudge={onNudge} />
              <span className="h-7 w-7 shrink-0" />
            </div>
            <div className="flex gap-0.5">
              <NudgeButton direction="left" icon={ArrowLeft} label="Mover a la izquierda del mueble" onNudge={onNudge} />
              <span className="h-7 w-7 shrink-0" />
              <NudgeButton direction="right" icon={ArrowRight} label="Mover a la derecha del mueble" onNudge={onNudge} />
            </div>
            <div className="flex gap-0.5">
              <span className="h-7 w-7 shrink-0" />
              <NudgeButton direction="back" icon={ArrowDown} label="Mover hacia atrás del mueble" onNudge={onNudge} />
              <span className="h-7 w-7 shrink-0" />
            </div>
          </div>

          {canMoveHeight && (
            <div className="flex flex-col gap-0.5 border-l border-ivory/12 pl-1">
              <NudgeButton direction="up" icon={ChevronUp} label="Subir altura de montaje" onNudge={onNudge} />
              <NudgeButton direction="down" icon={ChevronDown} label="Bajar altura de montaje" onNudge={onNudge} />
            </div>
          )}
        </div>

        {/* Step size */}
        <div className="flex items-center gap-0.5 rounded-lg bg-ivory/6 p-0.5">
          {STEP_OPTIONS_CM.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStepChange(s)}
              title={`Paso de ${s}cm`}
              aria-pressed={stepCm === s}
              className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 ${
                stepCm === s ? "bg-brass text-ink" : "text-ivory/60 hover:text-ivory"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
