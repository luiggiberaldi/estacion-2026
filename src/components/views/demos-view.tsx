"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  CalendarClock,
  CalendarPlus,
  Infinity as InfinityIcon,
  Ban,
  Smartphone,
  Globe,
  MonitorSmartphone,
  Inbox,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate, formatRelative } from "@/lib/utils";

import { getDemos, createOrUpdateLicense, revokeLicense } from "@/lib/actions";
import type { Demo, DevicePlatform } from "@/lib/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "active" | "expiring" | "expired";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Activas" },
  { key: "expiring", label: "Por expirar" },
  { key: "expired", label: "Expiradas" },
];

const PLATFORM_ICON: Record<DevicePlatform, typeof Smartphone> = {
  android: Smartphone,
  pwa: Globe,
  ios: Smartphone,
  desktop: MonitorSmartphone,
};

function progressTone(days: number): string {
  if (days > 4) return "[&>[data-slot=progress-indicator]]:bg-success";
  if (days >= 2) return "[&>[data-slot=progress-indicator]]:bg-warning";
  return "[&>[data-slot=progress-indicator]]:bg-destructive";
}

function urgencyBadge(days: number): { label: string; className: string } {
  if (days <= 0)
    return { label: "Expirada", className: "bg-destructive/15 text-destructive border-transparent" };
  if (days <= 2)
    return { label: `${days}d restantes`, className: "bg-destructive/15 text-destructive border-transparent" };
  if (days <= 4)
    return { label: `${days}d restantes`, className: "bg-warning/15 text-warning border-transparent" };
  return { label: `${days}d restantes`, className: "bg-success/15 text-success border-transparent" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function DemosView() {
  const { toast } = useToast();
  const [demos, setDemos] = useState<Demo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmRevoke, setConfirmRevoke] = useState<Demo | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchDemos = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getDemos();
      setDemos(data);
    } catch (err: any) {
      toast({
        title: "Error al cargar demos",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDemos();
  }, []);

  const filtered = useMemo(() => {
    return demos
      .filter((d) => {
        if (filter === "all") return true;
        if (filter === "active") return d.daysRemaining > 0;
        if (filter === "expiring") return d.daysRemaining > 0 && d.daysRemaining <= 3;
        if (filter === "expired") return d.daysRemaining <= 0;
        return true;
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [demos, filter]);

  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedDemos,
    goNext,
    goPrev,
    resetPage,
    hasNext,
    hasPrev,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination(filtered, 15);

  useEffect(() => {
    resetPage();
  }, [filter]);

  const counts = useMemo(
    () => ({
      all: demos.length,
      active: demos.filter((d) => d.daysRemaining > 0).length,
      expiring: demos.filter((d) => d.daysRemaining > 0 && d.daysRemaining <= 3).length,
      expired: demos.filter((d) => d.daysRemaining <= 0).length,
    }),
    [demos]
  );

  async function handleExtend(demo: Demo) {
    setPendingId(demo.id);
    try {
      const newExpiresAt = new Date(
        new Date(demo.expiresAt).getTime() + 3 * 86400000
      ).toISOString();

      await createOrUpdateLicense({
        deviceId: demo.deviceId,
        type: "demo7",
        expiresAt: newExpiresAt,
        status: "active",
      });

      toast({
        title: "Demo extendida",
        description: `${demo.alias ?? demo.deviceId} · +3 días`,
      });
      await fetchDemos(false);
    } catch (err: any) {
      toast({
        title: "Error al extender demo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleConvert(demo: Demo) {
    setPendingId(demo.id);
    try {
      await createOrUpdateLicense({
        deviceId: demo.deviceId,
        type: "permanent",
        expiresAt: null,
        status: "active",
      });

      toast({
        title: "Convertida a permanente",
        description: demo.alias ?? demo.deviceId,
      });
      await fetchDemos(false);
    } catch (err: any) {
      toast({
        title: "Error al convertir demo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleRevoke() {
    if (!confirmRevoke) return;
    setPendingId(confirmRevoke.id);
    try {
      await revokeLicense(confirmRevoke.deviceId);
      toast({
        title: "Demo revocada",
        description: confirmRevoke.alias ?? confirmRevoke.deviceId,
        variant: "destructive",
      });
      await fetchDemos(false);
    } catch (err: any) {
      toast({
        title: "Error al revocar demo",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setConfirmRevoke(null);
      setPendingId(null);
    }
  }


  return (
    <div className="space-y-5">
      {/* Filtros */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="gap-1.5">
              {f.label}
              <Badge
                variant="secondary"
                className="h-4 min-w-4 px-1 justify-center text-[10px] tabular-nums"
              >
                {counts[f.key]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Grid de cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border/60 shadow-tone-sm">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-full" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="size-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60 shadow-tone-sm">
          <CardContent className="flex flex-col items-center text-center py-16">
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
              <Inbox className="size-5" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">
              No hay demos en esta categoría
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Cuando actives nuevas demos desde la vista de licencias, aparecerán aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedDemos.map((demo) => {
            const PlatformIcon = PLATFORM_ICON[demo.platform];
            const pct = Math.max(0, Math.min(100, (demo.daysRemaining / 7) * 100));
            const ub = urgencyBadge(demo.daysRemaining);
            const isExpired = demo.daysRemaining <= 0;
            const isPending = pendingId === demo.id;
            return (
              <Card
                key={demo.id}
                className="border-border/60 shadow-tone-sm hover:shadow-tone-md transition-shadow"
              >
                <CardContent className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {demo.alias ?? "Sin alias"}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {demo.clientName ?? "Sin cliente"}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                        {demo.deviceId}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0", ub.className)}>{ub.label}</Badge>
                  </div>

                  {/* Barra de progreso */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Tiempo restante</span>
                      <span className="tabular-nums">{Math.round(pct)}%</span>
                    </div>
                    <Progress
                      value={pct}
                      className={cn("h-2", progressTone(demo.daysRemaining))}
                    />
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="size-3.5 shrink-0" />
                      <span className="truncate">
                        Expira {formatDate(demo.expiresAt, { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground sm:justify-end">
                      <Clock className="size-3.5 shrink-0" />
                      <span className="truncate">Activada {formatRelative(demo.activatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <PlatformIcon className="size-3" />
                    <span className="uppercase">{demo.platform}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>v{demo.appVersion ?? "—"}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="flex items-center gap-1">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          demo.isOnline ? "bg-success" : "bg-muted-foreground/40"
                        )}
                      />
                      {demo.isOnline ? "En línea" : "Desconectado"}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/60">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleExtend(demo)}
                      disabled={isPending || isExpired}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CalendarPlus className="size-3.5" />
                      )}
                      Extender 7d
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleConvert(demo)}
                      disabled={isPending}
                    >
                      <InfinityIcon className="size-3.5" />
                      Permanente
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmRevoke(demo)}
                      aria-label="Revocar demo"
                    >
                      <Ban className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        startIndex={startIndex}
        endIndex={endIndex}
        onNext={goNext}
        onPrev={goPrev}
        hasNext={hasNext}
        hasPrev={hasPrev}
        label="demos"
      />

      {/* Confirmación revocar */}
      <AlertDialog
        open={!!confirmRevoke}
        onOpenChange={(o) => !o && setConfirmRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar esta demo?</AlertDialogTitle>
            <AlertDialogDescription>
              El dispositivo {confirmRevoke?.alias ?? confirmRevoke?.deviceId} perderá
              acceso inmediatamente. El cliente deberá adquirir una licencia permanente o
              mensual para seguir usando el POS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Revocar demo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
