// Lectura/escritura de station_settings (solo servidor; usa la service role).
//
// NO es un módulo "use server": sus funciones no deben quedar expuestas como
// acciones públicas. Las acciones con sesión están en settings-actions.ts.
//
// Si la tabla aún no existe (migración 006 sin aplicar) todo cae a los valores
// por defecto de licensePolicy.js y `available` queda en false: la vista de
// Ajustes lo explica y no deja guardar.

import { getSupabaseAdmin } from "./supabase";
import { defaultSettings, mergeWithDefaults, type StationSettings } from "./settings-schema";

export const SETTINGS_TABLE = "station_settings";
const CACHE_MS = 15_000;

export interface LoadedSettings {
  settings: StationSettings;
  /** false = la tabla no existe o no se pudo leer: se usan valores por defecto. */
  available: boolean;
  updatedAt: string | null;
}

let cache: { value: LoadedSettings; at: number } | null = null;

export function clearSettingsCache(): void {
  cache = null;
  pinCache = null;
}

export async function loadSettings(): Promise<LoadedSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  let value: LoadedSettings;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SETTINGS_TABLE)
      .select("data, updated_at")
      .eq("key", "config")
      .maybeSingle();
    if (error) throw error;
    value = {
      settings: mergeWithDefaults(data?.data ?? null),
      available: true,
      updatedAt: (data?.updated_at as string | undefined) ?? null,
    };
  } catch (e) {
    console.warn("[settings] usando valores por defecto:", (e as Error)?.message);
    value = { settings: defaultSettings(), available: false, updatedAt: null };
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(settings: StationSettings): Promise<string> {
  const updatedAt = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from(SETTINGS_TABLE)
    .upsert({ key: "config", data: settings, updated_at: updatedAt }, { onConflict: "key" });
  if (error) {
    throw new Error(
      error.code === "42P01" || /station_settings/.test(error.message)
        ? "Falta aplicar la migración 006 (station_settings) en la base."
        : `No se pudieron guardar los ajustes: ${error.message}`
    );
  }
  clearSettingsCache();
  return updatedAt;
}

// ── PIN de administrador ────────────────────────────────────────────────────

export interface AdminPin {
  /** SHA-256 en hex del PIN vigente, o null si no hay ninguno configurado. */
  sha256: string | null;
  /** Sube con cada cambio de PIN; las sesiones con otra versión dejan de valer. */
  version: number;
  /** 'db' = cambiado desde Ajustes; 'env' = ADMIN_PIN_SHA256 de Vercel. */
  source: "db" | "env" | "none";
}

let pinCache: { value: AdminPin; at: number } | null = null;

/**
 * PIN vigente: el guardado desde Ajustes (fila 'admin_pin') si existe; si no,
 * ADMIN_PIN_SHA256 del entorno con versión 0. Si la base falla, se usa el del
 * entorno: un corte de la base no debe dejar fuera al administrador.
 */
export async function loadAdminPin(): Promise<AdminPin> {
  if (pinCache && Date.now() - pinCache.at < CACHE_MS) return pinCache.value;
  const envHash = process.env.ADMIN_PIN_SHA256?.trim().toLowerCase() || null;
  let value: AdminPin = { sha256: envHash, version: 0, source: envHash ? "env" : "none" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SETTINGS_TABLE)
      .select("data")
      .eq("key", "admin_pin")
      .maybeSingle();
    if (!error && data?.data) {
      const d = data.data as { sha256?: unknown; version?: unknown };
      if (typeof d.sha256 === "string" && /^[0-9a-f]{64}$/i.test(d.sha256)) {
        value = {
          sha256: d.sha256.toLowerCase(),
          version: Number.isInteger(d.version) ? (d.version as number) : 1,
          source: "db",
        };
      }
    }
  } catch {
    // Base caída o tabla inexistente: se queda el PIN del entorno.
  }
  pinCache = { value, at: Date.now() };
  return value;
}

export async function saveAdminPin(sha256: string, version: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(SETTINGS_TABLE)
    .upsert(
      { key: "admin_pin", data: { sha256, version, changedAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) {
    throw new Error(
      error.code === "42P01" || /station_settings/.test(error.message)
        ? "Falta aplicar la migración 006 (station_settings) en la base."
        : `No se pudo guardar el PIN: ${error.message}`
    );
  }
  clearSettingsCache();
}

// ── Freno de intentos de PIN (compartido entre instancias) ──────────────────

const FAILURES_TABLE = "station_login_failures";
const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_IP = 10;
export const MAX_FAILURES_GLOBAL = 60;

/**
 * ¿Hay que frenar este intento? Cuenta fallos recientes de la IP y en total.
 * Devuelve null si la tabla no existe (el freno en memoria sigue activo).
 */
export async function isLoginBlocked(ip: string): Promise<boolean | null> {
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const admin = getSupabaseAdmin();
    const [perIp, global] = await Promise.all([
      admin.from(FAILURES_TABLE).select("id", { count: "exact", head: true }).eq("ip", ip).gte("at", since),
      admin.from(FAILURES_TABLE).select("id", { count: "exact", head: true }).gte("at", since),
    ]);
    if (perIp.error || global.error) return null;
    return (perIp.count ?? 0) >= MAX_FAILURES_PER_IP || (global.count ?? 0) >= MAX_FAILURES_GLOBAL;
  } catch {
    return null;
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from(FAILURES_TABLE).insert({ ip: ip.slice(0, 64) });
    // Limpieza oportunista: no guardar historial viejo.
    await admin.from(FAILURES_TABLE).delete().lt("at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  } catch {
    // Sin tabla: solo queda el freno en memoria.
  }
}
