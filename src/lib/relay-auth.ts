// Autorización del relay de respaldos (/api/backup/relay).
//
// Antes bastaba el secreto compartido `x-backup-secret`, que va dentro del JS
// público de los POS: cualquiera podía leer o pisar el respaldo de cualquier
// equipo conociendo su ID. Ahora cada equipo se identifica con SU credencial
// (emitida al canjear un código de vinculación) y además necesita licencia de
// respaldo vigente, tanto para subir (POST) como para leer (GET).
//
// El secreto compartido ya NO se acepta (sin período de transición: hoy ningún
// POS llega al relay; ver plan de fixeo F3).

import { verifyDeviceCredential, type DeviceCredentialStore } from "./device-credential";
import { evaluateBackupEntitlement, normalizeDeviceId, type LicenseRow } from "./backup-entitlement";

export interface RelayAuthDeps {
  store: DeviceCredentialStore;
  getLicense(deviceId: string): Promise<LicenseRow | null>;
  now?: () => Date;
}

export type RelayAuthResult =
  | { ok: true; deviceId: string }
  | { ok: false; status: 400 | 401 | 403 | 502; error: string; reason?: string };

export async function authorizeRelay(
  input: { deviceId: unknown; credential: string | null },
  deps: RelayAuthDeps
): Promise<RelayAuthResult> {
  const deviceId = typeof input.deviceId === "string" ? normalizeDeviceId(input.deviceId) : null;
  if (!deviceId) return { ok: false, status: 400, error: "deviceId inválido" };

  const credentialOk = await verifyDeviceCredential(deps.store, deviceId, input.credential);
  if (!credentialOk) {
    return { ok: false, status: 401, error: "Credencial de equipo inválida o ausente. Vincula el respaldo con un código de la Estación." };
  }

  let license: LicenseRow | null;
  try {
    license = await deps.getLicense(deviceId);
  } catch {
    return { ok: false, status: 502, error: "No se pudo verificar la licencia" };
  }
  const entitlement = evaluateBackupEntitlement(license, deviceId, deps.now?.() ?? new Date());
  if (!entitlement.ok) {
    return { ok: false, status: 403, error: "El dispositivo no tiene licencia de respaldo activa", reason: entitlement.reason };
  }
  return { ok: true, deviceId };
}
