import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppInit } from "@/components/app-init";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const archivo = Archivo({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PresupuestApp",
  description: "Presupuestos profesionales en 1 minuto, con tu marca",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "PresupuestApp", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#C2410C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={archivo.variable}>
      <body className="min-h-dvh antialiased">
        <AppInit />
        {children}
        <Toaster position="top-center" richColors duration={2500} visibleToasts={2} />
      </body>
    </html>
  );
}
