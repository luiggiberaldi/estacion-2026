import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { corsHeadersFor, handleBackupOptions } from "../../_lib/backup-auth";
import { claimDeviceCredential } from "@/lib/device-claim-service";
import { getClaimDeps } from "@/lib/device-claim-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/backup/device-credential/claim { deviceId, code }
 *
 * Público (lo llama la caja, sin sesión de admin). Canjea un código de
 * vinculación de un solo uso, generado en la Estación, por la credencial de
 * respaldo del equipo. La credencial se entrega UNA vez; en la base solo queda
 * su hash. Freno de intentos por IP y por equipo. Ver device-claim-service.ts.
 */
export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

export async function POST(req: Request) {
  const cors = corsHeadersFor(req.headers.get("origin"));
  const h = await headers();
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const body = (await req.json().catch(() => null)) as { deviceId?: unknown; code?: unknown } | null;
  const result = await claimDeviceCredential(
    { deviceId: body?.deviceId, code: body?.code, ip },
    getClaimDeps()
  );

  const noStore = { "Cache-Control": "no-store", ...cors };
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: noStore });
  }
  return NextResponse.json(
    { ok: true, deviceId: result.deviceId, credential: result.credential },
    { headers: noStore }
  );
}
