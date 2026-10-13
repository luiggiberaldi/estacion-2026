// Credencial por dispositivo para el upload de respaldos.
//
// El POS guarda un secreto aleatorio (32 bytes) que se emitió al emparejar. El
// servidor solo guarda su SHA-256 y lo compara en tiempo constante. Revocar un
// equipo no afecta a los demás. Ver docs/plans/2026-10-13-pos-device-credential.md.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DEVICE_CREDENTIAL_HEADER = "x-device-credential";

export interface DeviceCredentialStore {
  /** Devuelve el hash activo (no revocado) del dispositivo, o null. */
  getActiveHash(deviceId: string): Promise<string | null>;
}

/** Genera un secreto nuevo para entregar una sola vez al POS. */
export function generateDeviceCredential(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceCredential(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Verifica la credencial del dispositivo. Fail-closed: cualquier duda devuelve false.
 * La comparación de hashes es en tiempo constante.
 */
export async function verifyDeviceCredential(
  store: DeviceCredentialStore,
  deviceId: string,
  secret: string | null | undefined
): Promise<boolean> {
  if (!secret || secret.length < 20 || secret.length > 200) return false;
  const storedHash = await store.getActiveHash(deviceId);
  if (!storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const provided = Buffer.from(hashDeviceCredential(secret), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
