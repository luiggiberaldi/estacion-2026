import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Blindaje compartido por los endpoints de backup (/api/backup/complete y
 * /api/backup/relay). El POS (preciosaldia-bodega) los llama cross-origin
 * desde el navegador sin sesión de usuario, por lo que la autenticación es
 * un shared secret por header (constancia en tiempo constante) y el CORS se
 * restringe a un allowlist de orígenes en vez de `*`.
 */

export const BACKUP_SECRET_HEADER = "x-backup-secret";

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

function getSecret(): string | null {
  const secret = process.env.BACKUP_SHARED_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

/** Respuesta 401 estándar con CORS aplicado. */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "No autorizado: falta o es inválido el header x-backup-secret" },
    { status: 401, headers: corsHeadersFor("*") }
  );
}

/**
 * Valida el shared secret del request. Comparación en tiempo constante para
 * evitar oráculos de timing. Si la variable no está configurada, el endpoint
 * queda en fail-closed (rechaza todo) para no abrir una puerta invisible.
 */
export function verifyBackupSecret(req: Request): boolean {
  const secret = getSecret();
  if (!secret) return false;

  const provided = req.headers.get(BACKUP_SECRET_HEADER) || "";
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    // timingSafeEqual lanza con longitudes distintas: comparar contra el
    // secreto real igualmente para mantener tiempo constante.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Headers CORS solo si el Origin del request está en el allowlist. */
export function corsHeadersFor(originHeader: string | null): Record<string, string> {
  if (!originHeader || !getAllowedOrigins().includes(originHeader)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": originHeader,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Backup-Secret",
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
