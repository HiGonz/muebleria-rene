"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input } from "@/components/ui/input";

function NumInput({ value, onChange, min = 0, max = 9999, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string;
}) {
  return (
    <div className="relative">
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-warmgray">{unit}</span>}
    </div>
  );
}

function ApplyButton({ onClick }: { onClick: () => number }) {
  const [confirmed, setConfirmed] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => {
          const count = onClick();
          setConfirmed(count);
          setTimeout(() => setConfirmed(null), 2500);
        }}
        className="rounded-xl bg-brass px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-brass-soft"
      >
        Aplicar a toda la cocina
      </button>
      {confirmed !== null && (
        <span className="text-xs text-sage">✓ Aplicado a {confirmed} mueble{confirmed !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

// Homogenizes cabinet heights in one shot instead of opening each module's
// inspector individually. Towers are floor-to-ceiling by design and always
// sized on their own — neither control here ever touches them.
export function GlobalHeightsModal({ onClose }: { onClose: () => void }) {
  const { applyLowerHeightToAll, applyUpperMountHeightToAll, applyUpperHeightToAll } = useKitchenStore();

  const [lowerHeight, setLowerHeight] = useState(82);
  const [upperHeight, setUpperHeight] = useState(72);
  const [upperMountHeight, setUpperMountHeight] = useState(144);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ivory">Alturas globales</h2>
            <p className="mt-0.5 text-xs text-warmgray">Homogeneiza la altura de los muebles de toda la cocina en pocos clics</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* ── Lower cabinets ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Muebles de piso</p>
            <p className="text-[11px] text-warmgray/70">Cambia el alto de todos los muebles bajos (no afecta torres ni aéreos).</p>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-warmgray uppercase tracking-wider">Alto</label>
              <NumInput value={lowerHeight} onChange={setLowerHeight} min={50} max={120} unit="cm" />
            </div>
            <ApplyButton onClick={() => applyLowerHeightToAll(lowerHeight)} />
          </div>

          <div className="border-t border-ivory/8" />

          {/* ── Upper cabinets ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Muebles aéreos</p>
            <p className="text-[11px] text-warmgray/70">
              Cambia el alto propio y el nivel de montaje (altura desde el piso) de todos los muebles aéreos, para que
              todos lleguen exactamente al mismo nivel — arriba y abajo — sin importar el tamaño original de cada uno.
              No afecta torres.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-warmgray uppercase tracking-wider">Alto</label>
                <NumInput value={upperHeight} onChange={setUpperHeight} min={30} max={150} unit="cm" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-warmgray uppercase tracking-wider">Altura de montaje</label>
                <NumInput value={upperMountHeight} onChange={setUpperMountHeight} min={100} max={220} unit="cm" />
              </div>
            </div>
            <ApplyButton
              onClick={() => {
                applyUpperHeightToAll(upperHeight);
                return applyUpperMountHeightToAll(upperMountHeight);
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
