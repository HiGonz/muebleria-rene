"use client";

import { useState } from "react";
import type { WebGLRenderer } from "three";

// WebGL context loss doesn't always auto-restore (observed: two Canvases
// mounting/resuming in the same React commit — e.g. the main assembly scene
// un-pausing at the exact moment a module inspector's preview canvas mounts —
// can leave one of them permanently blank). Give the browser a brief chance
// to restore it on its own; if it hasn't, force a full remount, which is what
// manually navigating away and back used to fix by accident.
export function useContextRecovery() {
  const [instanceKey, setInstanceKey] = useState(0);

  const handleCreated = ({ gl }: { gl: WebGLRenderer }) => {
    const canvasEl = gl.domElement;
    const rawGl = gl.getContext();
    const handleLost = (e: Event) => {
      e.preventDefault();
      setTimeout(() => {
        if (rawGl.isContextLost()) setInstanceKey((k) => k + 1);
      }, 800);
    };
    canvasEl.addEventListener("webglcontextlost", handleLost, { once: true });
  };

  return { instanceKey, handleCreated };
}
