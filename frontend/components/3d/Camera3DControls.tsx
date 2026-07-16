"use client";

import type { LucideIcon } from "lucide-react";
import { ZoomIn, ZoomOut, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Move, Undo2 } from "lucide-react";

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
  /** dx/dy are screen-relative: dx>0 pans right, dy>0 pans up. */
  onPan: (dx: number, dy: number) => void;
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
export function Camera3DControls({ presets, toggles, onZoomIn, onZoomOut, onPan, onUndo, undoCount }: Camera3DControlsProps) {
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
      <PanPad onPan={onPan} />
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

// Compact cross-shaped D-pad — the explicit, discoverable way to move the
// camera sideways/up/down, since the mouse-drag equivalent (right-click-drag,
// or two-finger-drag on touch) isn't something most people stumble onto.
function PanPad({ onPan }: { onPan: (dx: number, dy: number) => void }) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white active:scale-90";
  return (
    <div
      className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl p-1.5"
      style={{ background: "rgba(12,12,18,0.7)", backdropFilter: "blur(12px)" }}
    >
      <div />
      <button onClick={() => onPan(0, 1)} aria-label="Mover arriba" title="Mover arriba" className={btn}><ChevronUp size={16} /></button>
      <div />
      <button onClick={() => onPan(-1, 0)} aria-label="Mover izquierda" title="Mover izquierda" className={btn}><ChevronLeft size={16} /></button>
      <div className="flex h-9 w-9 items-center justify-center text-zinc-600"><Move size={13} /></div>
      <button onClick={() => onPan(1, 0)} aria-label="Mover derecha" title="Mover derecha" className={btn}><ChevronRight size={16} /></button>
      <div />
      <button onClick={() => onPan(0, -1)} aria-label="Mover abajo" title="Mover abajo" className={btn}><ChevronDown size={16} /></button>
      <div />
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
