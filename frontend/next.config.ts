import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode floating Next.js indicator (bottom corner, dev only) was
  // overlapping the module-thumbnail screenshots taken by
  // scripts/generate-thumbnails.mjs — its fixed viewport position landed
  // right on top of the canvas being captured. Purely a dev-only overlay,
  // never shown in production builds.
  devIndicators: false,
};

export default nextConfig;
