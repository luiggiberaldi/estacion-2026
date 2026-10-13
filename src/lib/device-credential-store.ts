// Store real de credenciales por dispositivo, sobre la base operativa (solo servidor).
// Lee la fila activa (revoked_at is null). Si la tabla no existe o hay error, devuelve
// null: la verificación falla cerrada.

import type { DeviceCredentialStore } from "@/lib/device-credential";
import { getSupabaseAdmin } from "@/lib/supabase";

export const DEVICE_CREDENTIALS_TABLE = "device_upload_credentials";

export function getDeviceCredentialStore(): DeviceCredentialStore {
  return {
    async getActiveHash(deviceId) {
      try {
        const { data, error } = await getSupabaseAdmin()
          .from(DEVICE_CREDENTIALS_TABLE)
          .select("secret_hash")
          .eq("device_id", deviceId)
          .is("revoked_at", null)
          .maybeSingle();
        if (error || !data) return null;
        return (data as { secret_hash: string }).secret_hash;
      } catch {
        return null;
      }
    },
  };
}
