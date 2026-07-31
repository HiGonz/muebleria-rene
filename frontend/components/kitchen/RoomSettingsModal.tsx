"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { KitchenProjectForm } from "./KitchenProjectForm";

// Everything that used to live in the standalone "Constructor" tab (project
// info, room dimensions, windows & doors) — now reachable as a modal from
// wherever you actually are (Vista 3D by default), instead of a whole tab of
// its own that only mattered when first setting a room up.
export function RoomSettingsModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-display text-sm font-semibold text-ivory">Habitación</h2>
            <p className="mt-0.5 text-xs text-warmgray">Datos del proyecto, dimensiones y ventanas/puertas</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <KitchenProjectForm />
        </div>
      </motion.div>
    </div>
  );
}
