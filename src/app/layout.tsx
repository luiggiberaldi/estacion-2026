import type { Metadata } from "next";
import { Instrument_Serif, Work_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SWDeregister } from "@/components/sw-deregister";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Estación Maestra · Precios al Día Bodega",
  description:
    "Panel de administración para gestionar licencias, demos, backups y mensualidades de Precios al Día Bodega.",
  keywords: [
    "Precios al Día",
    "Bodega",
    "Estación Maestra",
    "licencias",
    "POS",
    "Venezuela",
  ],
  authors: [{ name: "Precios al Día" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${instrumentSerif.variable} ${workSans.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
        <SWDeregister />
      </body>
    </html>
  );
}
