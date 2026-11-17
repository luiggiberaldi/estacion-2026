"use server";

import { getSupabaseAdmin } from "./supabase";
import { requireAdmin } from "./require-admin";
import { selectAllPaged } from "./db-paging";

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

/** Código de Postgres/PostgREST de "la tabla aún no existe". */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));
}

// IPs de la propia máquina (desarrollo local): no son visitas reales y no se cuentan.
// Excluye las visitas locales pero conserva las de IP desconocida (NULL): con
// `.not("ip","in",…)` SQL descartaba también las NULL.
const NOT_LOCAL = 'ip.is.null,ip.not.in.("::1","127.0.0.1","::ffff:127.0.0.1")';

export interface VisitsPage {
  visits: Visit[];
  hasMore: boolean;
}

/**
 * Visitas, más recientes primero, por páginas. Sin las de la propia máquina.
 * { visits: [], hasMore: false } si la tabla aún no existe; ante cualquier otro
 * error lanza (antes devolvía lista vacía y parecía "sin visitas").
 */
export async function getVisits(limit = 50, offset = 0): Promise<VisitsPage> {
  await requireAdmin();
  const size = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
  const from = Math.max(Math.trunc(Number(offset)) || 0, 0);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("visits")
    .select("*")
    .or(NOT_LOCAL)
    .order("created_at", { ascending: false })
    .range(from, from + size); // size+1 filas para saber si hay más
  if (error) {
    if (isMissingTable(error)) return { visits: [], hasMore: false };
    throw new Error(`Error al obtener visitas: ${error.message}`);
  }
  const rows = ((data || []) as any[]).map(mapRow);
  return { visits: rows.slice(0, size), hasMore: rows.length > size };
}

export interface VisitStats {
  today: number;
  last7Days: number;
  uniqueToday: number;
  total: number;
  /** Países más frecuentes en los últimos 7 días. */
  topCountries: Array<{ country: string; count: number }>;
}

const EMPTY_STATS: VisitStats = { today: 0, last7Days: 0, uniqueToday: 0, total: 0, topCountries: [] };

/** Inicio del día actual en America/Caracas (UTC-4 fijo, sin horario de verano), en ISO. */
function caracasDayStart(daysBack = 0): string {
  const caracas = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }));
  caracas.setDate(caracas.getDate() - daysBack);
  const ymd = `${caracas.getFullYear()}-${String(caracas.getMonth() + 1).padStart(2, "0")}-${String(caracas.getDate()).padStart(2, "0")}`;
  return new Date(`${ymd}T00:00:00-04:00`).toISOString();
}

/** Cifras de visitas reales ("hoy" y "7 días" en America/Caracas). Ceros si la tabla no existe. */
export async function getVisitStats(): Promise<VisitStats> {
  await requireAdmin();
  const admin = getSupabaseAdmin();

  const totalQ = await admin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .or(NOT_LOCAL);
  if (totalQ.error) {
    if (isMissingTable(totalQ.error)) return EMPTY_STATS;
    throw new Error(`Error al contar visitas: ${totalQ.error.message}`);
  }

  // Últimos 7 días (incluye hoy): una sola lectura acotada, el resto se agrupa aquí.
  const weekStart = caracasDayStart(6);
  const todayStart = caracasDayStart(0);
  // Paginado: .limit(5000) no servía, PostgREST corta en 1000 filas y las
  // cifras de la semana se quedaban en 1000 sin avisar.
  const rows = await selectAllPaged<{ ip: string | null; country: string | null; created_at: string }>(
    () =>
      admin
        .from("visits")
        .select("id, ip, country, created_at")
        .or(NOT_LOCAL)
        .gte("created_at", weekStart)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    "Error al leer visitas recientes"
  );
  const today = rows.filter((r) => r.created_at >= todayStart);
  const countries = new Map<string, number>();
  for (const r of rows) {
    const c = r.country || "Desconocido";
    countries.set(c, (countries.get(c) ?? 0) + 1);
  }
  return {
    today: today.length,
    last7Days: rows.length,
    uniqueToday: new Set(today.map((r) => r.ip ?? "?")).size,
    total: totalQ.count ?? 0,
    topCountries: [...countries.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
