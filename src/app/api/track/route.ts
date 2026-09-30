import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/track — beacon público de visitas. Sin sesión (el middleware lo
// deja pasar): registra a TODA persona que abre el link, incluso antes del
// login. Tolerant a que la tabla `visits` aún no exista: igual responde 200.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      referer?: string;
      screen?: string;
      lang?: string;
      tz?: string;
    };

    const fwd = req.headers.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0].trim() : null;
    const userAgent = req.headers.get("user-agent");
    const country = req.headers.get("x-vercel-ip-country");
    const rawCity = req.headers.get("x-vercel-ip-city");
    let city: string | null = null;
    if (rawCity) {
      try {
        city = decodeURIComponent(rawCity);
      } catch {
        city = rawCity;
      }
    }

    const admin = getSupabaseAdmin();
    await admin.from("visits").insert({
      path: body.path ?? null,
      ip,
      user_agent: userAgent,
      referer: body.referer ?? null,
      country,
      city,
      screen: body.screen ?? null,
      lang: body.lang ?? null,
      tz: body.tz ?? null,
    });
  } catch (e) {
    // Tabla inexistente, red caída, etc.: la visita no se registra pero el
    // beacon nunca debe romper la navegación.
    console.warn("[track] visita no registrada:", (e as Error)?.message);
  }
  return NextResponse.json({ ok: true });
}
