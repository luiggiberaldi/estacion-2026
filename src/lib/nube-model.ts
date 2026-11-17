// Modelo de Precios al Día Nube visto desde la Estación.
//
// Arma, a partir de las filas crudas del Supabase de la nube, una ficha por
// cuenta: dueño, licencia, sedes, empleados y equipos conectados. Puro (sin
// Supabase) para poder probarlo.
//
// «Conectado»: la app Nube todavía no llama a `touch_device`, así que
// `last_seen_at` solo se mueve cuando alguien entra con su PIN. Por eso un equipo
// cuenta como conectado si tiene una sesión de PIN abierta (sin cerrar y sin
// vencer) o si se vio en los últimos minutos.

export type NubeLicenseStatus = "trial" | "active" | "suspended";
export type NubeLicenseState = "prueba" | "activa" | "suspendida" | "vencida" | "sin_licencia";

export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export interface RawAccount { id: string; name: string; owner_user_id: string; created_at: string }
export interface RawLicense {
  account_id: string;
  status: NubeLicenseStatus;
  max_cajas: number;
  max_sedes: number;
  expires_at: string | null;
  updated_at: string;
}
export interface RawSede { id: string; account_id: string; name: string; created_at: string; archived_at: string | null }
export interface RawMember {
  id: string;
  account_id: string;
  display_name: string;
  role: "dueno" | "administrador" | "cajero";
  active: boolean;
  locked_until: string | null;
  created_at: string;
}
export interface RawDevice {
  id: string;
  account_id: string;
  sede_id: string | null;
  role: "caja" | "consulta";
  caja_letter: string | null;
  label: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}
export interface RawSession { member_id: string; device_id: string; created_at: string; expires_at: string; ended_at: string | null }
/**
 * Ventas por equipo, ya agregadas en la base por la RPC
 * `estacion_device_sales_stats` (sin anuladas). Antes se bajaban todas las filas
 * de `sales` y PostgREST las cortaba en 1000: los conteos quedaban mal.
 */
export interface RawSalesStat { device_id: string; sales_count: number | string; last_sale_at: string | null }
export interface RawOwner { id: string; email: string | null; email_confirmed_at: string | null; last_sign_in_at: string | null }

export interface NubeDevice {
  id: string;
  accountId: string;
  accountName: string;
  label: string;
  role: "caja" | "consulta";
  cajaLetter: string | null;
  sedeName: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** Empleados con sesión de PIN abierta ahora mismo en este equipo. */
  openSessions: string[];
  isOnline: boolean;
  salesCount: number;
  lastSaleAt: string | null;
}

export interface NubeMember {
  id: string;
  name: string;
  role: "dueno" | "administrador" | "cajero";
  active: boolean;
  locked: boolean;
  createdAt: string;
}

export interface NubeAccount {
  id: string;
  name: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerConfirmed: boolean;
  ownerLastSignInAt: string | null;
  license: {
    status: NubeLicenseStatus | null;
    state: NubeLicenseState;
    maxCajas: number;
    maxSedes: number;
    expiresAt: string | null;
    updatedAt: string | null;
  };
  sedes: { id: string; name: string; archived: boolean }[];
  members: NubeMember[];
  devices: NubeDevice[];
  cajasEnUso: number;
  equiposConectados: number;
  salesCount: number;
  lastSaleAt: string | null;
}

export function nubeLicenseState(
  lic: Pick<RawLicense, "status" | "expires_at"> | null | undefined,
  now: number = Date.now()
): NubeLicenseState {
  if (!lic) return "sin_licencia";
  if (lic.status === "suspended") return "suspendida";
  if (lic.expires_at && new Date(lic.expires_at).getTime() < now) return "vencida";
  return lic.status === "trial" ? "prueba" : "activa";
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export interface NubeRawData {
  accounts: RawAccount[];
  licenses: RawLicense[];
  sedes: RawSede[];
  members: RawMember[];
  devices: RawDevice[];
  sessions: RawSession[];
  salesStats: RawSalesStat[];
  owners: RawOwner[];
}

export function buildNubeAccounts(raw: NubeRawData, now: number = Date.now()): NubeAccount[] {
  const memberName = new Map(raw.members.map((m) => [m.id, m.display_name]));
  const sedeName = new Map(raw.sedes.map((s) => [s.id, s.name]));
  const owners = new Map(raw.owners.map((o) => [o.id, o]));
  const licenses = new Map(raw.licenses.map((l) => [l.account_id, l]));

  const openByDevice = new Map<string, string[]>();
  for (const s of raw.sessions) {
    if (s.ended_at || new Date(s.expires_at).getTime() <= now) continue;
    const list = openByDevice.get(s.device_id) ?? [];
    const name = memberName.get(s.member_id) ?? "—";
    if (!list.includes(name)) list.push(name);
    openByDevice.set(s.device_id, list);
  }

  const salesByDevice = new Map<string, { count: number; last: string | null }>();
  for (const s of raw.salesStats) {
    // count(*) llega como texto desde PostgREST (bigint).
    salesByDevice.set(s.device_id, { count: Number(s.sales_count) || 0, last: s.last_sale_at ?? null });
  }

  return raw.accounts
    .map((a): NubeAccount => {
      const lic = licenses.get(a.id);
      const owner = owners.get(a.owner_user_id);
      const devices = raw.devices
        .filter((d) => d.account_id === a.id)
        .map((d): NubeDevice => {
          const open = d.revoked_at ? [] : openByDevice.get(d.id) ?? [];
          const seenRecently = !!d.last_seen_at && now - new Date(d.last_seen_at).getTime() < ONLINE_WINDOW_MS;
          const sales = salesByDevice.get(d.id);
          return {
            id: d.id,
            accountId: a.id,
            accountName: a.name,
            label: d.label,
            role: d.role,
            cajaLetter: d.caja_letter,
            sedeName: d.sede_id ? sedeName.get(d.sede_id) ?? null : null,
            createdAt: d.created_at,
            lastSeenAt: d.last_seen_at,
            revokedAt: d.revoked_at,
            openSessions: open,
            isOnline: !d.revoked_at && (open.length > 0 || seenRecently),
            salesCount: sales?.count ?? 0,
            lastSaleAt: sales?.last ?? null,
          };
        })
        // Activos primero; dentro, cajas por letra y luego consultas.
        .sort((x, y) => {
          if (!!x.revokedAt !== !!y.revokedAt) return x.revokedAt ? 1 : -1;
          if (x.role !== y.role) return x.role === "caja" ? -1 : 1;
          return (x.cajaLetter ?? x.label).localeCompare(y.cajaLetter ?? y.label);
        });

      const roleOrder = { dueno: 0, administrador: 1, cajero: 2 } as const;
      const members = raw.members
        .filter((m) => m.account_id === a.id)
        .map((m): NubeMember => ({
          id: m.id,
          name: m.display_name,
          role: m.role,
          active: m.active,
          locked: !!m.locked_until && new Date(m.locked_until).getTime() > now,
          createdAt: m.created_at,
        }))
        .sort((x, y) => roleOrder[x.role] - roleOrder[y.role] || x.name.localeCompare(y.name));

      return {
        id: a.id,
        name: a.name,
        createdAt: a.created_at,
        ownerEmail: owner?.email ?? null,
        ownerConfirmed: !!owner?.email_confirmed_at,
        ownerLastSignInAt: owner?.last_sign_in_at ?? null,
        license: {
          status: lic?.status ?? null,
          state: nubeLicenseState(lic, now),
          maxCajas: lic?.max_cajas ?? 0,
          maxSedes: lic?.max_sedes ?? 0,
          expiresAt: lic?.expires_at ?? null,
          updatedAt: lic?.updated_at ?? null,
        },
        sedes: raw.sedes
          .filter((s) => s.account_id === a.id)
          .map((s) => ({ id: s.id, name: s.name, archived: !!s.archived_at })),
        members,
        devices,
        cajasEnUso: devices.filter((d) => d.role === "caja" && !d.revokedAt).length,
        equiposConectados: devices.filter((d) => d.isOnline).length,
        salesCount: devices.reduce((n, d) => n + d.salesCount, 0),
        lastSaleAt: devices.reduce<string | null>((m, d) => maxIso(m, d.lastSaleAt), null),
      };
    })
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

export interface NubeLicenseInput {
  status: NubeLicenseStatus;
  maxCajas: number;
  maxSedes: number;
  /** ISO o null (sin vencimiento). */
  expiresAt: string | null;
}

/** Valida lo que llega del navegador antes de escribir `account_licenses`. */
export function validateNubeLicenseInput(input: unknown): NubeLicenseInput {
  const v = (input ?? {}) as Record<string, unknown>;
  if (v.status !== "trial" && v.status !== "active" && v.status !== "suspended") {
    throw new Error("Estado de licencia inválido.");
  }
  const cajas = Number(v.maxCajas);
  const sedes = Number(v.maxSedes);
  if (!Number.isInteger(cajas) || cajas < 0 || cajas > 100) throw new Error("Cajas: entre 0 y 100.");
  if (!Number.isInteger(sedes) || sedes < 1 || sedes > 50) throw new Error("Sedes: entre 1 y 50.");
  let expiresAt: string | null = null;
  if (v.expiresAt !== null && v.expiresAt !== undefined && v.expiresAt !== "") {
    const t = new Date(String(v.expiresAt));
    if (Number.isNaN(t.getTime())) throw new Error("Fecha de vencimiento inválida.");
    expiresAt = t.toISOString();
  }
  return { status: v.status, maxCajas: cajas, maxSedes: sedes, expiresAt };
}
