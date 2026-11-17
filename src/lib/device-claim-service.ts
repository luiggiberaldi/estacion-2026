// Canje de un código de vinculación por la credencial de respaldo del equipo.
//
// Lógica con dependencias inyectadas para poder probarla sin Supabase. La ruta
// /api/backup/device-credential/claim la conecta con la base real.
//
// Reglas (fail-closed; ante la duda, 401 sin decir por qué):
//   - Freno: 5 fallos por IP y 5 por equipo en 15 min.
//   - El código debe existir, ser de ESE equipo, no estar usado ni vencido.
//   - Se marca usado de forma atómica (un segundo canje del mismo código falla).
//   - El equipo debe tener licencia de respaldo vigente (misma regla que el relay).
//   - Se emite una credencial nueva; la anterior (si había) deja de valer.

import { generateDeviceCredential, hashDeviceCredential } from "./device-credential";
import { hashClaimCode, normalizeClaimCode } from "./device-claim";
import { evaluateBackupEntitlement, normalizeDeviceId, type LicenseRow } from "./backup-entitlement";

export const CLAIM_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_CLAIM_FAILURES_PER_IP = 5;
export const MAX_CLAIM_FAILURES_PER_DEVICE = 5;

export interface ClaimDeps {
  now(): Date;
  /** Fallos recientes (desde `since`) para esa IP y para ese equipo. */
  countFailures(ip: string, deviceId: string, since: Date): Promise<{ byIp: number; byDevice: number }>;
  recordFailure(ip: string, deviceId: string | null): Promise<void>;
  /**
   * Marca el código como usado SOLO si es de ese equipo, no estaba usado y no
   * venció. Devuelve true si lo marcó (operación atómica en la base).
   */
  consumeClaim(codeHash: string, deviceId: string, now: Date): Promise<boolean>;
  getLicense(deviceId: string): Promise<LicenseRow | null>;
  /** Guarda (o reemplaza) el hash de la credencial activa del equipo. */
  saveCredentialHash(deviceId: string, secretHash: string, now: Date): Promise<void>;
}

export type ClaimResult =
  | { ok: true; deviceId: string; credential: string }
  | { ok: false; status: 400 | 401 | 403 | 429 | 503; error: string };

const GENERIC_401 = { ok: false as const, status: 401 as const, error: "Código inválido o vencido" };

export async function claimDeviceCredential(
  input: { deviceId: unknown; code: unknown; ip: string },
  deps: ClaimDeps
): Promise<ClaimResult> {
  const deviceId = typeof input.deviceId === "string" ? normalizeDeviceId(input.deviceId) : null;
  if (!deviceId) return { ok: false, status: 400, error: "deviceId inválido" };

  const now = deps.now();
  const since = new Date(now.getTime() - CLAIM_FAILURE_WINDOW_MS);
  const recent = await deps.countFailures(input.ip, deviceId, since);
  if (recent.byIp >= MAX_CLAIM_FAILURES_PER_IP || recent.byDevice >= MAX_CLAIM_FAILURES_PER_DEVICE) {
    return { ok: false, status: 429, error: "Demasiados intentos. Espera unos minutos." };
  }

  const code = normalizeClaimCode(input.code);
  if (!code) {
    await deps.recordFailure(input.ip, deviceId);
    return GENERIC_401;
  }

  const consumed = await deps.consumeClaim(hashClaimCode(code), deviceId, now);
  if (!consumed) {
    await deps.recordFailure(input.ip, deviceId);
    return GENERIC_401;
  }

  const license = await deps.getLicense(deviceId);
  const entitlement = evaluateBackupEntitlement(license, deviceId, now);
  if (!entitlement.ok) {
    return { ok: false, status: 403, error: "El equipo no tiene licencia de respaldo activa" };
  }

  const credential = generateDeviceCredential();
  try {
    await deps.saveCredentialHash(deviceId, hashDeviceCredential(credential), now);
  } catch {
    return { ok: false, status: 503, error: "No se pudo guardar la credencial" };
  }
  return { ok: true, deviceId, credential };
}
