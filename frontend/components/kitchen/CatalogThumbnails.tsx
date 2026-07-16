"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { MODULE_CATALOG, buildNewModule } from "@/services/kitchenData";
import { PreviewMesh } from "@/components/3d/ModulePreview3D";
import type { KitchenModule } from "@/types/kitchen";

const ALL_TYPES = MODULE_CATALOG.map((entry) => entry.type);

// Module-level cache, shared by every ModuleSelector mount for the life of the
// page — snapshotting the whole catalog means ~50 sequential off-screen 3D
// renders, so it must run at most once per session rather than once per time
// the selector opens.
let cache: Record<string, string> = {};
let generating = false;

interface Snapshot { thumbs: Record<string, string>; generating: boolean }
const subscribers = new Set<(snap: Snapshot) => void>();

function snapshot(): Snapshot {
  return { thumbs: cache, generating };
}

function notify() {
  const snap = snapshot();
  for (const fn of subscribers) fn(snap);
}

/** Read-only view of whatever catalog thumbnails have been generated so far. */
export function useCatalogThumbnails(): { thumbs: Record<string, string>; isGenerator: boolean } {
  const [state, setState] = useState(snapshot);
  const [isGenerator, setIsGenerator] = useState(false);

  useEffect(() => {
    subscribers.add(setState);
    const allDone = ALL_TYPES.every((t) => cache[t]);
    if (!allDone && !generating) {
      generating = true;
      setIsGenerator(true);
      notify();
    }
    return () => { subscribers.delete(setState); };
  }, []);

  return { thumbs: state.thumbs, isGenerator };
}

// Passive read of whether a catalog-wide generation pass is in flight right
// now (regardless of who's driving it) — the 3D tab uses this to keep its
// own live scene's WebGL context from ever coexisting with the generator's.
// Two simultaneous contexts is enough to crash the *unrelated* one in some
// environments (observed: adding a module while the catalog was still
// generating left the main scene's canvas permanently blank after a
// "WebGLRenderer: Context Lost" — even though nothing about the main scene
// itself had changed).
export function useIsCatalogGenerating(): boolean {
  const [gen, setGen] = useState(generating);
  useEffect(() => {
    const listener = (snap: Snapshot) => setGen(snap.generating);
    subscribers.add(listener);
    return () => { subscribers.delete(listener); };
  }, []);
  return gen;
}

// Reframes the camera on whichever module is currently staged, then hands a
// snapshot back up after a short paint delay. Lives *inside* the single
// long-lived Canvas below — swapping `module` only changes the mesh/camera,
// it never touches the WebGL context itself.
function SnapshotStage({ module, onCaptured }: { module: KitchenModule; onCaptured: () => void }) {
  const { camera } = useThree();

  useEffect(() => {
    const W = module.dimensions.width / 100;
    const H = module.dimensions.height / 100;
    const D = module.dimensions.depth / 100;
    const dist = Math.max(W, H, D) * 2.4 + 0.4;
    // Flat modules (countertops, sinks, cooktops, zócalos…) sit almost edge-on
    // if the camera's height scales off their own tiny H — lift it instead.
    const isFlatObject = H < Math.max(W, D) * 0.3;
    const cameraY = isFlatObject ? Math.max(W, D) * 0.55 : H * 0.62;
    camera.position.set(W * 0.55, cameraY, dist);
    camera.lookAt(0, H / 2, 0);
    (camera as PerspectiveCamera).updateProjectionMatrix?.();
    const timer = setTimeout(onCaptured, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, camera]);

  return <PreviewMesh module={module} />;
}

// Renders the whole catalog's thumbnails through a single shared Canvas/WebGL
// context, one module at a time, instead of mounting a fresh <Canvas> per
// item — swapping the staged module only touches the scene graph, not the
// context itself. Callers must ensure no other WebGL context (e.g. the main
// assembly scene) is mounted while this runs — see useIsCatalogGenerating.
export function CatalogThumbnailGenerator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => ALL_TYPES.findIndex((t) => !cache[t]));
  const done = index < 0 || index >= ALL_TYPES.length;

  useEffect(() => {
    if (done && generating) { generating = false; notify(); }
  }, [done]);

  // Selecting a module closes the sidebar (and with it this generator)
  // mid-run — without this, `generating` would stay stuck true forever,
  // permanently pausing the main scene (see useIsCatalogGenerating). The
  // partial cache is kept, so reopening the sidebar just resumes.
  useEffect(() => {
    return () => {
      if (generating) { generating = false; notify(); }
    };
  }, []);

  if (done) return null;
  const mod = buildNewModule(ALL_TYPES[index]);

  const handleCaptured = () => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (canvas) {
      try {
        cache = { ...cache, [ALL_TYPES[index]]: canvas.toDataURL("image/png") };
        notify();
      } catch {
        // WebGL context lost or tainted canvas — skip, chip falls back to its icon.
      }
    }
    setIndex((i) => i + 1);
  };

  return (
    <div ref={containerRef} className="pointer-events-none fixed left-0 top-0 -z-50 h-55 w-72 -translate-x-[9999px]">
      <Canvas
        camera={{ fov: 38, near: 0.01, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        shadows
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.5, 4, 5]} intensity={0.85} castShadow />
        <directionalLight position={[-1.5, 1, -3]} intensity={0.18} color="#8899ff" />
        <SnapshotStage module={mod} onCaptured={handleCaptured} />
      </Canvas>
    </div>
  );
}
