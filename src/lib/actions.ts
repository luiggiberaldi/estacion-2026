"use server";

import { getSupabaseAdmin } from "./supabase";
import { PRODUCT_PRICES, type ProductId } from "./products";
import type { License, Demo, Backup, Device, DashboardStats, LicenseType, LicenseStatus } from "./types";
import { isDemoType } from "./utils";
import { unzipSync } from "node:zlib";

function decompressBackupData(backupData: any): any {
  if (backupData && backupData.compressed) {
    try {
      const buffer = Buffer.from(backupData.data, "base64");
      const decompressed = unzipSync(buffer).toString("utf-8");
      return JSON.parse(decompressed);
    } catch (e) {
      console.error("[actions] Failed to decompress backup_data:", e);
      return backupData;
    }
  }
  return backupData;
}

// Helper: Convierte is_active y expires_at al status del frontend
function deriveStatus(is_active: boolean, expires_at: string | null, type?: string): LicenseStatus {
  if (type === "registered") return "registered" as LicenseStatus;
  if (!is_active) return "revoked";
  if (expires_at) {
    const graceEnd = new Date(expires_at).getTime() + 5 * 24 * 60 * 60 * 1000;
    if (Date.now() > graceEnd) return "expired";
  }
  return "active";
}

// Helper: Determina si el dispositivo se considera "online" (visto hace menos de 5 min)
function deriveIsOnline(last_seen_at: string | null): boolean {
  if (!last_seen_at) return false;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return new Date(last_seen_at) > fiveMinutesAgo;
}

// Helper: Parsea 'business_name' que puede contener ' | ' para separar
// el nombre del negocio del email de marketing.
function parseBusinessName(raw: string | null | undefined): { businessName: string | null; marketingEmail: string | null } {
  if (!raw) return { businessName: null, marketingEmail: null };
  const sepIndex = raw.indexOf(" | ");
  if (sepIndex === -1) return { businessName: raw || null, marketingEmail: null };
  return {
    businessName: raw.slice(0, sepIndex) || null,
    marketingEmail: raw.slice(sepIndex + 3) || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LICENCIAS (CRUD sobre public.licenses y public.cloud_licenses)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLicenses(productId: ProductId = "bodega"): Promise<License[]> {
  const admin = getSupabaseAdmin();

  // 1. Obtener datos de la tabla autoritativa de validación (licenses), scoped por producto
  const { data: dbLicenses, error: licErr } = await admin
    .from("licenses")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (licErr) throw new Error(`Error al obtener licencias: ${licErr.message}`);

  // 2. Obtener datos de la tabla de metadatos administrativos (cloud_licenses)
  const { data: dbCloudLicenses, error: clErr } = await admin
    .from("cloud_licenses")
    .select("*");

  if (clErr) throw new Error(`Error al obtener metadatos de licencias: ${clErr.message}`);

  const cloudLicMap = new Map(dbCloudLicenses?.map((cl: any) => [cl.device_id, cl]) || []);

  // 3. Cruzar la información
  return (dbLicenses || []).map((l: any) => {
    const cl = cloudLicMap.get(l.device_id) || {};

    const { businessName, marketingEmail } = parseBusinessName(cl.business_name);

    // Structured client code: CLI-YYYYMMDD-XXXX
    const dateStr = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'N/A';
    const last4 = l.device_id ? l.device_id.slice(-4).toUpperCase() : '0000';
    const structuredClientCode = `CLI-${dateStr}-${last4}`;

    return {
      id: l.id,
      deviceId: l.device_id,
      productId: l.product_id ?? productId,
      alias: businessName,
      clientName: structuredClientCode,
      clientPhone: cl.phone || null,
      marketingEmail,
      type: l.type as LicenseType,
      status: deriveStatus(l.is_active, l.expires_at, l.type),
      code: l.code,
      createdAt: l.created_at,
      expiresAt: l.expires_at || null,
      lastSeenAt: l.updated_at || null, // fallback
      activatedAt: l.created_at || null,
      appVersion: "2.0.0", // fallback
      platform: "android", // fallback
      isOnline: deriveIsOnline(l.updated_at),
      notes: cl.notes || null,
    };
  });
}

export async function getDemos(productId: ProductId = "bodega"): Promise<Demo[]> {
  const licenses = await getLicenses(productId);
  const now = new Date();
  return licenses
    .filter((l) => isDemoType(l.type))
    .map((l) => {
      // Sin fecha de vencimiento real: no fabricar una. daysRemaining queda en 0
      // y la UI muestra "sin fecha".
      const daysRemaining = l.expiresAt
        ? Math.max(0, Math.ceil((new Date(l.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      return {
        id: l.id,
        deviceId: l.deviceId,
        type: l.type,
        alias: l.alias,
        clientName: l.clientName,
        clientPhone: l.clientPhone,
        activatedAt: l.activatedAt || l.createdAt,
        expiresAt: l.expiresAt || "",
        daysRemaining,
        isOnline: l.isOnline,
        appVersion: l.appVersion,
        platform: l.platform,
      };
    });
}

export async function createOrUpdateLicense(licenseData: {
  deviceId: string;
  type: LicenseType;
  expiresAt: string | null;
  alias?: string;
  clientName?: string;
  clientPhone?: string;
  notes?: string;
  status?: LicenseStatus;
  /** Producto comercial. Default 'bodega' (Lite) por compatibilidad. */
  productId?: ProductId;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const productId: ProductId = licenseData.productId ?? "bodega";
  const deviceId = licenseData.deviceId.replace(/\s+/g, '').toUpperCase();
  const now = new Date().toISOString();

  // Generar código autogenerado si no existe
  const last8 = deviceId.slice(-8).toUpperCase();
  const code = licenseData.type === "registered"
    ? "AUTO-REGISTRO"
    : `ACTIV-${last8.slice(0, 4)}-${last8.slice(4)}`;

  const isActive = licenseData.status ? (licenseData.status === "active") : (licenseData.type !== "revoked");

  // 1. Escribir en la tabla 'licenses' (para verificación de la app bodega)
  const { data: existingLic, error: fetchLicErr } = await admin
    .from("licenses")
    .select("id")
    .eq("device_id", deviceId)
    .eq("product_id", productId)
    .maybeSingle();

  if (fetchLicErr) throw new Error(`Error al buscar licencia existente: ${fetchLicErr.message}`);

  let licErr;
  if (existingLic) {
    const { error } = await admin
      .from("licenses")
      .update({
        type: licenseData.type,
        code: code,
        is_active: isActive,
        expires_at: licenseData.expiresAt,
        updated_at: now
      })
      .eq("id", existingLic.id);
    licErr = error;
  } else {
    const { error } = await admin
      .from("licenses")
      .insert({
        device_id: deviceId,
        product_id: productId,
        type: licenseData.type,
        code: code,
        is_active: isActive,
        expires_at: licenseData.expiresAt,
        updated_at: now
      });
    licErr = error;
  }

  if (licErr) throw new Error(`Error al guardar en licenses: ${licErr.message}`);

  // 2. Escribir en la tabla 'cloud_licenses' (para metadatos de Estación Maestra)
  const { data: existingCl, error: fetchClErr } = await admin
    .from("cloud_licenses")
    .select("id, email, business_name, phone")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (fetchClErr) throw new Error(`Error al buscar metadatos de licencia: ${fetchClErr.message}`);

  let clErr;

  // No fabricar emails (@example.com es inutilizable): conservar el existente
  // o usar el fallback local. El nombre del cliente se guarda en business_name.
  const email = existingCl?.email || `${deviceId.toLowerCase()}@pda.local`;

  // Conservar el teléfono existente si el form no envió uno nuevo.
  const phone = licenseData.clientPhone?.trim() || existingCl?.phone || null;

  // business_name guarda 'alias' y opcionalmente ' | email de marketing'.
  // No descartar jamás el email de marketing previo al actualizar el alias.
  const prevBusiness = existingCl?.business_name || null;
  const { marketingEmail: prevMarketingEmail } = parseBusinessName(prevBusiness);
  let businessNameField = licenseData.alias || (prevBusiness ? parseBusinessName(prevBusiness).businessName : null) || null;
  if (prevMarketingEmail && businessNameField && !businessNameField.includes(" | ")) {
    businessNameField = `${businessNameField} | ${prevMarketingEmail}`;
  }

  if (existingCl) {
    const { error } = await admin
      .from("cloud_licenses")
      .update({
        email: email,
        license_type: licenseData.type,
        business_name: businessNameField,
        phone: phone,
        is_active: isActive,
        updated_at: now
      })
      .eq("id", existingCl.id);
    clErr = error;
  } else {
    const { error } = await admin
      .from("cloud_licenses")
      .insert({
        device_id: deviceId,
        email: email,
        license_type: licenseData.type,
        business_name: businessNameField,
        phone: phone,
        is_active: isActive,
        updated_at: now
      });
    clErr = error;
  }

  if (clErr) throw new Error(`Error al guardar en cloud_licenses: ${clErr.message}`);
}

export async function revokeLicense(deviceId: string, productId: ProductId = "bodega"): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Scoped por producto para no tocar licencias de otros productos del mismo dispositivo
  const { error: licErr } = await admin
    .from("licenses")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId)
    .eq("product_id", productId);

  if (licErr) throw new Error(`Error al revocar en licenses: ${licErr.message}`);

  const { error: clErr } = await admin
    .from("cloud_licenses")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId);

  if (clErr) throw new Error(`Error al revocar en cloud_licenses: ${clErr.message}`);
}

export async function deleteLicense(deviceId: string, productId: ProductId = "bodega"): Promise<void> {
  const admin = getSupabaseAdmin();

  // Scoped por producto para no eliminar licencias de otros productos del mismo dispositivo
  const { error: licErr } = await admin
    .from("licenses")
    .delete()
    .eq("device_id", deviceId)
    .eq("product_id", productId);

  if (licErr) throw new Error(`Error al eliminar de licenses: ${licErr.message}`);

  const { error: clErr } = await admin
    .from("cloud_licenses")
    .delete()
    .eq("device_id", deviceId);

  if (clErr) throw new Error(`Error al eliminar de cloud_licenses: ${clErr.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPALDOS (Lectura de public.cloud_backups y envío de solicitudes)
// ─────────────────────────────────────────────────────────────────────────────

export async function getBackups(): Promise<Backup[]> {
  const admin = getSupabaseAdmin();

  // 1. Obtener metadata de respaldos. IMPORTANTE: no traer la columna completa
  // `backup_data` (puede contener el dump comprimido entero). Extraer solo los
  // campos de metadata via operadores JSON de PostgREST.
  const { data: dbBackups, error: bkpErr } = await admin
    .from("cloud_backups")
    .select(
      "id, device_id, updated_at, email, " +
      "backup_data->>drive_url, backup_data->>size_bytes, backup_data->>product_count, " +
      "backup_data->>sales_count, backup_data->>customer_count"
    )
    .order("updated_at", { ascending: false });

  if (bkpErr) throw new Error(`Error al obtener respaldos: ${bkpErr.message}`);

  // 2. Obtener licencias para extraer alias y nombre de cliente
  const { data: dbCloudLicenses, error: clErr } = await admin
    .from("cloud_licenses")
    .select("device_id, business_name, email, created_at");

  if (clErr) throw new Error(`Error al obtener metadatos: ${clErr.message}`);

  const clMap = new Map(dbCloudLicenses?.map((cl: any) => [cl.device_id, cl]) || []);

  return (dbBackups || []).map((b: any) => {
    const cl = clMap.get(b.device_id) || {};

    const { businessName, marketingEmail } = parseBusinessName(cl.business_name);

    // Structured client code
    const dateStr = cl.created_at ? new Date(cl.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'N/A';
    const last4 = b.device_id ? b.device_id.slice(-4).toUpperCase() : '0000';
    const structuredClientCode = `CLI-${dateStr}-${last4}`;

    return {
      id: b.id,
      deviceId: b.device_id,
      alias: businessName,
      clientName: structuredClientCode,
      marketingEmail: marketingEmail || b.email || null,
      driveUrl: b.drive_url || null,
      sizeBytes: Number(b.size_bytes || 0),
      createdAt: b.updated_at,
      status: "completed",
      productCount: Number(b.product_count || 0),
      salesCount: Number(b.sales_count || 0),
      customerCount: Number(b.customer_count || 0),
      shareCode: null,
    };
  });
}

export async function getBackupData(backupId: string): Promise<any> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("cloud_backups")
    .select("backup_data")
    .eq("id", backupId)
    .single();

  if (error) throw new Error(`Error al obtener datos del backup: ${error.message}`);
  return decompressBackupData(data?.backup_data || null);
}

export async function requestBackup(deviceId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const cleanId = deviceId.trim().toUpperCase();
  const now = new Date().toISOString();

  // Limpiar solicitud previa del mismo dispositivo si existe
  await admin.from("backup_requests").delete().eq("device_id", cleanId);

  const { error } = await admin.from("backup_requests").insert({
    device_id: cleanId,
    status: "pending",
    created_at: now,
    completed_at: null,
  });

  if (error) throw new Error(`Error al solicitar respaldo: ${error.message}`);
}

export async function requestAllBackups(): Promise<number> {
  const licenses = await getLicenses();
  const paidLicenses = licenses.filter(
    (l) => l.status === "active" && (l.type === "permanent" || l.type === "monthly")
  );
  if (!paidLicenses.length) return 0;

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const deviceIds = paidLicenses.map((l) => l.deviceId);

  // Limpiar solicitudes previas de estas cuentas
  await admin.from("backup_requests").delete().in("device_id", deviceIds);

  const payload = paidLicenses.map((l) => ({
    device_id: l.deviceId,
    status: "pending",
    created_at: now,
    completed_at: null,
  }));

  const { error } = await admin.from("backup_requests").insert(payload);

  if (error) throw new Error(`Error al solicitar respaldos masivos: ${error.message}`);
  return paidLicenses.length;
}

export async function getPendingBackupRequests(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("backup_requests")
    .select("device_id")
    .eq("status", "pending");

  if (error) return [];
  return (data || []).map((r: any) => r.device_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO REMOTO DE RECARGA (tabla supervisor_commands, mecanismo autorizado del POS)
// ─────────────────────────────────────────────────────────────────────────────

const RELOAD_COMMAND_TTL_MS = 5 * 60 * 1000; // el POS ignora comandos expirados

/**
 * Inserta un comando `force_reload` en `public.supervisor_commands`, la tabla
 * RLS autorizada que la app POS escucha (ver useRemoteCommands.js del POS).
 * El broadcast por canal `system_commands` fue retirado del POS y sus
 * guardrails lo prohíben explícitamente.
 */
export async function sendRemoteReloadCommand(deviceId?: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RELOAD_COMMAND_TTL_MS);

  // Resolver los dispositivos destino
  let targetIds: string[];
  if (deviceId) {
    targetIds = [deviceId.replace(/\s+/g, "").toUpperCase()];
  } else {
    const licenses = await getLicenses();
    targetIds = licenses
      .filter((l) => l.status === "active" && (l.type === "permanent" || l.type === "monthly"))
      .map((l) => l.deviceId);
  }

  if (!targetIds.length) return 0;

  const payload = targetIds.map((targetDeviceId) => ({
    command_id: `force_reload_${targetDeviceId}_${now.getTime()}`,
    target_device_id: targetDeviceId,
    command_type: "force_reload",
    status: "pending",
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    payload: { requestedBy: "estacion-maestra" },
    schema_version: 1,
  }));

  const { error } = await admin.from("supervisor_commands").insert(payload);
  if (error) throw new Error(`Error al insertar comandos de recarga: ${error.message}`);
  return targetIds.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPOSITIVOS REGISTRADOS (Lectura de public.account_devices)
// ─────────────────────────────────────────────────────────────────────────────

export async function getDevices(): Promise<Device[]> {
  const admin = getSupabaseAdmin();

  const { data: dbDevices, error: devErr } = await admin
    .from("account_devices")
    .select("*")
    .order("created_at", { ascending: false });

  if (devErr) throw new Error(`Error al obtener dispositivos: ${devErr.message}`);

  // Obtener licencias para cruzar el nombre de cliente
  const { data: dbCloudLicenses, error: clErr } = await admin
    .from("cloud_licenses")
    .select("device_id, phone, business_name, created_at");

  if (clErr) throw new Error(`Error al obtener metadatos: ${clErr.message}`);

  const clMap = new Map(dbCloudLicenses?.map((cl: any) => [cl.device_id, cl]) || []);

  return (dbDevices || []).map((d: any) => {
    const cl = clMap.get(d.device_id) || {};

    const { businessName, marketingEmail } = parseBusinessName(cl.business_name);

    // Structured client code
    const dateStr = cl.created_at ? new Date(cl.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'N/A';
    const last4 = d.device_id ? d.device_id.slice(-4).toUpperCase() : '0000';
    const structuredClientCode = `CLI-${dateStr}-${last4}`;

    return {
      id: d.id,
      deviceId: d.device_id,
      alias: d.device_alias || null,
      clientName: structuredClientCode,
      clientPhone: cl.phone || null,
      email: d.email || null,
      marketingEmail,
      platform: "android",
      appVersion: "2.0.0",
      registeredAt: d.created_at,
      lastSeenAt: d.last_seen || null,
      isOnline: deriveIsOnline(d.last_seen),
      businessName: businessName || null,
      rif: null,
    };
  });
}

export async function updateDeviceAlias(deviceId: string, alias: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("account_devices")
    .update({ device_alias: alias })
    .eq("device_id", deviceId);

  if (error) throw new Error(`Error al actualizar alias: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS DEL DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardStats(
  licenses?: License[],
  backups?: Backup[],
  productId: ProductId = "bodega"
): Promise<DashboardStats> {
  // Permite reutilizar datos ya cargados por getDashboardData() sin refetch
  if (!licenses || !backups) {
    licenses = await getLicenses(productId);
    backups = await getBackups();
  }

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000);

  const activeLicenses = licenses.filter(l => l.status === "active");

  const permanentCount = activeLicenses.filter(l => l.type === "permanent").length;
  const monthlyCount = activeLicenses.filter(l => l.type === "monthly").length;

  return {
    totalLicenses: licenses.length,
    permanent: permanentCount,
    demos: activeLicenses.filter(l => isDemoType(l.type)).length,
    monthly: monthlyCount,
    revoked: licenses.filter(l => l.status === "revoked").length,
    registered: licenses.filter(l => l.type === "registered").length,
    online: licenses.filter(l => l.isOnline).length,
    expiringIn7Days: activeLicenses.filter(
      (l) => l.expiresAt && new Date(l.expiresAt) > now && new Date(l.expiresAt) <= in7Days
    ).length,
    totalRevenue: permanentCount * PRODUCT_PRICES[productId].permanent + monthlyCount * PRODUCT_PRICES[productId].monthly, // Estimado de ingresos según precios del producto
    monthlyRevenue: monthlyCount * PRODUCT_PRICES[productId].monthly,
    pendingPayments: licenses.filter(l => l.status === "expired" && l.type === "monthly").length,
    activeBackups: backups.length,
  };
}

/**
 * Carga los datos del dashboard en el mínimo número de round-trips.
 * El dashboard necesita licencias y stats; getDashboardStats() reutiliza
 * las licencias aquí obtenidas en vez de volver a consultarlas.
 */
export async function getDashboardData(productId: ProductId = "bodega"): Promise<{ stats: DashboardStats; licenses: License[] }> {
  const [licenses, backups] = await Promise.all([getLicenses(productId), getBackups()]);
  const stats = await getDashboardStats(licenses, backups, productId);
  return { stats, licenses };
}
