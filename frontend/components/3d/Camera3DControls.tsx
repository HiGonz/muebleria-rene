"use client";

import type { LucideIcon } from "lucide-react";
import { ZoomIn, ZoomOut, Undo2 } from "lucide-react";

export interface CameraAction {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface Camera3DControlsProps {
  presets: CameraAction[];
  toggles: CameraAction[];
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Undo the last (up to 3) module drags — an escape hatch for grabbing a
   *  module by accident while trying to orbit the camera. Hidden when there's
   *  nothing to undo. */
  onUndo: () => void;
  undoCount: number;
}

// Shared touch-friendly 3D view control cluster: icon buttons sized to the
// ~44px touch-target minimum. Horizontal row top-left on desktop (matches the
// old inline button rows this replaces); compact vertical stack bottom-right
// on mobile, clear of notches/home-indicators via the safe-area utility.
export function Camera3DControls({ presets, toggles, onZoomIn, onZoomOut, onUndo, undoCount }: Camera3DControlsProps) {
  return (
    // pointer-events-none on the wrapper + pointer-events-auto on each visible
    // cluster: this wrapper has no explicit height, and `top`+`bottom` both
    // being set (mobile's safe-area `bottom` inset never fully turns off at
    // the lg breakpoint here) stretches it to nearly the full viewport height.
    // Without this, that invisible stretch silently ate clicks meant for the
    // 3D canvas underneath, anywhere in its (huge) empty space.
    <div
      className="safe-bottom-inset pointer-events-none fixed right-4 z-10 flex flex-col items-end gap-2
                 lg:absolute lg:left-4 lg:top-4 lg:right-auto lg:bottom-auto lg:flex-row lg:flex-wrap lg:items-start"
    >
      {undoCount > 0 && (
        <div className="pointer-events-auto rounded-2xl p-1.5" style={{ background: "rgba(12,12,18,0.7)", backdropFilter: "blur(12px)" }}>
          <button
            onClick={onUndo}
            aria-label="Deshacer último movimiento"
            title={`Deshacer último movimiento (${undoCount} disponible${undoCount !== 1 ? "s" : ""})`}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-amber-300 transition-colors hover:bg-white/10 hover:text-amber-200 active:scale-90"
          >
            <Undo2 size={18} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
              {undoCount}
            </span>
          </button>
        </div>
      )}
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl p-1.5 lg:flex-row" style={{ background: "rgba(12,12,18,0.7)", backdropFilter: "blur(12px)" }}>
        {presets.map((p) => (
          <CtrlButton key={p.key} action={p} />
        ))}
      </div>
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl p-1.5 lg:flex-row" style={{ background: "rgba(12,12,18,0.7)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={onZoomIn}
          aria-label="Acercar"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/10 hover:text-white active:scale-90"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={onZoomOut}
          aria-label="Alejar"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/10 hover:text-white active:scale-90"
        >
          <ZoomOut size={18} />
        </button>
      </div>
      {toggles.length > 0 && (
        <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl p-1.5 lg:flex-row" style={{ background: "rgba(12,12,18,0.7)", backdropFilter: "blur(12px)" }}>
          {toggles.map((t) => (
            <CtrlButton key={t.key} action={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function CtrlButton({ action }: { action: CameraAction }) {
  const Icon = action.icon;
  return (
    <button
      onClick={action.onClick}
      aria-label={action.label}
      title={action.label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors active:scale-90 ${
        action.active ? "bg-indigo-500 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}
