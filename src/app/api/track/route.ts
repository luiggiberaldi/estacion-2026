import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isBotUserAgent, isLocalIp } from "@/lib/utils";

// Freno ligero por instancia (sin base): como mucho 1 visita por IP+ruta cada
// 30 s y 30 por IP cada 10 min. Quien llene la tabla a propósito sigue
// acotado; una persona normal nunca lo nota.
const lastByKey = new Map<string, number>();
const hitsByIp = new Map<string, number[]>();
function tooFrequent(ip: string | null, path: string | null): boolean {
  const now = Date.now();
  const who = ip ?? "?";
  const key = `${who}|${path ?? ""}`;
  if (now - (lastByKey.get(key) ?? 0) < 30_000) return true;
  const recent = (hitsByIp.get(who) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 30) {
    hitsByIp.set(who, recent);
    return true;
  }
  recent.push(now);
  hitsByIp.set(who, recent);
  lastByKey.set(key, now);
  if (lastByKey.size > 5000) lastByKey.clear();
  if (hitsByIp.size > 5000) hitsByIp.clear();
  return false;
}

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

    // Endpoint público: se acotan los textos para que nadie llene la tabla.
    const clip = (v: unknown, max: number): string | null =>
      typeof v === "string" && v ? v.slice(0, max) : null;
    body.path = clip(body.path, 200) ?? undefined;
    body.referer = clip(body.referer, 300) ?? undefined;
    body.screen = clip(body.screen, 20) ?? undefined;
    body.lang = clip(body.lang, 20) ?? undefined;
    body.tz = clip(body.tz, 64) ?? undefined;

    const fwd = req.headers.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0].trim() : null;
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

    // No registrar: la propia máquina (desarrollo), bots conocidos ni ráfagas.
    if (isLocalIp(ip) || isBotUserAgent(userAgent) || tooFrequent(ip, body.path ?? null)) {
      return NextResponse.json({ ok: true });
    }
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
