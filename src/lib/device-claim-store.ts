import "server-only";

// Conexión real (Supabase, service role) de los códigos de vinculación y del
// relay. La lógica vive en device-claim-service.ts y relay-auth.ts.

import { getSupabaseAdmin } from "@/lib/supabase";
import { DEVICE_CREDENTIALS_TABLE } from "@/lib/device-credential-store";
import { BACKUP_PRODUCT_ID, type LicenseRow } from "@/lib/backup-entitlement";
import type { ClaimDeps } from "@/lib/device-claim-service";

export const CLAIMS_TABLE = "device_credential_claims";
export const CLAIM_FAILURES_TABLE = "device_claim_failures";

/** Licencia de respaldo (Bodega) del equipo, o null. Lanza si la base falla. */
export async function getBackupLicense(deviceId: string): Promise<LicenseRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("licenses")
    .select("product_id, device_id, type, is_active, expires_at")
    .eq("product_id", BACKUP_PRODUCT_ID)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LicenseRow | null) ?? null;
}

export function getClaimDeps(): ClaimDeps {
  const db = () => getSupabaseAdmin();
  return {
    now: () => new Date(),

    async countFailures(ip, deviceId, since) {
      const iso = since.toISOString();
      const [byIp, byDevice] = await Promise.all([
        db().from(CLAIM_FAILURES_TABLE).select("id", { count: "exact", head: true }).eq("ip", ip).gte("at", iso),
        db().from(CLAIM_FAILURES_TABLE).select("id", { count: "exact", head: true }).eq("device_id", deviceId).gte("at", iso),
      ]);
      // Si la tabla no responde, se frena por precaución (fail-closed).
      if (byIp.error || byDevice.error) return { byIp: Number.MAX_SAFE_INTEGER, byDevice: Number.MAX_SAFE_INTEGER };
      return { byIp: byIp.count ?? 0, byDevice: byDevice.count ?? 0 };
    },

    async recordFailure(ip, deviceId) {
      await db().from(CLAIM_FAILURES_TABLE).insert({ ip: ip.slice(0, 64), device_id: deviceId });
      // Limpieza oportunista: no guardar más de un día de historial.
      await db().from(CLAIM_FAILURES_TABLE).delete().lt("at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    },

    async consumeClaim(codeHash, deviceId, now) {
      const { data, error } = await db()
        .from(CLAIMS_TABLE)
        .update({ used_at: now.toISOString() })
        .eq("code_hash", codeHash)
        .eq("device_id", deviceId)
        .is("used_at", null)
        .gt("expires_at", now.toISOString())
        .select("code_hash");
      if (error) return false;
      return Array.isArray(data) && data.length === 1;
    },

    getLicense: getBackupLicense,

    async saveCredentialHash(deviceId, secretHash, now) {
      const { error } = await db()
        .from(DEVICE_CREDENTIALS_TABLE)
        .upsert(
          { device_id: deviceId, secret_hash: secretHash, revoked_at: null, rotated_at: now.toISOString() },
          { onConflict: "device_id" }
        );
      if (error) throw new Error(error.message);
    },
  };
}
