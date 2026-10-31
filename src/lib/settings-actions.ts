"use server";

// Acciones de la zona de Ajustes. Todas exigen sesión de administrador.

import { requireAdmin } from "./require-admin";
import { loadAdminPin, loadSettings, saveAdminPin, saveSettings } from "./settings-store";
import {
  SettingsValidationError,
  validateSettings,
  weakPinReason,
  type StationSettings,
} from "./settings-schema";
import { checkPin, setSessionCookie, sha256Hex } from "./admin-session";

export interface StationSettingsPayload {
  settings: StationSettings;
  /** false = falta la migración 006: se muestran los valores por defecto y no se puede guardar. */
  available: boolean;
  updatedAt: string | null;
}

export async function getStationSettings(): Promise<StationSettingsPayload> {
  await requireAdmin();
  return loadSettings();
}

export async function updateStationSettings(
  input: unknown
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  await requireAdmin();
  let settings: StationSettings;
  try {
    settings = validateSettings(input);
  } catch (e) {
    if (e instanceof SettingsValidationError) return { ok: false, error: e.message };
    throw e;
  }
  try {
    const updatedAt = await saveSettings(settings);
    return { ok: true, updatedAt };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface AdminPinStatus {
  /** 'db' = cambiado desde Ajustes; 'env' = el de Vercel (ADMIN_PIN_SHA256). */
  source: "db" | "env" | "none";
  /** true si el PIN vigente es uno trivial (000000, 123456…): conviene cambiarlo. */
  isWeak: boolean;
}

const TRIVIAL_PIN_HASHES = new Set(
  ["000000", "111111", "123456", "654321", "123123", "999999"].map(sha256Hex)
);

export async function getAdminPinStatus(): Promise<AdminPinStatus> {
  await requireAdmin();
  const pin = await loadAdminPin();
  return { source: pin.source, isWeak: !!pin.sha256 && TRIVIAL_PIN_HASHES.has(pin.sha256) };
}

/**
 * Cambia el PIN de la Estación. Pide el PIN actual (aunque ya haya sesión) y
 * rechaza PINs triviales. Sube la versión del PIN: todas las demás sesiones
 * abiertas se cierran; la de quien lo cambia se renueva y sigue dentro.
 */
export async function changeAdminPin(
  currentPin: string,
  newPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return { ok: false, error: "Acceso no configurado en el servidor." };

  if (!(await checkPin(String(currentPin ?? "")))) {
    // Misma demora que el login: no abaratar la prueba de PINes con sesión robada.
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: "El PIN actual no es correcto." };
  }
  const next = String(newPin ?? "");
  const weak = weakPinReason(next);
  if (weak) return { ok: false, error: weak };
  if (TRIVIAL_PIN_HASHES.has(sha256Hex(next))) {
    return { ok: false, error: "Ese PIN es demasiado fácil de adivinar." };
  }
  if (next === currentPin) return { ok: false, error: "El PIN nuevo debe ser distinto del actual." };

  const before = await loadAdminPin();
  const version = before.version + 1;
  try {
    await saveAdminPin(sha256Hex(next), version);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await setSessionCookie(secret, version);
  return { ok: true };
}
