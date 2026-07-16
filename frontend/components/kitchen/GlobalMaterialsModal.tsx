"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input } from "@/components/ui/input";
import { BOARD_COSTS, COUNTERTOP_COSTS } from "@/services/kitchenData";
import { WOOD_TEXTURES } from "@/components/3d/woodTextures";
import type { BoardMaterial, CountertopMaterial, ExteriorTextureId } from "@/types/kitchen";

const BOARD_OPTIONS = Object.keys(BOARD_COSTS) as BoardMaterial[];
const COUNTERTOP_OPTIONS = Object.keys(COUNTERTOP_COSTS) as CountertopMaterial[];

function SelectInput<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: T[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-[#111118]">{o}</option>
      ))}
    </select>
  );
}

function TexturePicker({ value, onChange, allowNone }: {
  value: ExteriorTextureId | "ninguna"; onChange: (v: ExteriorTextureId | "ninguna") => void; allowNone?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange("ninguna")}
          className={`rounded-lg border px-3 py-1.5 text-[11px] transition-colors ${
            value === "ninguna" ? "border-indigo-500 bg-indigo-500/10 text-white" : "border-white/10 bg-white/3 text-zinc-400 hover:border-white/25"
          }`}
        >
          Ninguna (color liso)
        </button>
      )}
      {WOOD_TEXTURES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          title={t.label}
          className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
            value === t.id ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/3 hover:border-white/25"
          }`}
        >
          <span className="h-8 w-12 rounded-md border border-black/20" style={{ backgroundColor: t.swatch }} />
          <span className="text-[10px] text-zinc-400">{t.label}</span>
        </button>
      ))}
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
        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        Aplicar a toda la cocina
      </button>
      {confirmed !== null && (
        <span className="text-xs text-emerald-400">✓ Aplicado a {confirmed} mueble{confirmed !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

// Homogenizes materials across every module in the room in a couple of
// clicks, instead of opening each module's inspector one by one. Two
// independent groups (exterior board, cubierta) so a shop can sync just one
// of them without touching the other.
export function GlobalMaterialsModal({ onClose }: { onClose: () => void }) {
  const { applyExteriorToAll, applyCountertopToAll } = useKitchenStore();

  const [exteriorMaterial, setExteriorMaterial] = useState<BoardMaterial>("MDF 18mm");
  const [exteriorTexture, setExteriorTexture] = useState<ExteriorTextureId>("blanco_liso");

  const [countertopMaterial, setCountertopMaterial] = useState<CountertopMaterial>("Postformado");
  const [countertopColor, setCountertopColor] = useState("#c8b89a");
  const [countertopTexture, setCountertopTexture] = useState<ExteriorTextureId | "ninguna">("ninguna");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d14] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Materiales globales</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Homogeneiza el acabado de toda la cocina en pocos clics</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/8 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* ── Exterior ────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Tablero exterior</p>
            <p className="text-[11px] text-zinc-600">Puertas, cajones, paneles de punta y el frente del zócalo, en todos los muebles.</p>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Material</label>
              <SelectInput value={exteriorMaterial} onChange={setExteriorMaterial} options={BOARD_OPTIONS} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Acabado / textura</label>
              <TexturePicker value={exteriorTexture} onChange={(v) => setExteriorTexture(v as ExteriorTextureId)} />
            </div>
            <ApplyButton onClick={() => applyExteriorToAll(exteriorMaterial, exteriorTexture)} />
          </div>

          <div className="border-t border-white/8" />

          {/* ── Countertop ──────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Cubierta</p>
            <p className="text-[11px] text-zinc-600">Toda cubierta independiente y la integrada en muebles bajos con cubierta.</p>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Material</label>
              <SelectInput value={countertopMaterial} onChange={setCountertopMaterial} options={COUNTERTOP_OPTIONS} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={countertopColor}
                  onChange={(e) => setCountertopColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1"
                />
                <Input value={countertopColor} onChange={(e) => setCountertopColor(e.target.value)} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Textura</label>
              <TexturePicker value={countertopTexture} onChange={setCountertopTexture} allowNone />
            </div>
            <ApplyButton onClick={() => applyCountertopToAll(countertopMaterial, countertopColor, countertopTexture)} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
