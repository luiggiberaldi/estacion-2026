import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  verifyBackupSecret,
  unauthorized,
  corsHeadersFor,
  handleBackupOptions,
} from "../_lib/backup-auth";

// Relay de respaldos para dispositivos que la política RLS bloquea.
//
// Contexto: los dispositivos POS usan sesión anónima y, hasta aplicar la
// migración 001_device_own_row_rls.sql, RLS les bloquea cloud_backups
// (42501 al escribir, 0 filas al leer). El botón "Sincronizar con la Nube"
// reintenta vía este relay con la service-role key del lado servidor
// (mismo patrón que api/backup/complete). Tras aplicar la migración, el
// camino directo del dispositivo vuelve a ser el primario y este relay
// queda como fallback resiliente.
//
// Blindaje: exige el header x-backup-secret (shared secret, comparación en
// tiempo constante) y CORS restringido a allowlist de orígenes.

export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

function cleanDeviceId(raw: unknown): string | null {
  const id = typeof raw === "string" ? raw.replace(/\s+/g, "").toUpperCase() : "";
  return id.length >= 8 && id.length <= 64 ? id : null;
}

// ── POST: subir/actualizar el backup de un dispositivo ──────────────────────
export async function POST(req: Request) {
  if (!verifyBackupSecret(req)) return unauthorized();

  const cors = corsHeadersFor(req.headers.get("origin"));

  try {
    const body = await req.json().catch(() => null);
    const deviceId = cleanDeviceId(body?.deviceId ?? req.headers.get("x-device-id"));
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId inválido" }, { status: 400, headers: cors });
    }
    if (!body?.backup_data || typeof body.backup_data !== "object") {
      return NextResponse.json({ error: "backup_data requerido" }, { status: 400, headers: cors });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("cloud_backups")
      .upsert(
        { device_id: deviceId, backup_data: body.backup_data, updated_at: new Date().toISOString() },
        { onConflict: "device_id" }
      );
    if (error) throw error;

    return NextResponse.json({ ok: true, deviceId }, { headers: cors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del relay";
    console.error("[API Backup Relay] POST:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}

// ── GET: leer el backup de un dispositivo (para restaurar) ──────────────────
export async function GET(req: Request) {
  if (!verifyBackupSecret(req)) return unauthorized();

  const cors = corsHeadersFor(req.headers.get("origin"));

  try {
    const url = new URL(req.url);
    const deviceId = cleanDeviceId(url.searchParams.get("deviceId") ?? req.headers.get("x-device-id"));
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId inválido" }, { status: 400, headers: cors });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("cloud_backups")
      .select("backup_data, updated_at")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json(
      { ok: true, deviceId, backup_data: data?.backup_data ?? null, updated_at: data?.updated_at ?? null },
      { headers: cors }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del relay";
    console.error("[API Backup Relay] GET:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
