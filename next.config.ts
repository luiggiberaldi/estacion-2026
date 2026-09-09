import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
