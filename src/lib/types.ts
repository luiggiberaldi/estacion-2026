// Tipos del dominio de gestión de licencias para Precios al Día Bodega.

export type LicenseType = "permanent" | "demo7" | "monthly" | "revoked" | "registered";
export type LicenseStatus = "active" | "expired" | "revoked" | "pending";
export type DevicePlatform = "android" | "ios" | "pwa" | "desktop";
export type BackupStatus = "completed" | "failed" | "in_progress";
export type SubscriptionStatus = "current" | "expired" | "grace_period" | "cancelled";
export type PaymentMethod = "pago_movil" | "transferencia" | "zelle" | "efectivo_usd" | "binance";

/** Licencia de un dispositivo. */
export interface License {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  marketingEmail?: string | null;
  type: LicenseType;
  status: LicenseStatus;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  activatedAt: string | null;
  appVersion: string | null;
  platform: DevicePlatform;
  isOnline: boolean;
  notes: string | null;
}

/** Demo activo (derivado de licenses con type=demo7). */
export interface Demo {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  marketingEmail?: string | null;
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
  isOnline: boolean;
  appVersion: string | null;
  platform: DevicePlatform;
}

/** Backup de un dispositivo (cloud_backups). */
export interface Backup {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  marketingEmail?: string | null;
  sizeBytes: number;
  createdAt: string;
  status: BackupStatus;
  productCount: number;
  salesCount: number;
  customerCount: number;
  shareCode: string | null;
}

/** Mensualidad / suscripción recurrente. */
export interface Subscription {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  status: SubscriptionStatus;
  amountUsd: number;
  paymentMethod: PaymentMethod;
  startDate: string;
  dueDate: string;
  lastPaymentDate: string | null;
  monthsPaid: number;
  gracePeriodEndsAt: string | null;
  notes: string | null;
}

/** Dispositivo registrado (account_devices). */
export interface Device {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  email: string | null;
  marketingEmail?: string | null;
  platform: DevicePlatform;
  appVersion: string | null;
  registeredAt: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  businessName: string | null;
  rif: string | null;
}

/** Estadísticas para el dashboard. */
export interface DashboardStats {
  totalLicenses: number;
  permanent: number;
  demos: number;
  monthly: number;
  revoked: number;
  registered: number;
  online: number;
  expiringIn7Days: number;
  totalRevenue: number;
  monthlyRevenue: number;
  pendingPayments: number;
  activeBackups: number;
}

/** Entrada del historial de actividad del admin. */
export interface ActivityLog {
  id: string;
  action: string;
  description: string;
  adminEmail: string;
  targetDeviceId: string | null;
  targetAlias: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

/** Respuesta paginada estándar. */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
