import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { corsHeadersFor, handleBackupOptions } from "../_lib/backup-auth";
import { DEVICE_CREDENTIAL_HEADER } from "@/lib/device-credential";
import { getDeviceCredentialStore } from "@/lib/device-credential-store";
import { getBackupLicense } from "@/lib/device-claim-store";
import { authorizeRelay } from "@/lib/relay-auth";

// Relay de respaldos: puerta de emergencia para cajas que no pueden escribir
// directo en cloud_backups (p. ej. perdieron su sesión anónima y RLS las frena).
// La Estación escribe/lee por ellas con la service role.
//
// Autorización (ver src/lib/relay-auth.ts):
//   - credencial PROPIA del equipo en `x-device-credential` (se obtiene
//     canjeando un código de vinculación generado en la Estación);
//   - licencia de respaldo vigente, tanto para subir como para leer.
// El secreto compartido `x-backup-secret` ya no se acepta: iba en el JS público
// de los POS y permitía leer o pisar el respaldo de cualquier equipo.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

function authDeps() {
  return { store: getDeviceCredentialStore(), getLicense: getBackupLicense };
}

// ── POST: subir/actualizar el backup del equipo ─────────────────────────────
export async function POST(req: Request) {
  const cors = { "Cache-Control": "no-store", ...corsHeadersFor(req.headers.get("origin")) };

  const body = (await req.json().catch(() => null)) as { deviceId?: unknown; backup_data?: unknown } | null;
  const auth = await authorizeRelay(
    {
      deviceId: body?.deviceId ?? req.headers.get("x-device-id"),
      credential: req.headers.get(DEVICE_CREDENTIAL_HEADER),
    },
    authDeps()
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status, headers: cors });
  }
  if (!body?.backup_data || typeof body.backup_data !== "object") {
    return NextResponse.json({ error: "backup_data requerido" }, { status: 400, headers: cors });
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("cloud_backups")
      .upsert(
        { device_id: auth.deviceId, backup_data: body.backup_data, updated_at: new Date().toISOString() },
        { onConflict: "device_id" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true, deviceId: auth.deviceId }, { headers: cors });
  } catch (err: unknown) {
    console.error("[API Backup Relay] POST:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo guardar el respaldo" }, { status: 500, headers: cors });
  }
}

// ── GET: leer el backup del equipo (para restaurar) ─────────────────────────
export async function GET(req: Request) {
  const cors = { "Cache-Control": "no-store", ...corsHeadersFor(req.headers.get("origin")) };

  const url = new URL(req.url);
  const auth = await authorizeRelay(
    {
      deviceId: url.searchParams.get("deviceId") ?? req.headers.get("x-device-id"),
      credential: req.headers.get(DEVICE_CREDENTIAL_HEADER),
    },
    authDeps()
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status, headers: cors });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("cloud_backups")
      .select("backup_data, updated_at")
      .eq("device_id", auth.deviceId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      { ok: true, deviceId: auth.deviceId, backup_data: data?.backup_data ?? null, updated_at: data?.updated_at ?? null },
      { headers: cors }
    );
  } catch (err: unknown) {
    console.error("[API Backup Relay] GET:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo leer el respaldo" }, { status: 500, headers: cors });
  }
}
