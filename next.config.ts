import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Evita que Turbopack escoja una raíz incorrecta por lockfiles duplicados fuera del proyecto
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;
