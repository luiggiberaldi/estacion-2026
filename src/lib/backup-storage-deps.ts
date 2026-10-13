// Dependencias reales del flujo de upload: RPC del proyecto de backups y
// Storage del bucket privado. Solo servidor; la service-role nunca sale de aquí.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readBackupStorageConfig } from "@/lib/backup-storage";
import type { UploadDeps } from "@/lib/backup-upload";

export function createBackupStorageDeps(client: SupabaseClient, bucket: string): UploadDeps {
  const storage = client.storage.from(bucket);
  return {
    async beginOperation({ assignmentId, operationId, sizeBytes, sha256, schemaVersion }) {
      const { data, error } = await client.rpc("begin_backup_operation", {
        p_assignment_id: assignmentId,
        p_operation_id: operationId,
        p_size_bytes: sizeBytes,
        p_sha256: sha256,
        p_schema_version: schemaVersion,
      });
      if (error) return { ok: false as const, code: error.message };
      const row = (Array.isArray(data) ? data[0] : data) as
        | { manifest_id: string; business_id: string; storage_path: string; status: string }
        | undefined;
      if (!row) return { ok: false as const, code: "backup_operation_missing" };
      return {
        ok: true as const,
        manifestId: row.manifest_id,
        businessId: row.business_id,
        storagePath: row.storage_path,
        status: row.status,
      };
    },
    async putObject(path, bytes) {
      const { error } = await storage.upload(path, bytes, {
        contentType: "application/gzip",
        upsert: false,
      });
      return { ok: !error };
    },
    async getObject(path) {
      const { data, error } = await storage.download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async removeObject(path) {
      const { error } = await storage.remove([path]);
      return { ok: !error };
    },
    async finalize(manifestId, sizeBytes, sha256) {
      const { data, error } = await client.rpc("finalize_backup_upload", {
        p_manifest_id: manifestId,
        p_verified_size_bytes: sizeBytes,
        p_verified_sha256: sha256,
      });
      if (error) return { ok: false as const, code: error.message };
      const rows = (data ?? []) as { manifest_id: string; storage_path: string }[];
      return {
        ok: true as const,
        pendingCleanup: rows.map((r) => ({ manifestId: r.manifest_id, storagePath: r.storage_path })),
      };
    },
    async completeCleanup(manifestId) {
      const { error } = await client.rpc("complete_backup_cleanup", { p_manifest_id: manifestId });
      return { ok: !error };
    },
    async failOperation(manifestId, errorCode) {
      await client.rpc("fail_backup_operation", { p_manifest_id: manifestId, p_error_code: errorCode });
    },
  };
}

/** Construye las dependencias reales desde el entorno del servidor, o falla cerrado. */
export function buildStorageDeps(env: Record<string, string | undefined>): UploadDeps {
  const cfg = readBackupStorageConfig(env);
  if (!cfg.ok) throw new Error("Backup Storage no está configurado");
  const client = createClient(cfg.config.url, cfg.config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createBackupStorageDeps(client, cfg.config.bucket);
}
