import { NextResponse } from "next/server";
import { requireSessionEmail } from "@/lib/auth-actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateDeviceCredential, hashDeviceCredential } from "@/lib/device-credential";
import { DEVICE_CREDENTIALS_TABLE } from "@/lib/device-credential-store";
import { normalizeDeviceId } from "@/lib/backup-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * POST { deviceId } -> emite una credencial nueva para el dispositivo (solo admin).
 * El secreto se devuelve UNA vez; en base solo se guarda su hash. Rotar reemplaza el hash.
 */
export async function POST(req: Request) {
  if (!(await requireSessionEmail())) return fail(401, "No autorizado");

  const body = (await req.json().catch(() => null)) as { deviceId?: unknown } | null;
  const deviceId = typeof body?.deviceId === "string" ? normalizeDeviceId(body.deviceId) : null;
  if (!deviceId) return fail(400, "deviceId inválido");

  const secret = generateDeviceCredential();
  const { error } = await getSupabaseAdmin()
    .from(DEVICE_CREDENTIALS_TABLE)
    .upsert(
      { device_id: deviceId, secret_hash: hashDeviceCredential(secret), revoked_at: null, rotated_at: new Date().toISOString() },
      { onConflict: "device_id" }
    );
  if (error) return fail(503, "No se pudo emitir la credencial (¿migración 004 aplicada?)");

  return NextResponse.json({ ok: true, deviceId, credential: secret }, { headers: NO_STORE });
}
