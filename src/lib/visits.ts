"use server";

import { getSupabaseAdmin } from "./supabase";

export interface Visit {
  id: string;
  createdAt: string;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  screen: string | null;
  lang: string | null;
  tz: string | null;
}

function mapRow(r: any): Visit {
  return {
    id: r.id,
    createdAt: r.created_at,
    path: r.path ?? null,
    ip: r.ip ?? null,
    userAgent: r.user_agent ?? null,
    referer: r.referer ?? null,
    country: r.country ?? null,
    city: r.city ?? null,
    screen: r.screen ?? null,
    lang: r.lang ?? null,
    tz: r.tz ?? null,
  };
}

/** Últimas visitas, más recientes primero. [] si la tabla aún no existe. */
export async function getVisits(limit = 100): Promise<Visit[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("visits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data || []) as any[]).map(mapRow);
  } catch {
    return [];
  }
}

export interface VisitStats {
  today: number;
  total: number;
}

/** Ceros si la tabla aún no existe. "Hoy" en America/Caracas. */
export async function getVisitStats(): Promise<VisitStats> {
  const fallback = { today: 0, total: 0 };
  try {
    const admin = getSupabaseAdmin();
    const { count: total, error: totalErr } = await admin
      .from("visits")
      .select("id", { count: "exact", head: true });
    if (totalErr) return fallback;

    // Inicio del día actual en America/Caracas. Caracas es UTC-4 fijo
    // (sin horario de verano), así que se construye directo en ISO.
    const caracas = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Caracas" })
    );
    const ymd = `${caracas.getFullYear()}-${String(caracas.getMonth() + 1).padStart(2, "0")}-${String(caracas.getDate()).padStart(2, "0")}`;
    const startUtc = new Date(`${ymd}T00:00:00-04:00`).toISOString();

    const { count: today, error: todayErr } = await admin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startUtc);
    if (todayErr) return { today: 0, total: total ?? 0 };
    return { today: today ?? 0, total: total ?? 0 };
  } catch {
    return fallback;
  }
}
