"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Smartphone,
  Globe,
  MonitorSmartphone,
  MoreHorizontal,
  Eye,
  Tag,
  KeyRound,
  Inbox,
  Loader2,
  Mail,
  Phone,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelative, formatDate } from "@/lib/utils";
import { getDevices, updateDeviceAlias } from "@/lib/actions";
import type { Device, DevicePlatform } from "@/lib/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<
  DevicePlatform,
  { label: string; icon: typeof Smartphone; className: string }
> = {
  android: { label: "Android", icon: Smartphone, className: "bg-success/15 text-success border-transparent" },
  pwa: { label: "PWA", icon: Globe, className: "bg-primary/15 text-primary border-transparent" },
  ios: { label: "iOS", icon: Smartphone, className: "bg-secondary text-secondary-foreground border-transparent" },
  desktop: { label: "Desktop", icon: MonitorSmartphone, className: "bg-secondary text-secondary-foreground border-transparent" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function DevicesView() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detail, setDetail] = useState<Device | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Device | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  const fetchDevices = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err: any) {
      toast({
        title: "Error al cargar dispositivos",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedDevices,
    goNext,
    goPrev,
    hasNext,
    hasPrev,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination(devices, 15);

  const counts = useMemo(
    () => ({
      total: devices.length,
      online: devices.filter((d) => d.isOnline).length,
    }),
    [devices]
  );

  function openAliasDialog(d: Device) {
    setAliasTarget(d);
    setAliasValue(d.alias ?? "");
  }

  async function handleSaveAlias() {
    if (!aliasTarget) return;
    setSavingAlias(true);
    try {
      await updateDeviceAlias(aliasTarget.deviceId, aliasValue.trim());
      toast({
        title: "Alias asignado",
        description: `${aliasTarget.deviceId} → ${aliasValue.trim() || "sin alias"}`,
      });
      setAliasTarget(null);
      await fetchDevices(false);
    } catch (err: any) {
      toast({
        title: "Error al asignar alias",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setSavingAlias(false);
    }
  }

  function handleGenerateLicense(d: Device) {
    toast({
      title: "Licencia generada",
      description: `Dispositivo ${d.alias ?? d.deviceId} listo para activación.`,
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Mini stats inline ── */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1.5">
            <Smartphone className="size-3" />
            {counts.total} dispositivos
          </Badge>
          <Badge className="gap-1.5 bg-success/15 text-success border-transparent">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            {counts.online} en línea
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {counts.total - counts.online} desconectados
          </Badge>
        </div>
      )}

      {/* ── Tabla ── */}
      <Card className="border-border/60 shadow-tone-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 min-w-[140px]">Dispositivo</TableHead>
              <TableHead className="min-w-[140px]">Alias</TableHead>
              <TableHead className="min-w-[150px]">Negocio</TableHead>
              <TableHead>Plataforma</TableHead>
              <TableHead>Versión</TableHead>
              <TableHead className="min-w-[110px]">Registrado</TableHead>
              <TableHead className="min-w-[120px]">Última conexión</TableHead>
              <TableHead className="text-center">Online</TableHead>
              <TableHead className="text-right pr-4">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j} className="py-3">
                      <Skeleton className="h-4 w-full max-w-[100px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : devices.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-12">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
                      <Inbox className="size-5" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No hay dispositivos registrados
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Los dispositivos aparecerán aquí al registrarse en la app.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedDevices.map((d) => {
                const pm = PLATFORM_META[d.platform];
                const PmIcon = pm.icon;
                return (
                  <TableRow key={d.id} className="group">
                    <TableCell className="pl-4 font-mono text-xs text-foreground">
                      {d.deviceId}
                      
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {d.alias ?? (
                        <span className="text-muted-foreground italic">Sin alias</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.businessName ?? "—"}
                      {d.rif && (
                        <span className="block text-[10px] font-mono text-muted-foreground/80">
                          {d.rif}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1", pm.className)}>
                        <PmIcon className="size-3" />
                        {pm.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      v{d.appVersion ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(d.registeredAt, { day: "2-digit", month: "short" })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(d.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium",
                          d.isOnline ? "text-success" : "text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            d.isOnline
                              ? "bg-success animate-pulse"
                              : "bg-muted-foreground/40"
                          )}
                          aria-hidden
                        />
                        <span className="hidden sm:inline">
                          {d.isOnline ? "En línea" : "Offline"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label="Acciones"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setDetail(d)}>
                            <Eye className="size-4" /> Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAliasDialog(d)}>
                            <Tag className="size-4" /> Asignar alias
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateLicense(d)}>
                            <KeyRound className="size-4" /> Generar licencia
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                            {d.clientName ?? "Sin cliente"}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
            label="dispositivos"
          />
        </div>
      </Card>

      {/* ── Dialog detalle ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-primary" /> Detalle del dispositivo
            </DialogTitle>
            <DialogDescription>
              Información completa del dispositivo registrado.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail label="Dispositivo" value={detail.deviceId} mono />
                <Detail label="Alias" value={detail.alias ?? "—"} />
                <Detail label="Negocio" value={detail.businessName ?? "—"} />
                <Detail label="RIF" value={detail.rif ?? "—"} mono />
                <Detail label="Cliente" value={detail.clientName ?? "—"} />
                <Detail label="Teléfono" value={detail.clientPhone ?? "—"} mono />
                <Detail
                  label="Plataforma"
                  value={PLATFORM_META[detail.platform].label}
                />
                <Detail label="App versión" value={`v${detail.appVersion ?? "—"}`} mono />
                <Detail label="Registrado" value={formatDate(detail.registeredAt)} />
                <Detail
                  label="Última conexión"
                  value={formatRelative(detail.lastSeenAt)}
                />
              </div>

              {detail.email && (
                <div className="flex items-center gap-2 rounded-lg bg-secondary/50 border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="font-mono truncate">{detail.email}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg bg-card border border-border/60 p-3 text-center">
                  <div className="flex items-center justify-center text-muted-foreground mb-1">
                    <Building2 className="size-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Negocio
                  </p>
                  <p className="text-xs font-medium text-foreground truncate mt-0.5">
                    {detail.businessName ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border/60 p-3 text-center">
                  <div className="flex items-center justify-center text-muted-foreground mb-1">
                    <Phone className="size-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Contacto
                  </p>
                  <p className="text-xs font-medium text-foreground truncate mt-0.5">
                    {detail.clientPhone ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border/60 p-3 text-center">
                  <div
                    className={cn(
                      "flex items-center justify-center mb-1",
                      detail.isOnline ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        detail.isOnline ? "bg-success animate-pulse" : "bg-muted-foreground/40"
                      )}
                    />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Estado
                  </p>
                  <p className="text-xs font-medium text-foreground mt-0.5">
                    {detail.isOnline ? "En línea" : "Offline"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    openAliasDialog(detail);
                    setDetail(null);
                  }}
                >
                  <Tag className="size-4" /> Asignar alias
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    handleGenerateLicense(detail);
                    setDetail(null);
                  }}
                >
                  <KeyRound className="size-4" /> Generar licencia
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog asignar alias ── */}
      <Dialog open={!!aliasTarget} onOpenChange={(o) => !o && setAliasTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" /> Asignar alias
            </DialogTitle>
            <DialogDescription>
              Etiqueta el dispositivo {aliasTarget?.deviceId} para identificarlo
              fácilmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label
              htmlFor="alias-input"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Alias del dispositivo
            </Label>
            <Input
              id="alias-input"
              placeholder="Bodega Don José"
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              El alias se muestra en todas las vistas del panel y en los reportes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasTarget(null)} disabled={savingAlias}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAlias} disabled={savingAlias}>
              {savingAlias ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Guardando...
                </>
              ) : (
                "Guardar alias"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-sm text-foreground", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
