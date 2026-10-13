import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { corsHeadersFor, handleBackupOptions } from "../../_lib/backup-auth";
import { getBackupAssignmentResolver } from "@/lib/backup-assignment";
import { DEVICE_CREDENTIAL_HEADER, verifyDeviceCredential } from "@/lib/device-credential";
import { getDeviceCredentialStore } from "@/lib/device-credential-store";
import { MAX_UPLOAD_BYTES, runBackupUpload } from "@/lib/backup-upload";
import { buildStorageDeps } from "@/lib/backup-storage-deps";
import {
  BACKUP_PRODUCT_ID,
  evaluateBackupEntitlement,
  normalizeDeviceId,
  type LicenseRow,
} from "@/lib/backup-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, ...body }, { status, headers: { ...NO_STORE, ...cors } });
}

/**
 * Upload de snapshots a Storage: DESHABILITADO (fail-closed).
 *
 * Flujo previsto: secreto compartido (x-backup-secret) -> device_id del body -> licencia Lite activa en la base
 * operativa -> asignación dispositivo/negocio en el proyecto de backups -> upload.
 * Este paso ya valida la licencia; la asignación remota aún no existe (migración
 * 001 sin aplicar), así que el endpoint responde 503 y no escribe en Storage.
 */
export async function POST(req: Request) {
  const cors = corsHeadersFor(req.headers.get("origin"));

  const body = (await req.json().catch(() => null)) as { deviceId?: unknown } | null;
  const deviceId = typeof body?.deviceId === "string" ? normalizeDeviceId(body.deviceId) : null;
  if (!deviceId) {
    return json(400, { error: "deviceId inválido" }, cors);
  }

  // Identidad del equipo: credencial por dispositivo (fail-closed). Sin credencial válida no
  // se evalúa licencia ni se escribe nada. El secreto compartido ya no autoriza uploads.
  const credential = req.headers.get(DEVICE_CREDENTIAL_HEADER);
  const credentialOk = await verifyDeviceCredential(getDeviceCredentialStore(), deviceId, credential);
  if (!credentialOk) {
    return json(401, { error: "Credencial de dispositivo inválida" }, cors);
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("licenses")
    .select("product_id, device_id, type, is_active, expires_at")
    .eq("product_id", BACKUP_PRODUCT_ID)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) {
    return json(502, { error: "No se pudo verificar la licencia" }, cors);
  }

  const entitlement = evaluateBackupEntitlement((data as LicenseRow | null) ?? null, deviceId);
  if (!entitlement.ok) {
    return json(403, { error: "El dispositivo no tiene licencia de respaldo activa", reason: entitlement.reason }, cors);
  }

  // Asignación remota dispositivo→negocio (sin escrituras hasta aplicar la migración).
  const assignment = await getBackupAssignmentResolver().resolve(BACKUP_PRODUCT_ID, deviceId);
  if (!assignment.ok) {
    return json(503, { error: "La asignación de negocio remota aún no está activa", reason: assignment.reason }, cors);
  }

  const payload = body as {
    operationId?: unknown; sha256?: unknown; schemaVersion?: unknown; dataBase64?: unknown;
  } | null;
  const operationId = typeof payload?.operationId === "string" ? payload.operationId.toLowerCase() : "";
  const sha256 = typeof payload?.sha256 === "string" ? payload.sha256.toLowerCase() : "";
  const schemaVersion = Number(payload?.schemaVersion);
  const dataBase64 = typeof payload?.dataBase64 === "string" ? payload.dataBase64 : "";
  if (!UUID_RE.test(operationId) || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isInteger(schemaVersion)) {
    return json(400, { error: "Metadatos de respaldo inválidos" }, cors);
  }
  // Tope antes de decodificar: base64 ocupa ~4/3 del binario.
  if (dataBase64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4) {
    return json(413, { error: "Respaldo demasiado grande" }, cors);
  }
  const bytes = new Uint8Array(Buffer.from(dataBase64, "base64"));

  if (!assignment.assignmentId) {
    return json(503, { error: "La asignación de negocio no tiene identificador de asignación" }, cors);
  }
  let deps;
  try {
    deps = buildStorageDeps(process.env);
  } catch {
    return json(503, { error: "Backup Storage no está configurado" }, cors);
  }
  const result = await runBackupUpload(
    { assignmentId: assignment.assignmentId, operationId, storagePathFor: () => "", bytes, sha256, schemaVersion },
    deps
  );
  if (!result.ok) return json(result.status, { error: result.error }, cors);
  return NextResponse.json(
    { ok: true, operationId: result.operationId, backupId: result.backupId, sizeBytes: result.sizeBytes, sha256: result.sha256, retained: result.retained, cleanupPending: result.cleanupPending },
    { headers: { ...NO_STORE, ...cors } }
  );
}
