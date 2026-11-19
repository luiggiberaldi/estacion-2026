// Tipos del dominio de gestión de licencias para Precios al Día Bodega.

export type LicenseType = "permanent" | "demo7" | "demo3" | "monthly" | "revoked" | "registered";
export type LicenseStatus = "active" | "expired" | "revoked" | "pending";
export type BackupStatus = "completed" | "failed" | "in_progress";
export type SubscriptionStatus = "current" | "expired" | "grace_period" | "cancelled";

/** Licencia de un dispositivo. */
export interface License {
  id: string;
  deviceId: string;
  /** Discriminador comercial: 'bodega' (Lite) | 'farmacia' (Farmacia) | 'pro' (Pro). */
  productId: string;
  alias: string | null;
  /** Nombre real del cliente (cloud_licenses.client_name). Null = no registrado. */
  clientName: string | null;
  /** Referencia derivada CLI-AAAAMMDD-XXXX (fecha de alta + final del ID). No es un nombre. */
  clientCode: string;
  clientPhone: string | null;
  marketingEmail?: string | null;
  type: LicenseType;
  status: LicenseStatus;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  activatedAt: string | null;
  isOnline: boolean;
  notes: string | null;
}

/** Demo (derivado de licenses con type=demo7|demo3). */
export interface Demo {
  id: string;
  deviceId: string;
  type: LicenseType;
  /** Estado real: una demo revocada (is_active=false) llega como "revoked". */
  status: LicenseStatus;
  alias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  marketingEmail?: string | null;
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
  isOnline: boolean;
}

/** Backup de un dispositivo (cloud_backups). */
export interface Backup {
  id: string;
  deviceId: string;
  alias: string | null;
  clientName: string | null;
  marketingEmail?: string | null;
  driveUrl: string | null;
  sizeBytes: number;
  createdAt: string;
  status: BackupStatus;
  productCount: number;
  salesCount: number;
  customerCount: number;
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
  startDate: string;
  /** null = el backend no registra fecha de vencimiento (no se fabrica una). */
  dueDate: string | null;
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
  registeredAt: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  businessName: string | null;
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
