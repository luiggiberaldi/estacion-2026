import { NextResponse } from "next/server";

/**
 * CORS compartido por los endpoints públicos de respaldo (/api/backup/relay,
 * /api/backup/storage/upload y /api/backup/device-credential/claim). Las cajas
 * los llaman desde el navegador, cross-origin y sin sesión de admin; por eso el
 * CORS se restringe a una lista de orígenes en vez de `*`.
 *
 * La autenticación ya NO es un secreto compartido (`x-backup-secret` iba en el
 * JS público de los POS). Cada equipo usa su propia credencial
 * (`x-device-credential`), ver src/lib/relay-auth.ts y device-claim-service.ts.
 */

// Orígenes desde los que el POS llama a estos endpoints.
// Coma-separados vía BACKUP_ALLOWED_ORIGINS para añadir deployments propios
// (ej. "https://mi-pos.vercel.app,http://localhost:5173").
function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.BACKUP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [
    "https://preciosaldiaoficial.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    ...fromEnv,
  ];
}

/** Headers CORS solo si el Origin del request está en el allowlist. */
export function corsHeadersFor(originHeader: string | null): Record<string, string> {
  if (!originHeader || !getAllowedOrigins().includes(originHeader)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": originHeader,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Credential",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Maneja el preflight OPTIONS con allowlist de orígenes. */
export function handleBackupOptions(req: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(req.headers.get("origin")),
  });
}
