"use server";

import { getSupabaseAdmin } from "./supabase";
import type { License, Demo, Backup, Device, DashboardStats, LicenseType, LicenseStatus } from "./types";
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
function deriveStatus(is_active: boolean, expires_at: string | null): LicenseStatus {
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

// ─────────────────────────────────────────────────────────────────────────────
// LICENCIAS (CRUD sobre public.licenses y public.cloud_licenses)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLicenses(): Promise<License[]> {
  const admin = getSupabaseAdmin();

  // 1. Obtener datos de la tabla autoritativa de validación (licenses)
  const { data: dbLicenses, error: licErr } = await admin
    .from("licenses")
    .select("*")
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
    
    // Parse business_name if it contains ' | '
    const rawBusinessName = cl.business_name || '';
    const nameParts = rawBusinessName.split(' | ');
    const businessName = nameParts[0] || null;
    const marketingEmail = nameParts[1] || null;

    // Structured client code: CLI-YYYYMMDD-XXXX
    const dateStr = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'N/A';
    const last4 = l.device_id ? l.device_id.slice(-4).toUpperCase() : '0000';
    const structuredClientCode = `CLI-${dateStr}-${last4}`;

    return {
      id: l.id,
      deviceId: l.device_id,
      alias: businessName,
      clientName: structuredClientCode,
      clientPhone: cl.phone || null,
      marketingEmail: marketingEmail || null,
      type: l.type as LicenseType,
      status: deriveStatus(l.is_active, l.expires_at),
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

export async function getDemos(): Promise<Demo[]> {
  const licenses = await getLicenses();
  const now = new Date();
  return licenses
    .filter((l) => l.type === "demo7")
    .map((l) => {
      const expiresAt = l.expiresAt || new Date(now.getTime() + 7 * 86400000).toISOString();
      const diffTime = new Date(expiresAt).getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      return {
        id: l.id,
        deviceId: l.deviceId,
        alias: l.alias,
        clientName: l.clientName,
        clientPhone: l.clientPhone,
        activatedAt: l.activatedAt || l.createdAt,
        expiresAt,
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
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const deviceId = licenseData.deviceId.trim().toUpperCase();
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
    .eq("product_id", "bodega")
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
        product_id: "bodega",
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
    .select("id, email, business_name")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (fetchClErr) throw new Error(`Error al buscar metadatos de licencia: ${fetchClErr.message}`);

  let clErr;
  const email = licenseData.clientName 
    ? `${licenseData.clientName.toLowerCase().replace(/\s+/g, ".")}@example.com` 
    : (existingCl?.email || `${deviceId.toLowerCase()}@pda.local`);

  let businessNameField = licenseData.alias || null;
  if (existingCl?.business_name && existingCl.business_name.includes(' | ')) {
    const parts = existingCl.business_name.split(' | ');
    const oldEmail = parts[1];
    if (oldEmail && !businessNameField?.includes(' | ')) {
      businessNameField = `${licenseData.alias || parts[0]} | ${oldEmail}`;
    }
  }

  if (existingCl) {
    const { error } = await admin
      .from("cloud_licenses")
      .update({
        email: email,
        license_type: licenseData.type,
        business_name: businessNameField,
        phone: licenseData.clientPhone || null,
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
        phone: licenseData.clientPhone || null,
        is_active: isActive,
        updated_at: now
      });
    clErr = error;
  }

  if (clErr) throw new Error(`Error al guardar en cloud_licenses: ${clErr.message}`);
}

export async function revokeLicense(deviceId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error: licErr } = await admin
    .from("licenses")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId);

  if (licErr) throw new Error(`Error al revocar en licenses: ${licErr.message}`);

  const { error: clErr } = await admin
    .from("cloud_licenses")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId);

  if (clErr) throw new Error(`Error al revocar en cloud_licenses: ${clErr.message}`);
}

export async function deleteLicense(deviceId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error: licErr } = await admin
    .from("licenses")
    .delete()
    .eq("device_id", deviceId);

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

  // 1. Obtener metadata de respaldos (sin `backup_data`: ese JSON completo
  // solo se necesita al extraer un backup puntual, vía getBackupData()).
  const { data: dbBackups, error: bkpErr } = await admin
    .from("cloud_backups")
    .select("id, device_id, updated_at, size_bytes, product_count, sales_count, customer_count")
    .order("updated_at", { ascending: false });

  if (bkpErr) throw new Error(`Error al obtener respaldos: ${bkpErr.message}`);

  // 2. Obtener licencias para extraer alias y nombre de cliente
  const { data: dbCloudLicenses, error: clErr } = await admin
    .from("cloud_licenses")
    .select("device_id, business_name, email");

  if (clErr) throw new Error(`Error al obtener metadatos: ${clErr.message}`);

  const clMap = new Map(dbCloudLicenses?.map((cl: any) => [cl.device_id, cl]) || []);

  return (dbBackups || []).map((b: any) => {
    const cl = clMap.get(b.device_id) || {};

    // Parse business_name if it contains ' | '
    const rawBusinessName = cl.business_name || '';
    const nameParts = rawBusinessName.split(' | ');
    const businessName = nameParts[0] || null;
    const marketingEmail = nameParts[1] || null;

    // Structured client code
    const dateStr = cl.created_at ? new Date(cl.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'N/A';
    const last4 = b.device_id ? b.device_id.slice(-4).toUpperCase() : '0000';
    const structuredClientCode = `CLI-${dateStr}-${last4}`;

    return {
      id: b.id,
      deviceId: b.device_id,
      alias: businessName,
      clientName: structuredClientCode,
      marketingEmail: marketingEmail,
      sizeBytes: b.size_bytes || 0,
      createdAt: b.updated_at,
      status: "completed",
      productCount: b.product_count || 0,
      salesCount: b.sales_count || 0,
      customerCount: b.customer_count || 0,
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
    
    // Parse business_name if it contains ' | '
    const rawBusinessName = cl.business_name || '';
    const nameParts = rawBusinessName.split(' | ');
    const businessName = nameParts[0] || null;
    const marketingEmail = nameParts[1] || null;

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
      marketingEmail: marketingEmail,
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const licenses = await getLicenses();
  const backups = await getBackups();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000);

  const activeLicenses = licenses.filter(l => l.status === "active");

  const permanentCount = activeLicenses.filter(l => l.type === "permanent").length;
  const monthlyCount = activeLicenses.filter(l => l.type === "monthly").length;

  return {
    totalLicenses: licenses.length,
    permanent: permanentCount,
    demos: activeLicenses.filter(l => l.type === "demo7").length,
    monthly: monthlyCount,
    revoked: licenses.filter(l => l.status === "revoked").length,
    registered: licenses.filter(l => l.type === "registered").length,
    online: licenses.filter(l => l.isOnline).length,
    expiringIn7Days: activeLicenses.filter(
      (l) => l.expiresAt && new Date(l.expiresAt) > now && new Date(l.expiresAt) <= in7Days
    ).length,
    totalRevenue: permanentCount * 80 + monthlyCount * 15, // Estimado de ingresos
    monthlyRevenue: monthlyCount * 15,
    pendingPayments: licenses.filter(l => l.status === "expired" && l.type === "monthly").length,
    activeBackups: backups.length,
  };
}
