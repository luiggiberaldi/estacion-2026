"use server";

// Acciones de la Estación sobre Precios al Día Nube (Supabase de la nube).
// Cada acción exige sesión de la Estación (requireAdmin) antes de tocar la base:
// usan la llave service_role de la nube.

import { requireAdmin } from "./require-admin";
import { getNubeAdmin, nubeConfigured, nubeProjectRef } from "./nube-supabase";
import {
  buildNubeAccounts,
  validateNubeLicenseInput,
  type NubeAccount,
  type NubeDevice,
  type NubeRawData,
  type RawOwner,
  type RawSalesStat,
  type RawSession,
} from "./nube-model";
import { selectAllPaged, selectInBatches, type RangeQuery } from "./db-paging";
import { isNubeDeviceId, normalizeDeviceId } from "./nube-id";

export interface NubeOverview {
  configured: boolean;
  projectRef: string | null;
  accounts: NubeAccount[];
  loadedAt: string;
}

/** Filtro opcional: una sola cuenta (columna que la identifica en cada tabla). */
type AccountScope = { column: string; accountId: string } | null;

/**
 * Lee una tabla entera de la Nube, paginada (PostgREST corta en 1000 filas y
 * `.limit(10000)` no lo evitaba). `orderBy` debe ser la clave primaria para que
 * las páginas no repitan ni salten filas.
 */
async function selectAll<T>(table: string, columns: string, orderBy: string, scope: AccountScope = null): Promise<T[]> {
  const db = getNubeAdmin();
  return selectAllPaged<T>(() => {
    let q = db.from(table).select(columns);
    if (scope) q = q.eq(scope.column, scope.accountId);
    return q.order(orderBy, { ascending: true }) as unknown as RangeQuery<T>;
  }, `Nube (${table})`);
}

/** Ventas por equipo agregadas en la base (sin anuladas). */
async function loadSalesStats(accountId: string | null): Promise<RawSalesStat[]> {
  const db = getNubeAdmin();
  try {
    return await selectAllPaged<RawSalesStat>(
      () =>
        db
          .rpc("estacion_device_sales_stats", { p_account_id: accountId })
          .order("device_id", { ascending: true }) as unknown as RangeQuery<RawSalesStat>,
      "Nube (ventas)"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/estacion_device_sales_stats|PGRST202|schema cache/i.test(msg)) {
      throw new Error("Falta la migración de estadísticas en la Nube (estacion_device_sales_stats).");
    }
    throw e;
  }
}

async function loadOwners(ids: string[]): Promise<RawOwner[]> {
  if (ids.length === 0) return [];
  const db = getNubeAdmin();
  const wanted = new Set(ids);
  const out: RawOwner[] = [];
  // Los equipos también son usuarios (anónimos): se pagina hasta encontrar a los dueños.
  for (let page = 1; page <= 20 && out.length < wanted.size; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Nube (usuarios): ${error.message}`);
    for (const u of data.users) {
      if (wanted.has(u.id)) {
        out.push({
          id: u.id,
          email: u.email ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** Sesiones de PIN abiertas (las únicas que usa el modelo), de los equipos dados o de todos. */
async function loadOpenSessions(deviceIds: string[] | null): Promise<RawSession[]> {
  const db = getNubeAdmin();
  const cols = "member_id, device_id, created_at, expires_at, ended_at"; // nunca el token
  const nowIso = new Date().toISOString();
  const open = () => db.from("member_sessions").select(cols).is("ended_at", null).gt("expires_at", nowIso);
  if (deviceIds === null) {
    return selectAllPaged<RawSession>(
      () => open().order("token", { ascending: true }) as unknown as RangeQuery<RawSession>,
      "Nube (member_sessions)"
    );
  }
  return selectInBatches<RawSession>(
    deviceIds,
    (batch) => open().in("device_id", batch).order("token", { ascending: true }) as unknown as RangeQuery<RawSession>,
    "Nube (member_sessions)"
  );
}

/** Carga los datos de la Nube; con `accountId`, solo los de esa cuenta. */
async function loadRaw(accountId: string | null = null): Promise<NubeRawData> {
  const byId: AccountScope = accountId ? { column: "id", accountId } : null;
  const byAccount: AccountScope = accountId ? { column: "account_id", accountId } : null;
  const [accounts, licenses, sedes, members, devices, salesStats] = await Promise.all([
    selectAll<NubeRawData["accounts"][number]>("accounts", "id, name, owner_user_id, created_at", "id", byId),
    selectAll<NubeRawData["licenses"][number]>("account_licenses", "account_id, status, max_cajas, max_sedes, expires_at, updated_at", "account_id", byAccount),
    selectAll<NubeRawData["sedes"][number]>("sedes", "id, account_id, name, created_at, archived_at", "id", byAccount),
    // Nunca se pide pin_hash ni contadores de intentos.
    selectAll<NubeRawData["members"][number]>("account_members", "id, account_id, display_name, role, active, locked_until, created_at", "id", byAccount),
    selectAll<NubeRawData["devices"][number]>("account_devices", "id, account_id, sede_id, role, caja_letter, label, created_at, last_seen_at, revoked_at", "id", byAccount),
    loadSalesStats(accountId),
  ]);
  const [sessions, owners] = await Promise.all([
    loadOpenSessions(accountId ? devices.map((d) => d.id) : null),
    loadOwners(accounts.map((a) => a.owner_user_id)),
  ]);
  return { accounts, licenses, sedes, members, devices, sessions, salesStats, owners };
}

export async function getNubeOverview(): Promise<NubeOverview> {
  await requireAdmin();
  const loadedAt = new Date().toISOString();
  if (!nubeConfigured()) {
    return { configured: false, projectRef: null, accounts: [], loadedAt };
  }
  const raw = await loadRaw();
  return { configured: true, projectRef: nubeProjectRef(), accounts: buildNubeAccounts(raw), loadedAt };
}

/** Busca un equipo de la Nube por su ID `PDN-…` y devuelve su cuenta. */
export async function findNubeDevice(rawId: string): Promise<{ device: NubeDevice; account: NubeAccount } | null> {
  await requireAdmin();
  const id = normalizeDeviceId(rawId);
  if (!isNubeDeviceId(id)) throw new Error("No es un ID de la Nube (PDN- y 32 caracteres).");
  const db = getNubeAdmin();
  const { data, error } = await db.from("account_devices").select("account_id").eq("id", id).maybeSingle();
  if (error) throw new Error(`Nube: ${error.message}`);
  if (!data) return null;
  // Solo la cuenta del equipo, no toda la Nube.
  const accounts = buildNubeAccounts(await loadRaw(data.account_id));
  const account = accounts.find((a) => a.id === data.account_id);
  const device = account?.devices.find((d) => d.id === id);
  return account && device ? { device, account } : null;
}

/** Cambia la licencia de una cuenta (estado, cajas, sedes, vencimiento). */
export async function updateNubeLicense(accountId: string, input: unknown): Promise<void> {
  await requireAdmin();
  if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId)) {
    throw new Error("Cuenta inválida.");
  }
  const lic = validateNubeLicenseInput(input);
  const db = getNubeAdmin();
  const row = {
    account_id: accountId,
    status: lic.status,
    max_cajas: lic.maxCajas,
    max_sedes: lic.maxSedes,
    expires_at: lic.expiresAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("account_licenses").upsert(row, { onConflict: "account_id" });
  if (error) throw new Error(`Nube: ${error.message}`);
}
