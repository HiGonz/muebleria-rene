"use client";

// Dev-only tool, not linked from anywhere in the app's navigation — renders
// ModulePreview3D for whatever catalog types are passed via ?types=a,b,c and
// exposes each one as <div data-thumb-slot="TYPE" data-ready="true"><canvas>.
// Meant to be driven by scripts/generate-thumbnails.mjs (Playwright, headless,
// one process, no manual clicking) rather than by hand — see that script's
// header comment for usage. Reuse whenever a new module type needs a
// thumbnail (see CatalogThumbnails.tsx for why this step exists — no
// live-render fallback, thumbnails are static files).
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ModulePreview3D } from "@/components/3d/ModulePreview3D";
import { buildNewModule } from "@/services/kitchenData";
import type { KitchenModuleType } from "@/types/kitchen";

function Slot({ type }: { type: KitchenModuleType }) {
  const [ready, setReady] = useState(false);
  // A fixed settle delay, not a pixel/frame probe — R3F's own resize/first-
  // paint timing turned out to vary a lot (cold GPU context, dev-server
  // recompiles) and polling pixel data from the page side was unreliable.
  // Playwright drives this headless, so a generous fixed wait costs wall
  // clock, not tokens.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const mod = buildNewModule(type);
  return (
    <div data-thumb-slot={type} data-ready={ready} style={{ width: 288, height: 220 }}>
      <ModulePreview3D module={mod} />
    </div>
  );
}

function DevThumbExportInner() {
  const params = useSearchParams();
  const typesParam = params.get("types");
  const types = (typesParam ? typesParam.split(",").filter(Boolean) : []) as KitchenModuleType[];

  return (
    <div style={{ background: "#111" }}>
      {types.length === 0 && <p style={{ color: "#fff" }}>Pass ?types=a,b,c</p>}
      {types.map((t) => (
        <Slot key={t} type={t} />
      ))}
    </div>
  );
}

export default function DevThumbExport() {
  return (
    <Suspense fallback={null}>
      <DevThumbExportInner />
    </Suspense>
  );
}
