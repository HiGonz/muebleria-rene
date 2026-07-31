import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Mueblería Rene Studio",
  description: "Plataforma web para diseño, cotización y gestión de proyectos de carpintería.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#15110c",
  // Disables the browser's native pinch/double-tap zoom on the page chrome
  // (where it was catching random UI sections and leaving buttons stranded
  // off-screen on mobile) — the 3D view's own pinch-to-zoom still works
  // since that's handled by OrbitControls' own touch listeners on the
  // canvas, independent of this.
  userScalable: false,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`h-full antialiased ${manrope.variable} ${fraunces.variable}`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}
