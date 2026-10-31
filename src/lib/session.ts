// src/lib/session.ts — Sesión admin con cookie firmada (HMAC-SHA256).
// SERVER-ONLY: nunca importar desde componentes cliente. Usa Web Crypto,
// así funciona tanto en server actions (Node) como en middleware (Edge).
//
// Formato cookie `em_session`: base64url(payload).base64url(firma)
// payload = JSON { e: email, x: expiración_epoch_ms, v: versión_del_PIN }
// La versión sube al cambiar el PIN en Ajustes: requireAdmin() rechaza las
// sesiones emitidas con un PIN anterior. El middleware solo verifica la firma.

const COOKIE_NAME = "em_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_MS / 1000;
}

/** Firma una sesión. Requiere ADMIN_SESSION_SECRET configurado. */
export async function signSession(email: string, secret: string, pinVersion = 0): Promise<string> {
  const payload = JSON.stringify({ e: email, x: Date.now() + SESSION_TTL_MS, v: pinVersion });
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Verifica la cookie. Devuelve el email si la firma es válida y no expiró,
 * null en cualquier otro caso (fail-closed: secreto ausente = inválido).
 */
export async function verifySession(
  cookieValue: string | undefined | null,
  secret: string | undefined | null
): Promise<string | null> {
  return (await verifySessionClaims(cookieValue, secret))?.email ?? null;
}

export interface SessionClaims {
  email: string;
  /** Versión del PIN con que se emitió la sesión (0 = PIN del entorno). */
  pinVersion: number;
}

/** Como verifySession, pero devuelve también la versión del PIN. */
export async function verifySessionClaims(
  cookieValue: string | undefined | null,
  secret: string | undefined | null
): Promise<SessionClaims | null> {
  try {
    if (!cookieValue || !secret) return null;
    const [payloadB64, sigB64] = cookieValue.split(".");
    if (!payloadB64 || !sigB64) return null;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as {
      e?: string;
      x?: number;
      v?: number;
    };
    if (typeof payload.e !== "string" || typeof payload.x !== "number") return null;
    if (Date.now() > payload.x) return null;
    return { email: payload.e, pinVersion: Number.isInteger(payload.v) ? (payload.v as number) : 0 };
  } catch {
    return null;
  }
}
