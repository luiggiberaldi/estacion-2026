// Resolutor de la asignación dispositivo → negocio en el proyecto de backups.
//
// El negocio NUNCA sale del cliente: lo genera el servidor y queda ligado al
// dispositivo en la base de backups. Requiere que la migración 001 esté
// aplicada allí (tablas + RPC SECURITY DEFINER). Sin configuración, o si la
// migración no existe, el resolutor falla cerrado y no escribe nada.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readBackupStorageConfig } from "@/lib/backup-storage";

export type AssignmentResult =
  | { ok: true; businessId: string; assignmentId: string | null }
  | { ok: false; reason: "not_configured" | "device_already_assigned" | "business_archived" | "unavailable" };

export interface BackupAssignmentResolver {
  /** Devuelve (o crea) la asignación activa del dispositivo. */
  resolve(productId: string, deviceId: string): Promise<AssignmentResult>;
}

/** Resolutor sin configuración: no toca ningún servicio, fail-closed. */
export const disabledResolver: BackupAssignmentResolver = {
  async resolve() {
    return { ok: false, reason: "not_configured" };
  },
};

/** Errores de Postgres que las RPC usan como señal de negocio (ver migración 001). */
function mapRpcError(message: string | undefined, code: string | undefined): AssignmentResult {
  if (code === "23505" || message === "device_already_assigned") {
    return { ok: false, reason: "device_already_assigned" };
  }
  if (code === "23503" && message === "business_not_found_or_archived") {
    return { ok: false, reason: "business_archived" };
  }
  return { ok: false, reason: "unavailable" };
}

/**
 * Resolutor real sobre el proyecto de backups (service role, solo servidor).
 * 1) Busca asignación activa del dispositivo; si existe, reutiliza su negocio.
 * 2) Si no, crea negocio (UUID del servidor) y asigna el dispositivo.
 * 3) Ante carrera (device_already_assigned), vuelve a leer la asignación ganadora.
 */
export function createSupabaseAssignmentResolver(client: SupabaseClient): BackupAssignmentResolver {
  async function findActive(productId: string, deviceId: string) {
    const { data, error } = await client
      .from("backup_device_assignments")
      .select("assignment_id, business_id")
      .eq("product_id", productId)
      .eq("device_id", deviceId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) return { error: true as const, row: null };
    return { error: false as const, row: (data as { assignment_id: string; business_id: string } | null) };
  }

  return {
    async resolve(productId, deviceId) {
      const existing = await findActive(productId, deviceId);
      if (existing.error) return { ok: false, reason: "unavailable" };
      if (existing.row) {
        return { ok: true, businessId: existing.row.business_id, assignmentId: existing.row.assignment_id };
      }

      const businessId = crypto.randomUUID();
      const created = await client.rpc("create_backup_business", { p_business_id: businessId });
      if (created.error) return mapRpcError(created.error.message, created.error.code);

      const assigned = await client.rpc("assign_backup_device", {
        p_business_id: businessId,
        p_product_id: productId,
        p_device_id: deviceId,
      });
      if (!assigned.error) {
        return { ok: true, businessId, assignmentId: (assigned.data as string | null) ?? null };
      }
      if (assigned.error.code === "23505" || assigned.error.message === "device_already_assigned") {
        // Carrera: otro request asignó el dispositivo primero. Usar su negocio.
        const winner = await findActive(productId, deviceId);
        if (!winner.error && winner.row) {
          return { ok: true, businessId: winner.row.business_id, assignmentId: winner.row.assignment_id };
        }
      }
      return mapRpcError(assigned.error.message, assigned.error.code);
    },
  };
}

let injected: BackupAssignmentResolver | null = null;

/** Inyección para tests o para sustituir la implementación. */
export function setBackupAssignmentResolver(resolver: BackupAssignmentResolver | null): void {
  injected = resolver;
}

/**
 * Resolutor activo: el inyectado si existe; si no, el real cuando hay
 * configuración de backups válida (la misma que usa `storage/versions`); si no, el deshabilitado.
 */
export function getBackupAssignmentResolver(
  env: Record<string, string | undefined> = process.env
): BackupAssignmentResolver {
  if (injected) return injected;
  const cfg = readBackupStorageConfig(env);
  if (!cfg.ok) return disabledResolver;
  const client = createClient(cfg.config.url, cfg.config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createSupabaseAssignmentResolver(client);
}
