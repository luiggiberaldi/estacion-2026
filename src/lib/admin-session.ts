// Ayudantes de sesión y PIN de la Estación (solo servidor).
//
// NO es un módulo "use server" a propósito: todo lo que exporta un archivo
// "use server" es un endpoint POST público. checkPin() aquí sería un oráculo
// para probar PINes sin pasar por el freno de intentos, así que estas
// funciones solo se llaman desde acciones que ya exigen sesión o desde el login.

import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  signSession,
  verifySessionClaims,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "./session";
import { loadAdminPin } from "./settings-store";

// Identidad fija de la sesión: el acceso es solo con PIN, sin correo.
export const ADMIN_IDENTITY = "admin";

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function pinMatches(pin: string, expectedHex: string | null): boolean {
  if (!expectedHex) return false;
  if (!/^\d{6}$/.test(pin)) return false; // formato inválido = fail-closed
  const clean = expectedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return false;
  const a = Buffer.from(sha256Hex(pin), "hex");
  const b = Buffer.from(clean, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifica un PIN contra el vigente. Solo para acciones con sesión. */
export async function checkPin(pin: string): Promise<boolean> {
  const current = await loadAdminPin();
  return pinMatches(String(pin ?? ""), current.sha256);
}

/** Escribe la cookie de sesión para la versión de PIN indicada. */
export async function setSessionCookie(secret: string, pinVersion: number): Promise<void> {
  const value = await signSession(ADMIN_IDENTITY, secret, pinVersion);
  const jar = await cookies();
  jar.set(sessionCookieName(), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  });
}

/**
 * Email de la sesión si la cookie es válida y se emitió con el PIN vigente;
 * null en cualquier otro caso. Las sesiones abiertas antes de cambiar el PIN
 * dejan de valer aquí (el middleware solo comprueba la firma).
 */
export async function currentSessionEmail(): Promise<string | null> {
  const jar = await cookies();
  const claims = await verifySessionClaims(
    jar.get(sessionCookieName())?.value,
    process.env.ADMIN_SESSION_SECRET
  );
  if (!claims) return null;
  const current = await loadAdminPin();
  if (claims.pinVersion !== current.version) return null;
  return claims.email;
}
