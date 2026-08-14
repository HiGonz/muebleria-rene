"use client";

import { useState } from "react";
import { useClosetStore } from "@/store/useClosetStore";
import { CLOSET_BLOCK_CATALOG, layoutModuleBlocks, validateModuleHeight } from "@/services/closetData";
import type { ClosetBlock, ClosetBlockKind, ClosetModule } from "@/types/closet";

// Each block kind's own configurable fields, beyond the shared heightCm —
// this is what makes "cada bloque tiene su propia configuración" (the
// original request's §2) real instead of just a height slider. Narrows on
// block.kind so each branch only touches the fields that actually exist on
// that kind's config.
function BlockConfigFields({ moduleId, block }: { moduleId: string; block: ClosetBlock }) {
  const updateBlockConfig = useClosetStore((s) => s.updateBlockConfig);

  if (block.kind === "drawers") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Cajones
          <input
            type="number" min={1} value={block.config.quantity}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { quantity: Math.max(1, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Separación (cm)
          <input
            type="number" min={0} value={block.config.gapCm}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { gapCm: Math.max(0, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
      </div>
    );
  }
  if (block.kind === "doors") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Puertas
          <input
            type="number" min={1} value={block.config.doorCount}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { doorCount: Math.max(1, Number(e.target.value)) })}
            className="w-10 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          <input
            type="checkbox" checked={block.config.hasLock}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { hasLock: e.target.checked })}
          />
          Con llave
        </label>
      </div>
    );
  }
  if (block.kind === "hangrod") {
    return (
      <div className="flex items-center gap-2 pl-1">
        <label className="flex items-center gap-1 text-[10px] text-warmgray">
          Altura de barra (cm desde el bloque)
          <input
            type="number" min={0} value={block.config.rodHeightFromBottomCm}
            onChange={(e) => updateBlockConfig(moduleId, block.id, { rodHeightFromBottomCm: Math.max(0, Number(e.target.value)) })}
            className="w-12 rounded border border-ivory/15 bg-ink px-1 py-0.5 text-right text-[10px] text-ivory"
          />
        </label>
      </div>
    );
  }
  return null; // "open" has no config fields beyond heightCm
}

export function ClosetModuleStackEditor({ module, maxHeightCm }: { module: ClosetModule; maxHeightCm: number }) {
  const addBlock = useClosetStore((s) => s.addBlock);
  const removeBlock = useClosetStore((s) => s.removeBlock);
  const moveBlock = useClosetStore((s) => s.moveBlock);
  const updateBlockHeight = useClosetStore((s) => s.updateBlockHeight);
  const [showPicker, setShowPicker] = useState(false);

  const validation = validateModuleHeight(module.blocks, maxHeightCm);
  const layout = layoutModuleBlocks(module.blocks);
  // Blocks are stored bottom-to-top (matches the 3D stacking direction);
  // shown top-to-bottom here to match how a real closet elevation reads.
  const topToBottom = [...layout].reverse();

  const handleAdd = (kind: ClosetBlockKind) => {
    addBlock(module.id, kind);
    setShowPicker(false);
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ivory">{module.label}</h3>
        <span className={`text-xs ${validation.fits ? "text-warmgray" : "text-terracotta"}`}>
          {validation.totalCm}cm{validation.fits ? "" : ` — excede por ${validation.overflowCm}cm`}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {topToBottom.map(({ block, yBottomCm, yTopCm }) => {
          const entry = CLOSET_BLOCK_CATALOG.find((e) => e.kind === block.kind)!;
          return (
            <div key={block.id} className="flex flex-col gap-1.5 rounded-lg border border-ivory/10 bg-ivory/4 px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-ivory">{entry.label}</p>
                  <p className="text-[10px] text-warmgray">{yBottomCm}cm – {yTopCm}cm</p>
                </div>
                <input
                  type="number"
                  value={block.heightCm}
                  min={1}
                  onChange={(e) => updateBlockHeight(module.id, block.id, Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory"
                  aria-label={`Altura de ${entry.label}`}
                />
                <button onClick={() => moveBlock(module.id, block.id, "up")} title="Subir" className="text-warmgray hover:text-ivory">↑</button>
                <button onClick={() => moveBlock(module.id, block.id, "down")} title="Bajar" className="text-warmgray hover:text-ivory">↓</button>
                <button onClick={() => removeBlock(module.id, block.id)} title="Eliminar" className="text-warmgray hover:text-terracotta">✕</button>
              </div>
              <BlockConfigFields moduleId={module.id} block={block} />
            </div>
          );
        })}
      </div>

      {showPicker ? (
        <div role="menu" aria-label="Elegir tipo de bloque" className="flex flex-col gap-1 rounded-lg border border-ivory/12 bg-ink/95 p-1">
          {CLOSET_BLOCK_CATALOG.map((entry) => (
            <button
              key={entry.kind}
              role="menuitem"
              onClick={() => handleAdd(entry.kind)}
              className="flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ivory/8"
            >
              <span className="text-xs font-medium text-ivory">{entry.label}</span>
              <span className="text-[10px] text-warmgray">{entry.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="rounded-lg border border-dashed border-ivory/20 px-3 py-2 text-xs text-warmgray transition-colors hover:border-ivory/40 hover:text-ivory"
        >
          + Agregar bloque
        </button>
      )}
    </div>
  );
}
