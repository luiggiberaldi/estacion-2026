"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  DollarSign,
  AlertCircle,
  Clock,
  MoreHorizontal,
  CheckCircle2,
  CalendarPlus,
  Ban,
  Inbox,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn, formatCurrency, formatDate } from "@/lib/utils";

import { getLicenses, createOrUpdateLicense, revokeLicense } from "@/lib/actions";
import { useProduct } from "@/lib/product-context";
import { useSettings } from "@/lib/settings-context";
import type { Subscription, SubscriptionStatus } from "@/lib/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  SubscriptionStatus,
  { label: string; className: string }
> = {
  current: { label: "Al día", className: "bg-success/15 text-success border-transparent" },
  grace_period: { label: "Período gracia", className: "bg-warning/15 text-warning border-transparent" },
  expired: { label: "Expirada", className: "bg-destructive/15 text-destructive border-transparent" },
  cancelled: { label: "Cancelada", className: "bg-secondary text-muted-foreground border-transparent" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function SubscriptionsView() {
  const { toast } = useToast();
  const { productId } = useProduct();
  const { terms } = useSettings();
  const { monthly: monthlyPrice, monthlyGraceDays } = terms(productId);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState<Subscription | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmPay, setConfirmPay] = useState<{ sub: Subscription; kind: "pay" | "extend" } | null>(null);
  const seqRef = useRef(0);

  const fetchSubscriptions = async (showLoading = true) => {
    const seq = ++seqRef.current;
    if (showLoading) setIsLoading(true);
    try {
      const licenses = await getLicenses(productId);
      if (seq !== seqRef.current) return;
      const monthlySubs = licenses
        .filter((l) => l.type === "monthly" && l.status !== "revoked")
        .map((l, i) => {
          // Sin vencimiento real en el backend: no fabricar fecha (+15d antes).
          // dueDate null se muestra como "—" en la tabla.
          const dueDate = l.expiresAt || null;
          // Gracia = ya venció pero la licencia sigue viva (la política le da
          // monthlyGraceDays de Ajustes). Antes se marcaba "gracia" a las que
          // aún NO vencían (faltaban <5 días), al revés.
          const status =
            l.status === "revoked"
              ? "cancelled"
              : l.status === "expired"
                ? "expired"
                : dueDate && new Date(dueDate).getTime() <= Date.now()
                  ? "grace_period"
                  : "current";
          return {
            id: `sub_${String(i + 1).padStart(3, "0")}`,
            deviceId: l.deviceId,
            alias: l.alias,
            clientName: l.clientName,
            clientPhone: l.clientPhone,
            status: status as Subscription["status"],
            amountUsd: monthlyPrice,
            startDate: l.createdAt,
            dueDate,
            gracePeriodEndsAt: status === "grace_period" && dueDate ? new Date(new Date(dueDate).getTime() + monthlyGraceDays * 86400000).toISOString() : null,
            notes: l.notes,
          };
        });
      setSubs(monthlySubs);
    } catch (err: any) {
      if (seq !== seqRef.current) return;
      toast({
        title: "Error al cargar suscripciones",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      if (seq === seqRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [productId, monthlyPrice, monthlyGraceDays]);

  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedSubs,
    goNext,
    goPrev,
    hasNext,
    hasPrev,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination(subs, 15);

  const stats = useMemo(() => {
    const active = subs.filter(
      (s) => s.status === "current" || s.status === "grace_period"
    );
    return {
      mrr: active.reduce((sum, s) => sum + s.amountUsd, 0),
      pending: subs.filter((s) => s.status === "expired").length,
      grace: subs.filter((s) => s.status === "grace_period").length,
    };
  }, [subs]);

  async function handleRegisterPayment(sub: Subscription) {
    setPendingId(sub.id);
    try {
      // Anclar al vencimiento actual (o a hoy si no hay vencimiento): un cliente
      // que paga tarde no pierde días y uno adelantado no acumula días extra.
      const base = Math.max(
        sub.dueDate ? new Date(sub.dueDate).getTime() : 0,
        Date.now()
      );
      const newDue = new Date(base + 30 * 86400000).toISOString();

      await createOrUpdateLicense({
        deviceId: sub.deviceId,
        type: "monthly",
        expiresAt: newDue,
        status: "active",
        productId,
      });

      toast({
        title: "Pago registrado",
        description: `${sub.alias ?? sub.deviceId} · ${formatCurrency(sub.amountUsd)} · vencimiento ${formatDate(newDue, { day: "2-digit", month: "short" })}`,
      });
      await fetchSubscriptions(false);
    } catch (err: any) {
      toast({
        title: "Error al registrar pago",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleExtend(sub: Subscription) {
    setPendingId(sub.id);
    try {
      // Extensión de cortesía desde el vencimiento actual (o hoy si no hay)
      const base = Math.max(
        sub.dueDate ? new Date(sub.dueDate).getTime() : 0,
        Date.now()
      );
      const newDue = new Date(base + 15 * 86400000).toISOString();

      await createOrUpdateLicense({
        deviceId: sub.deviceId,
        type: "monthly",
        expiresAt: newDue,
        status: "active",
        productId,
      });

      toast({
        title: "Vencimiento extendido",
        description: `${sub.alias ?? sub.deviceId} · +15 días`,
      });
      await fetchSubscriptions(false);
    } catch (err: any) {
      toast({
        title: "Error al extender vencimiento",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleCancel() {
    if (!confirmCancel) return;
    setIsLoading(true);
    try {
      await revokeLicense(confirmCancel.deviceId, productId);
      toast({
        title: "Suscripción cancelada",
        description: confirmCancel.alias ?? confirmCancel.deviceId,
        variant: "destructive",
      });
      await fetchSubscriptions(false);
    } catch (err: any) {
      toast({
        title: "Error al cancelar suscripción",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setConfirmCancel(null);
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Stats cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/60 shadow-tone-sm">
              <CardContent className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              icon={DollarSign}
              tone="bg-success/15 text-success"
              label="Ingreso mensual recurrente"
              value={formatCurrency(stats.mrr)}
            />
            <StatCard
              icon={AlertCircle}
              tone="bg-destructive/15 text-destructive"
              label="Pagos pendientes"
              value={String(stats.pending)}
            />
            <StatCard
              icon={Clock}
              tone="bg-warning/15 text-warning"
              label="En período de gracia"
              value={String(stats.grace)}
            />
          </>
        )}
      </section>

      {/* ── Tabla ── */}
      <Card className="border-border/60 shadow-tone-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 min-w-[160px]">Cliente</TableHead>
              <TableHead className="min-w-[140px]">Alias</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead className="min-w-[120px]">Próximo venc.</TableHead>
              <TableHead className="min-w-[110px]">Cliente desde</TableHead>
              <TableHead className="text-right pr-4">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j} className="py-3">
                      <Skeleton className="h-4 w-full max-w-[110px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : subs.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
                      <Inbox className="size-5" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No hay suscripciones registradas
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Las mensualidades aparecerán aquí cuando se activen.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedSubs.map((sub) => {
                const sm = STATUS_META[sub.status];
                const isCancelled = sub.status === "cancelled";
                const isPending = pendingId === sub.id;
                return (
                  <TableRow key={sub.id} className="group">
                    <TableCell className="pl-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {sub.clientName ?? "—"}
                        </span>
                        {sub.clientPhone && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {sub.clientPhone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {sub.alias ?? (
                        <span className="text-muted-foreground italic">Sin alias</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", sm.className)}>{sm.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground tabular-nums">
                      {formatCurrency(sub.amountUsd)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col">
                        <span className="text-foreground">
                          {sub.dueDate
                            ? formatDate(sub.dueDate, { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </span>
                        {sub.gracePeriodEndsAt && (
                          <span className="text-warning">
                            gracia hasta {formatDate(sub.gracePeriodEndsAt, { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(sub.startDate, { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {!isCancelled && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs opacity-70 group-hover:opacity-100"
                            onClick={() => setConfirmPay({ sub, kind: "pay" })}
                            disabled={isPending}
                          >
                            {isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            Registrar pago
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100"
                              aria-label="Más acciones"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            {!isCancelled && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setConfirmPay({ sub, kind: "pay" })}
                                >
                                  <CheckCircle2 className="size-4" /> Registrar pago
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setConfirmPay({ sub, kind: "extend" })}>
                                  <CalendarPlus className="size-4" /> Extender vencimiento
                                </DropdownMenuItem>
                              </>
                            )}
                            {sub.gracePeriodEndsAt && (
                              <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-warning">
                                Gracia hasta {formatDate(sub.gracePeriodEndsAt, { day: "2-digit", month: "short" })}
                              </div>
                            )}
                            {!isCancelled && <DropdownMenuSeparator />}
                            {!isCancelled && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirmCancel(sub)}
                              >
                                <Ban className="size-4" /> Cancelar suscripción
                              </DropdownMenuItem>
                            )}
                            {isCancelled && (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                Suscripción cancelada
                              </div>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-border/50">
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
            label="suscripciones"
          />
        </div>
      </Card>

      {/* ── Confirmación de pago / extensión ── */}
      <AlertDialog open={!!confirmPay} onOpenChange={(o) => !o && setConfirmPay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPay?.kind === "pay" ? "¿Registrar el pago?" : "¿Extender 15 días de cortesía?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPay?.kind === "pay"
                ? `Se sumarán 30 días al vencimiento de ${confirmPay?.sub.alias ?? confirmPay?.sub.deviceId} (${formatCurrency(confirmPay?.sub.amountUsd ?? 0)}). Hazlo solo con el pago ya recibido: no queda un registro de pagos aparte.`
                : `Se sumarán 15 días al vencimiento de ${confirmPay?.sub.alias ?? confirmPay?.sub.deviceId} sin cobrar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = confirmPay;
                setConfirmPay(null);
                if (!c) return;
                if (c.kind === "pay") handleRegisterPayment(c.sub);
                else handleExtend(c.sub);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirmación cancelar ── */}
      <AlertDialog
        open={!!confirmCancel}
        onOpenChange={(o) => !o && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              La suscripción de {confirmCancel?.alias ?? confirmCancel?.deviceId} se
              marcará como cancelada. El dispositivo perderá acceso al finalizar el
              período ya pagado. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conservar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Cancelar suscripción
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof DollarSign;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 shadow-tone-sm">
      <CardContent className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-lg shrink-0",
            tone
          )}
        >
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-display text-foreground leading-none mt-1 truncate">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
