"use client";

import { useEffect, useRef, useState } from "react";
import type { KitchenModule } from "@/types/kitchen";
import { ModulePreview3D } from "@/components/3d/ModulePreview3D";

interface Props {
  modules: KitchenModule[];
  onDone: (images: Record<string, string>) => void;
}

// Mounted off-screen, one module's 3D preview at a time (sequential, not all
// at once, to stay well under the browser's concurrent-WebGL-context limit).
// Each is given a moment to mount/light/paint before its canvas is read back
// via toDataURL() — see the preserveDrawingBuffer flag in ModulePreview3D.
export function ModuleSnapshotRig({ modules, onDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<Record<string, string>>({});
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (modules.length === 0) {
      onDone({});
      return;
    }
    if (index >= modules.length) {
      onDone(imagesRef.current);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const canvas = containerRef.current?.querySelector("canvas");
      if (canvas) {
        try {
          imagesRef.current[modules[index].id] = canvas.toDataURL("image/png");
        } catch {
          // WebGL context lost or tainted canvas — skip, PDF falls back to an icon.
        }
      }
      setIndex((i) => i + 1);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, modules]);

  if (index >= modules.length) return null;
  const mod = modules[index];

  return (
    <div ref={containerRef} className="pointer-events-none fixed left-0 top-0 -z-50 h-55 w-72 -translate-x-[9999px]">
      <ModulePreview3D key={mod.id} module={mod} />
    </div>
  );
}
