"use client";

import { MODULE_CATALOG } from "@/services/kitchenData";

// Pre-rendered once and shipped as static files (public/module-thumbnails/)
// instead of live-rendering all ~57 catalog items through an off-screen
// WebGL canvas every session — that used to run at the same time as the main
// assembly scene's own WebGL context and could crash one of them ("THREE.
// WebGLRenderer: Context Lost"), and was heavy on first open regardless.
// Regenerate the files by opening /kitchen, adding a module of the type that
// changed, and re-exporting its thumbnail if its default look changes.
const THUMBNAILS: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.map((entry) => [entry.type, `/module-thumbnails/${entry.type}.png`])
);

export function useCatalogThumbnails(): { thumbs: Record<string, string> } {
  return { thumbs: THUMBNAILS };
}
