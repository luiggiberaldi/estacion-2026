import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSessionEmail } from "@/lib/auth-actions";
import { BACKUP_RETENTION_COUNT, readBackupStorageConfig, selectBackupsToDelete } from "@/lib/backup-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * GET ?businessId=<uuid>            -> metadata de las últimas 3 copias (sin payload)
 * GET ?businessId=<uuid>&path=<obj> -> descarga de una copia concreta
 * Solo admin. El path debe pertenecer al businessId solicitado (sin traversal).
 */
export async function GET(req: Request) {
  if (!(await requireSessionEmail())) {
    return fail(401, "No autorizado");
  }
  const url = new URL(req.url);
  const businessId = (url.searchParams.get("businessId") || "").toLowerCase();
  if (!UUID_RE.test(businessId)) {
    return fail(400, "businessId inválido");
  }

  const cfg = readBackupStorageConfig(process.env);
  if (!cfg.ok) return fail(503, "Backup Storage no está configurado");
  const supabase = createClient(cfg.config.url, cfg.config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(cfg.config.bucket);
  const dir = businessId;

  const requestedPath = url.searchParams.get("path");
  if (requestedPath !== null) {
    // Solo se acepta una ruta exacta bajo el businessId, sin "..", sin barras extra.
    const safe = requestedPath.startsWith(`${dir}/`)
      && !requestedPath.includes("..")
      && /^[a-z0-9/_\-TZ.]+$/i.test(requestedPath)
      && requestedPath.endsWith(".json.gz");
    if (!safe) return fail(400, "Ruta de backup inválida");

    const { data, error } = await storage.download(requestedPath);
    if (error || !data) return fail(404, "Backup no encontrado");
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": "attachment",
        ...NO_STORE,
      },
    });
  }

  const { data: listed, error } = await storage.list(dir, { limit: 1000 });
  if (error || !listed) return fail(502, "No se pudo listar los backups");

  const entries = listed
    .filter((o) => o.name.endsWith(".json.gz"))
    .map((o) => ({
      path: `${dir}/${o.name}`,
      createdAt: o.created_at || o.updated_at || "1970-01-01T00:00:00Z",
      sizeBytes: Number((o.metadata as { size?: number } | undefined)?.size ?? 0),
    }));

  // Mantener solo los más recientes para la vista; las demás no se devuelven.
  const newestFirst = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = newestFirst.slice(0, BACKUP_RETENTION_COUNT);
  const pendingCleanup = selectBackupsToDelete(entries, BACKUP_RETENTION_COUNT).length;

  return NextResponse.json(
    {
      ok: true,
      businessId,
      backups: latest.map((b) => ({
        backupId: b.path,
        createdAt: b.createdAt,
        sizeBytes: b.sizeBytes,
      })),
      pendingCleanup,
    },
    { headers: NO_STORE }
  );
}
