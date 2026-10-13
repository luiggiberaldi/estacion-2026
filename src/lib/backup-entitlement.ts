// Decisión pura de elegibilidad para respaldo remoto. Sin I/O: se alimenta con
// la fila de `licenses` leída desde la base operativa en el servidor.

import type { LicenseType } from "@/lib/types";

export const BACKUP_PRODUCT_ID = "bodega";

/** Tipos de licencia con derecho a respaldo remoto (Lite de pago). */
const ELIGIBLE_TYPES: ReadonlySet<LicenseType> = new Set<LicenseType>(["permanent", "monthly"]);

/** Fila real de `licenses` (esquema de la base operativa: `is_active`, no `status`). */
export interface LicenseRow {
  product_id: string;
  device_id: string | null;
  type: LicenseType;
  is_active: boolean;
  expires_at: string | null;
}

export type EntitlementResult =
  | { ok: true; deviceId: string }
  | { ok: false; reason: "no_license" | "wrong_product" | "not_eligible" | "inactive" | "expired" };

/** Normaliza un device id igual que el POS: sin espacios, en mayúsculas. */
export function normalizeDeviceId(raw: string): string | null {
  const id = raw.replace(/\s+/g, "").toUpperCase();
  return id.length >= 8 && id.length <= 64 ? id : null;
}

/**
 * Decide si `row` (la licencia del dispositivo) permite respaldo remoto ahora mismo.
 * Fail-closed: cualquier campo que no encaje se rechaza.
 */
export function evaluateBackupEntitlement(
  row: LicenseRow | null | undefined,
  deviceId: string,
  now: Date = new Date()
): EntitlementResult {
  if (!row) return { ok: false, reason: "no_license" };
  if (row.product_id !== BACKUP_PRODUCT_ID) return { ok: false, reason: "wrong_product" };
  if (!row.device_id || normalizeDeviceId(row.device_id) !== deviceId) {
    return { ok: false, reason: "no_license" };
  }
  if (!ELIGIBLE_TYPES.has(row.type)) return { ok: false, reason: "not_eligible" };
  if (row.is_active !== true) return { ok: false, reason: "inactive" };
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, deviceId };
}
