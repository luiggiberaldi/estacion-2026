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
} from "./nube-model";
import { isNubeDeviceId, normalizeDeviceId } from "./nube-id";

export interface NubeOverview {
  configured: boolean;
  projectRef: string | null;
  accounts: NubeAccount[];
  loadedAt: string;
}

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const db = getNubeAdmin();
  const { data, error } = await db.from(table).select(columns).limit(10000);
  if (error) throw new Error(`Nube (${table}): ${error.message}`);
  return (data ?? []) as T[];
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

async function loadRaw(): Promise<NubeRawData> {
  const [accounts, licenses, sedes, members, devices, sessions, sales] = await Promise.all([
    selectAll<NubeRawData["accounts"][number]>("accounts", "id, name, owner_user_id, created_at"),
    selectAll<NubeRawData["licenses"][number]>("account_licenses", "account_id, status, max_cajas, max_sedes, expires_at, updated_at"),
    selectAll<NubeRawData["sedes"][number]>("sedes", "id, account_id, name, created_at, archived_at"),
    // Nunca se pide pin_hash ni contadores de intentos.
    selectAll<NubeRawData["members"][number]>("account_members", "id, account_id, display_name, role, active, locked_until, created_at"),
    selectAll<NubeRawData["devices"][number]>("account_devices", "id, account_id, sede_id, role, caja_letter, label, created_at, last_seen_at, revoked_at"),
    selectAll<NubeRawData["sessions"][number]>("member_sessions", "member_id, device_id, created_at, expires_at, ended_at"),
    selectAll<NubeRawData["sales"][number]>("sales", "account_id, device_id, server_at, status"),
  ]);
  const owners = await loadOwners(accounts.map((a) => a.owner_user_id));
  return { accounts, licenses, sedes, members, devices, sessions, sales, owners };
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
  const accounts = buildNubeAccounts(await loadRaw());
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
