"use client";

// Dev-only tool, not linked from anywhere in the app's navigation — renders
// ModulePreview3D off-screen for whatever catalog types are listed below and
// saves each canvas as a real PNG straight into public/module-thumbnails/
// via the paired /api/dev-save-thumb route. Reuse it whenever a new module
// type is added to MODULE_CATALOG (see CatalogThumbnails.tsx for why this
// step exists — no live-render fallback, thumbnails are static files):
//   1. Edit TYPES below to the new type(s).
//   2. Open /dev-thumb-export, click "restart" (a real click — a
//      script-triggered one doesn't count for some browser behavior), wait
//      for "done".
import { useEffect, useState } from "react";
import { ModulePreview3D } from "@/components/3d/ModulePreview3D";
import { buildNewModule } from "@/services/kitchenData";
import type { KitchenModuleType } from "@/types/kitchen";

const TYPES: KitchenModuleType[] = [];

export default function DevThumbExport() {
  const [index, setIndex] = useState(0);
  const modules = TYPES.map((t) => buildNewModule(t));

  useEffect(() => {
    if (index >= modules.length) return;
    const timer = setTimeout(() => {
      const canvas = document.querySelector(`[data-thumb-slot="${index}"] canvas`);
      if (canvas instanceof HTMLCanvasElement) {
        const url = canvas.toDataURL("image/png");
        fetch("/api/dev-save-thumb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: modules[index].type, dataUrl: url }),
        });
      }
      setIndex((i) => i + 1);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div style={{ background: "#111" }}>
      {index < modules.length && (
        <div data-thumb-slot={index} style={{ width: 288 }}>
          <ModulePreview3D module={modules[index]} />
        </div>
      )}
      <p style={{ color: "#fff" }}>
        {modules.length === 0 ? "edit TYPES in this file first" : index >= modules.length ? "done" : `rendering ${index + 1}/${modules.length}`}
      </p>
      <button id="__restart" style={{ color: "#fff" }} onClick={() => setIndex(0)}>restart</button>
    </div>
  );
}
