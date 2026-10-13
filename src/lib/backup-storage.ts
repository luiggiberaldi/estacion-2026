// Lógica pura para el almacenamiento privado de backups en Supabase Storage.
// Sin dependencias de runtime: se usa desde route handlers y desde tests.

export const BACKUP_RETENTION_COUNT = 3;
export const BACKUP_MAX_BYTES = 45 * 1024 * 1024; // por debajo del límite Free de 50 MB por archivo

const EXPECTED_PROJECT_REF = "qlujyvauumzfpdefdkyl";
const BUCKET_RE = /^[a-z0-9][a-z0-9_-]{2,62}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BackupStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

export type BackupStorageConfigResult =
  | { ok: true; config: BackupStorageConfig }
  | { ok: false; reason: "missing" | "invalid" };

/** Valida la configuración server-only. Fail-closed: cualquier duda devuelve `ok:false`. */
export function readBackupStorageConfig(
  env: Record<string, string | undefined>
): BackupStorageConfigResult {
  const url = env.SUPABASE_BACKUP_URL;
  const serviceRoleKey = env.SUPABASE_BACKUP_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_BACKUP_BUCKET;
  if (!url || !serviceRoleKey || !bucket) return { ok: false, reason: "missing" };

  try {
    const parsed = new URL(url);
    const expectedHost = `${EXPECTED_PROJECT_REF}.supabase.co`;
    if (parsed.protocol !== "https:" || parsed.hostname !== expectedHost) {
      return { ok: false, reason: "invalid" };
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!BUCKET_RE.test(bucket)) return { ok: false, reason: "invalid" };

  return { ok: true, config: { url, serviceRoleKey, bucket } };
}

/**
 * Ruta interna del objeto. Usa UUIDs internos (nunca nombre/teléfono del negocio)
 * y el timestamp del servidor. Rechaza cualquier segmento no UUID para evitar traversal.
 */
export function buildBackupObjectPath(params: {
  businessId: string;
  operationId: string;
  serverTime: Date;
}): string {
  if (!UUID_RE.test(params.businessId) || !UUID_RE.test(params.operationId)) {
    throw new Error("Identificador inválido para la ruta de backup");
  }
  const iso = params.serverTime.toISOString();
  const yyyy = iso.slice(0, 4);
  const mm = iso.slice(5, 7);
  // 2026-10-13T12:34:56.789Z -> 20261013T123456Z
  const stamp = iso.replace(/[-:]/g, "").slice(0, 15) + "Z";
  return `${params.businessId.toLowerCase()}/${yyyy}/${mm}/${stamp}-${params.operationId.toLowerCase()}.json.gz`;
}

export interface RetainableBackup {
  path: string;
  createdAt: string;
}

/**
 * Devuelve los objetos que deben borrarse para conservar solo los `keep` más recientes.
 * Orden: createdAt DESC, luego path DESC como desempate estable.
 */
export function selectBackupsToDelete<T extends RetainableBackup>(
  backups: readonly T[],
  keep: number = BACKUP_RETENTION_COUNT
): T[] {
  const sorted = [...backups].sort((a, b) => {
    const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a.path < b.path ? 1 : a.path > b.path ? -1 : 0;
  });
  return sorted.slice(Math.max(0, keep));
}
