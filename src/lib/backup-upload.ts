// Flujo de upload de un respaldo comprimido (.json.gz) al bucket privado.
// Orden: begin (RPC) -> subir objeto -> leerlo y verificar tamaño/SHA-256 ->
// finalize (RPC, marca verified y pone en cola los anteriores a 3) -> borrar
// pendientes en Storage -> complete_cleanup. Si falla antes de verified, se
// marca fail_backup_operation y no se borra nada.

import { createHash } from "node:crypto";
import { BACKUP_RETENTION_COUNT } from "@/lib/backup-storage";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface UploadInput {
  assignmentId: string;
  operationId: string;
  storagePathFor: (businessId: string) => string;
  bytes: Uint8Array;
  sha256: string;
  schemaVersion: number;
}

export interface UploadDeps {
  beginOperation(args: { assignmentId: string; operationId: string; sizeBytes: number; sha256: string; schemaVersion: number }):
    Promise<{ ok: true; manifestId: string; businessId: string; storagePath: string; status: string } | { ok: false; code: string }>;
  putObject(path: string, bytes: Uint8Array): Promise<{ ok: boolean }>;
  getObject(path: string): Promise<Uint8Array | null>;
  removeObject(path: string): Promise<{ ok: boolean }>;
  finalize(manifestId: string, sizeBytes: number, sha256: string): Promise<{ ok: true; pendingCleanup: { manifestId: string; storagePath: string }[] } | { ok: false; code: string }>;
  completeCleanup(manifestId: string): Promise<{ ok: boolean }>;
  failOperation(manifestId: string, errorCode: string): Promise<void>;
}

export type UploadResult =
  | { ok: true; operationId: string; backupId: string; sizeBytes: number; sha256: string; retained: number; cleanupPending: number }
  | { ok: false; status: number; error: string };

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runBackupUpload(input: UploadInput, deps: UploadDeps): Promise<UploadResult> {
  const size = input.bytes.byteLength;
  if (size < 1 || size > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: "Tamaño de respaldo inválido" };
  if (sha256Hex(input.bytes) !== input.sha256) return { ok: false, status: 400, error: "SHA-256 no coincide con el contenido" };

  const begun = await deps.beginOperation({
    assignmentId: input.assignmentId,
    operationId: input.operationId,
    sizeBytes: size,
    sha256: input.sha256,
    schemaVersion: input.schemaVersion,
  });
  if (!begun.ok) {
    const status = begun.code === "operation_id_payload_conflict" ? 409 : 422;
    return { ok: false, status, error: "No se pudo iniciar la operación de respaldo" };
  }
  if (begun.status === "verified" || begun.status === "cleanup_pending" || begun.status === "deleted") {
    // Reintento idempotente de una operación ya confirmada.
    return { ok: true, operationId: input.operationId, backupId: begun.manifestId, sizeBytes: size, sha256: input.sha256, retained: BACKUP_RETENTION_COUNT, cleanupPending: 0 };
  }
  if (begun.status !== "uploading") {
    return { ok: false, status: 409, error: "La operación no se puede continuar" };
  }

  const fail = async (code: string, status: number, error: string): Promise<UploadResult> => {
    await deps.failOperation(begun.manifestId, code);
    return { ok: false, status, error };
  };

  const put = await deps.putObject(begun.storagePath, input.bytes);
  if (!put.ok) return fail("object_upload_failed", 502, "No se pudo subir el respaldo");

  const stored = await deps.getObject(begun.storagePath);
  if (!stored || stored.byteLength !== size || sha256Hex(stored) !== input.sha256) {
    await deps.removeObject(begun.storagePath);
    return fail("verification_failed", 502, "El objeto almacenado no coincide");
  }

  const fin = await deps.finalize(begun.manifestId, size, input.sha256);
  if (!fin.ok) return fail("verification_failed", 409, "No se pudo confirmar el respaldo");

  // Solo después de verified se borran los anteriores; si falla, queda pendiente.
  let cleanupPending = 0;
  for (const old of fin.pendingCleanup) {
    const removed = await deps.removeObject(old.storagePath);
    if (removed.ok && (await deps.completeCleanup(old.manifestId)).ok) continue;
    cleanupPending++;
  }

  return { ok: true, operationId: input.operationId, backupId: begun.manifestId, sizeBytes: size, sha256: input.sha256, retained: BACKUP_RETENTION_COUNT, cleanupPending };
}
