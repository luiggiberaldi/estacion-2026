"use server";

// src/lib/auth-actions.ts — Login/logout server-side.
// El PIN NUNCA viaja al bundle del cliente: aquí se compara su SHA-256 contra
// el PIN vigente (el cambiado en Ajustes o, si no hay, ADMIN_PIN_SHA256 del
// entorno) en tiempo constante, y se emite una cookie httpOnly firmada con
// ADMIN_SESSION_SECRET que lleva la versión del PIN.
//
// Todo lo exportado aquí es un endpoint público: los ayudantes internos viven
// en admin-session.ts.

import { cookies, headers } from "next/headers";
import { sessionCookieName } from "./session";
import { currentSessionEmail, pinMatches, setSessionCookie } from "./admin-session";
import { isLoginBlocked, loadAdminPin, recordLoginFailure } from "./settings-store";

export interface AdminSessionUser {
  email: string;
  name: string;
  role: "superadmin";
}

// Freno en memoria (por instancia): 10 intentos / 10 min por IP. Respaldo del
// freno compartido en la base (station_login_failures), que es el principal.
const attempts = new Map<string, number[]>();
function throttled(key: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= 10) {
    attempts.set(key, list);
    return true;
  }
  list.push(now);
  attempts.set(key, list);
  return false;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function loginAction(
  pin: string
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const current = await loadAdminPin();
  if (!secret || !current.sha256) {
    console.error("[auth] ADMIN_SESSION_SECRET o el PIN no están configurados");
    return { ok: false, error: "Acceso no configurado en el servidor." };
  }

  const ip = await clientIp();
  const blocked = await isLoginBlocked(ip);
  if (blocked || throttled(`login:${ip}`)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  }

  // Pequeña demora uniforme para no facilitar timing attacks.
  await new Promise((r) => setTimeout(r, 500));

  if (!pinMatches(String(pin ?? ""), current.sha256)) {
    await recordLoginFailure(ip);
    return { ok: false, error: "PIN incorrecto" };
  }

  await setSessionCookie(secret, current.version);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(sessionCookieName());
}

export async function getSessionUser(): Promise<AdminSessionUser | null> {
  const email = await currentSessionEmail();
  if (!email) return null;
  return { email, name: "Luiggi Beraldi", role: "superadmin" };
}

/** Email de la sesión vigente, o null. Para server components y rutas API. */
export async function requireSessionEmail(): Promise<string | null> {
  return currentSessionEmail();
}
