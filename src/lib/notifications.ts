"use server";

import { getSupabaseAdmin } from "./supabase";
import { isDemoType } from "./utils";
import type { ProductId } from "./products";

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

/**
 * Crea una notificación. Idempotente por (type, ref_id): si ya existe una con
 * la misma clave, no duplica. Tolerant a que la tabla aún no exista.
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
 * Barrido idempotente de eventos → notificaciones. Se ejecuta al inicio de
 * getNotifications(), así no hace falta cron: los eventos aparecen la primera
 * vez que luigi abre el centro de notificaciones (o la campana).
 */
export async function ensureEventNotifications(): Promise<void> {
  try {
    // Import dinámico: actions.ts importa notify() de este módulo; el import
    // estático crearía un ciclo.
    const { getLicenses, getFailedBackupRequests } = await import("./actions");
    const admin = getSupabaseAdmin();
    const now = Date.now();
    const in72h = now + 72 * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const products: ProductId[] = ["bodega", "pro"];
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
          await notify(
            "demo_expiring",
            `Demo por vencer · ${label}`,
            `La demo ${l.type} de ${l.deviceId} vence en ${daysLeft} día(s).`,
            `demo_expiring:${l.id}`,
            productId
          );
        } else if (l.status === "expired" && l.expiresAt >= thirtyDaysAgo) {
          await notify(
            "demo_expired",
            `Demo vencida · ${label}`,
            `La demo ${l.type} de ${l.deviceId} venció.`,
            `demo_expired:${l.id}`,
            productId
          );
        }
      }
    }

    // Respaldos fallidos (los marca el propio POS en backup_requests).
    try {
      const failed = await getFailedBackupRequests();
      for (const f of failed) {
        const label = f.alias || f.deviceId;
        await notify(
          "backup_failed",
          `Respaldo fallido · ${label}`,
          f.error || "El equipo reportó un fallo sin detalle.",
          `backup_failed:${f.deviceId}:${f.createdAt}`
        );
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
        await notify(
          "device_new",
          `Dispositivo nuevo · ${label}`,
          `Se registró el equipo ${d.device_id}.`,
          `device_new:${d.device_id}`
        );
      }
    } catch {
      /* se ignora */
    }
  } catch (e) {
    console.warn("[notifications] sweep falló:", (e as Error)?.message);
  }
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
