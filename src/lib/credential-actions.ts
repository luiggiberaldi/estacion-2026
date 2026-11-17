"use server";

// Acciones del panel sobre la vinculación de respaldo por equipo.
// Todo lo exportado aquí es un endpoint POST público: CADA acción llama a
// requireAdmin() antes de tocar la base.

import { requireAdmin } from "./require-admin";
import { getSupabaseAdmin } from "./supabase";
import { CLAIM_TTL_MS, formatClaimCode, generateClaimCode, hashClaimCode } from "./device-claim";
import { evaluateBackupEntitlement, normalizeDeviceId } from "./backup-entitlement";
import { DEVICE_CREDENTIALS_TABLE } from "./device-credential-store";
import { CLAIMS_TABLE, getBackupLicense } from "./device-claim-store";

export interface IssuedClaimCode {
  deviceId: string;
  /** Código para mostrar ("ABCD-EFGH"). Solo se ve esta vez. */
  code: string;
  expiresAt: string;
}

/**
 * Genera un código de vinculación de respaldo para un equipo con licencia de
 * respaldo vigente. Invalida los códigos anteriores sin usar de ese equipo.
 */
export async function issueDeviceClaimCode(rawDeviceId: string): Promise<IssuedClaimCode> {
  await requireAdmin();
  const deviceId = normalizeDeviceId(rawDeviceId);
  if (!deviceId) throw new Error("ID de equipo inválido.");

  const license = await getBackupLicense(deviceId);
  if (!evaluateBackupEntitlement(license, deviceId).ok) {
    throw new Error("Este equipo no tiene una licencia permanente o mensual activa de Bodega: no tiene respaldo en la nube.");
  }

  const db = getSupabaseAdmin();
  const del = await db.from(CLAIMS_TABLE).delete().eq("device_id", deviceId).is("used_at", null);
  if (del.error) {
    throw new Error(
      /device_credential_claims/.test(del.error.message) || del.error.code === "42P01"
        ? "Falta aplicar la migración 008 (códigos de vinculación) en la base."
        : `No se pudo preparar el código: ${del.error.message}`
    );
  }

  const code = generateClaimCode();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
  const { error } = await db
    .from(CLAIMS_TABLE)
    .insert({ code_hash: hashClaimCode(code), device_id: deviceId, expires_at: expiresAt });
  if (error) throw new Error(`No se pudo crear el código: ${error.message}`);

  return { deviceId, code: formatClaimCode(code), expiresAt };
}

export interface DeviceCredentialStatus {
  linked: boolean;
  /** Última vez que se vinculó (o se rotó) la credencial. */
  linkedAt: string | null;
}

/** Estado de vinculación de respaldo por equipo (solo los que tienen fila). */
export async function getDeviceCredentialStatuses(): Promise<Record<string, DeviceCredentialStatus>> {
  await requireAdmin();
  const { data, error } = await getSupabaseAdmin()
    .from(DEVICE_CREDENTIALS_TABLE)
    .select("device_id, created_at, rotated_at, revoked_at")
    .range(0, 4999);
  if (error) throw new Error(`No se pudo leer la vinculación de respaldos: ${error.message}`);
  const out: Record<string, DeviceCredentialStatus> = {};
  for (const r of (data ?? []) as Array<{ device_id: string; created_at: string; rotated_at: string | null; revoked_at: string | null }>) {
    out[r.device_id] = { linked: !r.revoked_at, linkedAt: r.rotated_at ?? r.created_at };
  }
  return out;
}

/** Revoca la credencial de respaldo de un equipo (deja de poder usar el relay). */
export async function revokeDeviceCredential(rawDeviceId: string): Promise<void> {
  await requireAdmin();
  const deviceId = normalizeDeviceId(rawDeviceId);
  if (!deviceId) throw new Error("ID de equipo inválido.");
  const db = getSupabaseAdmin();
  const { error } = await db
    .from(DEVICE_CREDENTIALS_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("device_id", deviceId);
  if (error) throw new Error(`No se pudo revocar: ${error.message}`);
  await db.from(CLAIMS_TABLE).delete().eq("device_id", deviceId).is("used_at", null);
}
