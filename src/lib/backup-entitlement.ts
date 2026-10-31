// Decisión pura de elegibilidad para respaldo remoto. Sin I/O: se alimenta con
// la fila de `licenses` leída desde la base operativa en el servidor.

import type { LicenseType } from "@/lib/types";
import {
  BACKUP_ELIGIBLE_TYPES,
  evaluateBackupEligibility,
  normalizeDeviceId,
} from "@/lib/licensePolicy";

export const BACKUP_PRODUCT_ID = "bodega";

/**
 * Tipos de licencia con derecho a respaldo remoto (planes de pago).
 * Única fuente de verdad: `licensePolicy.js` (compartido con la caja/POS).
 */
const ELIGIBLE_TYPES: ReadonlySet<LicenseType> = new Set<LicenseType>(
  BACKUP_ELIGIBLE_TYPES as LicenseType[]
);

// La normalización del device id vive en la política compartida para que la
// caja y la estación acepten exactamente los mismos identificadores.
export { normalizeDeviceId };

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

  // La regla de vida de la licencia (actividad, vencimientos y período de
  // gracia) es la MISMA que aplica la caja: vive en licensePolicy.js. Aquí
  // solo se añade el alcance por producto y por equipo.
  const eligibility = evaluateBackupEligibility(
    { type: row.type, isActive: row.is_active, expiresAt: row.expires_at },
    now.getTime()
  );
  if (eligibility.allowed) return { ok: true, deviceId };

  return { ok: false, reason: eligibility.reason === "inactive" ? "inactive" : "expired" };
}
