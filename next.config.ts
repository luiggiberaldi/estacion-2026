import type { NextConfig } from "next";
import path from "node:path";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cabeceras de seguridad para todas las rutas (ver src/lib/security-headers.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
  // Evita que Turbopack escoja una raíz incorrecta por lockfiles duplicados fuera del proyecto
  turbopack: {
    root: path.join(import.meta.dirname),
  },
  experimental: {
    // Next 16.3: memory eviction de Turbopack. El cache persistente de dev
    // (activado por defecto) permite expulsar entradas de la memoria cache
    // hacia disco, evitando el crecimiento sin límite en sesiones largas
    // (crashea workers en máquinas con poca RAM: "Zone Allocation failed").
    // 'auto' es el default; explícito para documentar la intención.
    turbopackMemoryEviction: "auto",
  },
};

export default nextConfig;
