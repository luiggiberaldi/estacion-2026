"use server";

import { getSupabaseAdmin } from "./supabase";
import { isDemoType } from "./utils";
import { AVAILABLE_PRODUCTS, type ProductId } from "./products";

export type NotificationType =
  | "demo_created"
  | "demo_expiring"
  | "demo_expired"
  | "backup_failed"
  | "device_new";

export interface AppNotification {
  id: string;
  createdAt: string;
  type: NotificationType;
  title: string;
  body: string | null;
  refId: string | null;
  productId: ProductId | null;
  readAt: string | null;
}

function mapRow(r: any): AppNotification {
  return {
    id: r.id,
    createdAt: r.created_at,
    type: r.type as NotificationType,
    title: r.title,
    body: r.body ?? null,
    refId: r.ref_id ?? null,
    productId: (r.product_id as ProductId | null) ?? null,
    readAt: r.read_at ?? null,
  };
}

/** Candidata a notificación: la condición se cumple; falta saber si es una transición nueva. */
interface PendingNotification {
  type: NotificationType;
  title: string;
  body: string | null;
  refId: string;
  productId: ProductId | null;
}

/**
 * Ciclo de reconciliación del barrido de eventos: como máximo una pasada cada
 * 5 minutos, sin importar cuántas veces se consulten las notificaciones.
 * (Constante interna a propósito: un módulo "use server" solo puede exportar
 * funciones async; los tipos sí valen porque se borran al compilar.)
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let lastSweepStartedAt = 0;
let sweepInFlight: Promise<void> | null = null;

/**
 * Crea una notificación puntual (evento de transición, p. ej. "demo creada").
 * Idempotente por (type, ref_id): si ya existe una con la misma clave, no
 * duplica. Tolerante a que la tabla aún no exista.
 */
export async function notify(
  type: NotificationType,
  title: string,
  body?: string | null,
  refId?: string | null,
  productId?: ProductId | null
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("notifications").upsert(
      {
        type,
        title,
        body: body ?? null,
        ref_id: refId ?? `${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        product_id: productId ?? null,
      },
      { onConflict: "type,ref_id", ignoreDuplicates: true }
    );
    if (error) throw error;
  } catch (e) {
    console.warn("[notifications] no se pudo crear:", (e as Error)?.message);
  }
}

/**
 * Reconciliación eventos → notificaciones, con tres propiedades selladas:
 *
 *  1. SOLO EN TRANSICIÓN: cada condición (demo por vencer, respaldo fallido,
 *     dispositivo nuevo…) emite la primera vez que se vuelve verdadera; su
 *     (type, ref_id) es la identidad de la transición. Si esa clave ya existe
 *     en la tabla, ni siquiera se envía la escritura. Una transición posterior
 *     (p. ej. vencida tras "por vencer") emite con su propia clave.
 *  2. BATCH ÚNICO: todas las filas nuevas van en UN solo upsert
 *     (on_conflict=type,ref_id + ignore-duplicates), no una request por fila.
 *  3. CICLO DE 5 MINUTOS: el barrido corre como mucho una vez cada
 *     SWEEP_INTERVAL_MS, aunque las vistas consulten cada minuto; las llamadas
 *     concurrentes comparten el barrido en curso. Sin cron: se dispara al
 *     inicio de getNotifications().
 *
 * Antes del fix cada visita re-upserteaba ~N filas activas (una request por
 * fila) aunque nada cambiara: ~94 requests/min sostenidos. Ahora el ciclo
 * completo cuesta ≤2 requests cada 5 minutos (1 SELECT de claves + 1 upsert).
 */
export async function ensureEventNotifications(): Promise<void> {
  if (sweepInFlight) return sweepInFlight;
  const now = Date.now();
  if (now - lastSweepStartedAt < SWEEP_INTERVAL_MS) return;
  lastSweepStartedAt = now;
  sweepInFlight = runEventNotificationSweep(now).finally(() => {
    sweepInFlight = null;
  });
  return sweepInFlight;
}

async function runEventNotificationSweep(now: number): Promise<void> {
  try {
    const pending = await collectPendingNotifications(now);
    if (pending.length === 0) return;

    const admin = getSupabaseAdmin();

    // 1. Claves (type, ref_id) ya emitidas: una sola lectura.
    const existing = new Set<string>();
    const types = [...new Set(pending.map((p) => p.type))];
    try {
      const { data } = await admin
        .from("notifications")
        .select("type, ref_id")
        .in("type", types);
      for (const row of (data || []) as Array<{ type: string; ref_id: string }>) {
        existing.add(`${row.type}\u0000${row.ref_id}`);
      }
    } catch {
      // Sin inventario se emite todo en el batch de abajo; ignore-duplicates
      // mantiene la idempotencia (es el comportamiento previo al fix).
    }

    // 2. Solo en transición: se escribe únicamente lo que aún no existe.
    const fresh = pending.filter((p) => !existing.has(`${p.type}\u0000${p.refId}`));
    if (fresh.length === 0) return;

    // 3. Batch único.
    const { error } = await admin.from("notifications").upsert(
      fresh.map((p) => ({
        type: p.type,
        title: p.title,
        body: p.body,
        ref_id: p.refId,
        product_id: p.productId,
      })),
      { onConflict: "type,ref_id", ignoreDuplicates: true }
    );
    if (error) throw error;
  } catch (e) {
    console.warn("[notifications] sweep falló:", (e as Error)?.message);
  }
}

/**
 * Recolecta las notificaciones que la evidencia actual exige, SIN escribir.
 * Reglas de dominio intactas:
 *  - demo por vencer: demo activa con vencimiento en las próximas 72 h.
 *  - demo vencida: demo expirada en los últimos 30 días.
 *  - respaldo fallido: uno por solicitud fallida reportada por el POS.
 *  - dispositivo nuevo: registrados en los últimos 7 días.
 */
async function collectPendingNotifications(now: number): Promise<PendingNotification[]> {
  const pending: PendingNotification[] = [];
  try {
    // Import dinámico: actions.ts importa notify() de este módulo; el import
    // estático crearía un ciclo.
    const { getLicenses, getFailedBackupRequests } = await import("./actions");
    const admin = getSupabaseAdmin();
    const in72h = now + 72 * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const products: ProductId[] = AVAILABLE_PRODUCTS.map((product) => product.id);
    for (const productId of products) {
      let licenses: any[] = [];
      try {
        licenses = await getLicenses(productId);
      } catch {
        continue;
      }
      for (const l of licenses) {
        if (!isDemoType(l.type) || !l.expiresAt) continue;
        const exp = new Date(l.expiresAt).getTime();
        const label = l.alias || l.deviceId;
        const daysLeft = Math.max(0, Math.ceil((exp - now) / 86_400_000));
        if (l.status === "active" && exp > now && exp <= in72h) {
          pending.push({
            type: "demo_expiring",
            title: `Demo por vencer · ${label}`,
            body: `La demo ${l.type} de ${l.deviceId} vence en ${daysLeft} día(s).`,
            refId: `demo_expiring:${l.id}`,
            productId,
          });
        } else if (l.status === "expired" && l.expiresAt >= thirtyDaysAgo) {
          pending.push({
            type: "demo_expired",
            title: `Demo vencida · ${label}`,
            body: `La demo ${l.type} de ${l.deviceId} venció.`,
            refId: `demo_expired:${l.id}`,
            productId,
          });
        }
      }
    }

    // Respaldos fallidos (los marca el propio POS en backup_requests).
    try {
      const failed = await getFailedBackupRequests();
      for (const f of failed) {
        const label = f.alias || f.deviceId;
        pending.push({
          type: "backup_failed",
          title: `Respaldo fallido · ${label}`,
          body: f.error || "El equipo reportó un fallo sin detalle.",
          refId: `backup_failed:${f.deviceId}:${f.createdAt}`,
          productId: null,
        });
      }
    } catch {
      /* tabla/columna aún inexistente: se ignora */
    }

    // Dispositivos nuevos (últimos 7 días).
    try {
      const { data: devices } = await admin
        .from("account_devices")
        .select("device_id, device_alias, created_at")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);
      for (const d of (devices || []) as any[]) {
        const label = d.device_alias || d.device_id;
        pending.push({
          type: "device_new",
          title: `Dispositivo nuevo · ${label}`,
          body: `Se registró el equipo ${d.device_id}.`,
          refId: `device_new:${d.device_id}`,
          productId: null,
        });
      }
    } catch {
      /* se ignora */
    }
  } catch (e) {
    console.warn("[notifications] sweep falló:", (e as Error)?.message);
  }
  return pending;
}

export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  await ensureEventNotifications();
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data || []) as any[]).map(mapRow);
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function markAllRead(): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
  } catch {
    /* tabla inexistente: nada que marcar */
  }
}

export async function markRead(id: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
  } catch {
    /* se ignora */
  }
}
