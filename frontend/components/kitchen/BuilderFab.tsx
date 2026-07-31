"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export function BuilderFab({ onClick, className = "right-5" }: { onClick: () => void; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      whileTap={{ scale: 0.92 }}
      aria-label="Agregar mueble"
      className={`safe-bottom-inset fixed z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brass text-ink shadow-[0_8px_24px_rgba(193,144,79,0.45)] ${className}`}
    >
      <Plus size={26} />
    </motion.button>
  );
}
