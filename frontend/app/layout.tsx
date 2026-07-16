import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mueblería Rene Studio",
  description: "Plataforma web para diseño, cotización y gestión de proyectos de carpintería.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}
