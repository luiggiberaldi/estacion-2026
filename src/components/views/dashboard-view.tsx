"use client";

import { useState, useEffect } from "react";
import {
  KeyRound,
  Clock,
  DollarSign,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DatabaseBackup,
  Ban,
  BadgeDollarSign,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatRelative } from "@/lib/utils";
import { getDashboardStats, getLicenses } from "@/lib/actions";
import type { ActivityLog, Demo } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_ICON: Record<string, LucideIcon> = {
  LICENSE_GENERATED: KeyRound,
  LICENSE_REVOKED: Ban,
  DEMO_ACTIVATED: Clock,
  DEMO_EXTENDED: Sparkles,
  BACKUP_EXTRACTED: DatabaseBackup,
  SUBSCRIPTION_PAYMENT_REGISTERED: BadgeDollarSign,
};

const ACTION_TONE: Record<string, string> = {
  LICENSE_GENERATED: "bg-success/15 text-success",
  LICENSE_REVOKED: "bg-destructive/15 text-destructive",
  DEMO_ACTIVATED: "bg-primary/15 text-primary",
  DEMO_EXTENDED: "bg-accent/15 text-accent",
  BACKUP_EXTRACTED: "bg-secondary text-secondary-foreground",
  SUBSCRIPTION_PAYMENT_REGISTERED: "bg-warning/15 text-warning",
};

function useReveal() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);
  return visible;
}

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { value: string; up: boolean };
  tone: string;
  delay: number;
  visible: boolean;
}

function KpiCard({ icon: Icon, label, value, trend, tone, delay, visible }: KpiCardProps) {
  return (
    <div
      className={cn(
        "reveal",
        visible && "is-visible"
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <Card className="overflow-hidden border-border/60 shadow-tone-sm hover:shadow-tone-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                tone
              )}
            >
              <Icon className="size-5" strokeWidth={2} />
            </div>
            {trend && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-0.5 border-transparent font-medium",
                  trend.up
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {trend.up ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {trend.value}
              </Badge>
            )}
          </div>
          <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide pt-1">
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-display tracking-tight text-foreground leading-none">
            {value}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardView() {
  const visible = useReveal();
  const [stats, setStats] = useState<any>({
    totalLicenses: 0,
    demos: 0,
    monthlyRevenue: 0,
    pendingPayments: 0,
    online: 0,
    permanent: 0,
    activeBackups: 0,
    totalRevenue: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [demos, setDemos] = useState<Demo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setError(null);
        const [statsData, licenses] = await Promise.all([
          getDashboardStats(),
          getLicenses()
        ]);
        setStats(statsData);
        // Derivar demos
        const activeDemos = licenses
          .filter((l) => l.type === "demo7" && l.status !== "revoked")
          .map((l) => {
            const expiresAt = l.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
            );
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
        setDemos(activeDemos);

        // Generar historial dinámico combinando licencias
        const dynamicActivity: ActivityLog[] = licenses.slice(0, 5).map((l, i) => {
          let action = "LICENSE_GENERATED";
          let desc = `Licencia ${l.type} configurada para ${l.alias || l.deviceId}`;
          if (l.status === "revoked") {
            action = "LICENSE_REVOKED";
            desc = `Licencia revocada para ${l.alias || l.deviceId}`;
          } else if (l.type === "demo7") {
            action = "DEMO_ACTIVATED";
            const durationDays = l.expiresAt && l.createdAt
              ? Math.round((new Date(l.expiresAt).getTime() - new Date(l.createdAt).getTime()) / 86400000)
              : 3;
            desc = `Demo de ${durationDays} días activa para ${l.alias || l.deviceId}`;
          }
          return {
            id: `act_${i}`,
            action,
            description: desc,
            adminEmail: "admin@preciosaldia.com",
            targetDeviceId: l.deviceId,
            targetAlias: l.alias,
            timestamp: l.lastSeenAt || l.createdAt,
            metadata: null
          };
        });
        setActivity(dynamicActivity);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setError("Error de conexión: No se pudo establecer la conexión con la base de datos.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const expiringDemos = demos
    .filter((d) => d.daysRemaining < 7)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/15 border-l-4 border-destructive p-4 rounded-r-xl text-sm text-destructive flex items-center gap-2 animate-in fade-in duration-300">
          <AlertCircle className="size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {/* ── KPI grid ── */}
      <section
        aria-label="Indicadores clave"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60 shadow-tone-sm">
              <CardHeader className="pb-2">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-3 w-24 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              icon={KeyRound}
              label="Total licencias"
              value={String(stats.totalLicenses)}
              trend={{ value: "+2", up: true }}
              tone="bg-primary/15 text-primary"
              delay={0}
              visible={visible}
            />
            <KpiCard
              icon={Clock}
              label="Demos activas"
              value={String(stats.demos)}
              trend={{ value: "+1", up: true }}
              tone="bg-accent/15 text-accent"
              delay={80}
              visible={visible}
            />
            <KpiCard
              icon={DollarSign}
              label="Ingresos mensuales"
              value={formatCurrency(stats.monthlyRevenue)}
              trend={{ value: "+12%", up: true }}
              tone="bg-success/15 text-success"
              delay={160}
              visible={visible}
            />
            <KpiCard
              icon={AlertCircle}
              label="Pagos pendientes"
              value={String(stats.pendingPayments)}
              trend={{ value: "+1", up: false }}
              tone="bg-warning/15 text-warning"
              delay={240}
              visible={visible}
            />
          </>
        )}
      </section>

      {/* ── Dos columnas: actividad + demos por expirar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Actividad reciente */}
        <Card className="lg:col-span-3 border-border/60 shadow-tone-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="size-4 text-primary" strokeWidth={2} />
                Actividad reciente
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                Últimas {activity.length || "—"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-9 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Sin actividad reciente"
                description="Las acciones del administrador aparecerán aquí."
              />
            ) : (
              <ul className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto">
                {activity.map((entry) => {
                  const Icon = ACTION_ICON[entry.action] ?? Activity;
                  const tone = ACTION_TONE[entry.action] ?? "bg-secondary text-secondary-foreground";
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 px-6 py-3.5 hover:bg-secondary/40 transition-colors"
                    >
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full",
                          tone
                        )}
                      >
                        <Icon className="size-4" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(entry.timestamp)}
                          </span>
                          <span className="text-xs text-muted-foreground/60">·</span>
                          <span className="text-xs text-muted-foreground/80 font-mono truncate">
                            {entry.targetAlias ?? entry.targetDeviceId}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Demos por expirar */}
        <Card className="lg:col-span-2 border-border/60 shadow-tone-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4 text-warning" strokeWidth={2} />
                Demos por expirar
              </CardTitle>
              <Badge className="bg-warning/15 text-warning border-transparent">
                {expiringDemos.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : expiringDemos.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Todo bajo control"
                description="No hay demos próximas a expirar."
              />
            ) : (
              <ul className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto">
                {expiringDemos.map((demo) => {
                  const isCritical = demo.daysRemaining <= 2;
                  const isWarning = demo.daysRemaining > 2 && demo.daysRemaining <= 4;
                  return (
                    <li
                      key={demo.id}
                      className="px-6 py-3.5 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {demo.alias ?? demo.deviceId}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {demo.clientName ?? "Sin cliente"}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "border-transparent shrink-0",
                            isCritical && "bg-destructive text-white",
                            isWarning && "bg-warning text-warning-foreground",
                            !isCritical && !isWarning && "bg-success/15 text-success"
                          )}
                        >
                          {demo.daysRemaining === 0
                            ? "Expira hoy"
                            : `${demo.daysRemaining}d`}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Mini-resumen inferior ── */}
      {!isLoading && (
        <Card className="border-border/60 shadow-tone-sm bg-gradient-to-br from-card to-secondary/30">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Resumen del periodo
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.online} dispositivos en línea ·{" "}
                  {stats.permanent} permanentes ·{" "}
                  {stats.activeBackups} backups activos
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Ingreso histórico total
              </p>
              <p className="text-xl font-display text-foreground">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state reutilizable
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
        <Icon className="size-5" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
    </div>
  );
}
