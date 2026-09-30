"use server";

// src/lib/auth-actions.ts — Login/logout server-side.
// El PIN NUNCA viaja al bundle del cliente: aquí se compara el SHA-256 del
// PIN contra ADMIN_PIN_SHA256 (variable solo-servidor) en tiempo constante,
// y se emite una cookie httpOnly firmada con ADMIN_SESSION_SECRET.

import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  signSession,
  verifySession,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "./session";

const DEFAULT_ADMIN_EMAILS = "luiggiberaldi94@gmail.com,luiggiberaldi94@gmial.com";

export interface AdminSessionUser {
  email: string;
  name: string;
  role: "superadmin";
}

// Throttle best-effort en memoria (por instancia): 10 intentos / 10 min por email.
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

function sha256Hex(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function pinMatches(pin: string, expectedHex: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false; // formato inválido = fail-closed
  const clean = expectedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return false;
  const a = sha256Hex(pin);
  const b = Buffer.from(clean, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function loginAction(
  email: string,
  pin: string
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const pinHash = process.env.ADMIN_PIN_SHA256;
  if (!secret || !pinHash) {
    console.error("[auth] ADMIN_SESSION_SECRET o ADMIN_PIN_SHA256 no configurados");
    return { ok: false, error: "Acceso no configurado en el servidor." };
  }

  const normalizedEmail = (email || "").trim().toLowerCase();
  if (throttled(`login:${normalizedEmail}`)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  }

  const allowed = (process.env.ADMIN_EMAILS ?? DEFAULT_ADMIN_EMAILS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Pequeña demora uniforme para no revelar qué falló ni cuándo.
  await new Promise((r) => setTimeout(r, 500));

  if (!allowed.includes(normalizedEmail) || !pinMatches(pin, pinHash)) {
    return { ok: false, error: "Credenciales incorrectas" };
  }

  const value = await signSession(normalizedEmail, secret);
  const jar = await cookies();
  jar.set(sessionCookieName(), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  });
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(sessionCookieName());
}

export async function getSessionUser(): Promise<AdminSessionUser | null> {
  const jar = await cookies();
  const email = await verifySession(jar.get(sessionCookieName())?.value, process.env.ADMIN_SESSION_SECRET);
  if (!email) return null;
  return { email, name: "Luiggi Beraldi", role: "superadmin" };
}

/** Para uso en server components cuando haga falta (no expone la cookie). */
export async function requireSessionEmail(): Promise<string | null> {
  const jar = await cookies();
  return verifySession(jar.get(sessionCookieName())?.value, process.env.ADMIN_SESSION_SECRET);
}
