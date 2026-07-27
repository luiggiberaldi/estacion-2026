"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DatabaseBackup,
  HardDriveDownload,
  HardDrive,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Download,
  Copy,
  Inbox,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  RefreshCw,
  Radio,
  Smartphone,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatBytes, formatRelative, formatDate } from "@/lib/utils";

import {
  getBackupData,
  getBackups,
  requestBackup,
  requestAllBackups,
  getPendingBackupRequests,
  getLicenses,
} from "@/lib/actions";
import type { Backup, BackupStatus, License } from "@/lib/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  BackupStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  completed: {
    label: "Completado",
    icon: CheckCircle2,
    className: "bg-success/15 text-success border-transparent",
  },
  failed: {
    label: "Fallido",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive border-transparent",
  },
  in_progress: {
    label: "En proceso",
    icon: Loader2,
    className: "bg-warning/15 text-warning border-transparent",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function BackupsView() {
  const { toast } = useToast();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detail, setDetail] = useState<Backup | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  // Solicitud manual de respaldos (solo permanentes o mensuales)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [paidLicenses, setPaidLicenses] = useState<License[]>([]);
  const [selectedDeviceForRequest, setSelectedDeviceForRequest] = useState<string>("all");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [pendingDeviceIds, setPendingDeviceIds] = useState<string[]>([]);

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const [backupsData, pendingIds] = await Promise.all([
        getBackups(),
        getPendingBackupRequests(),
      ]);
      setBackups(backupsData);
      setPendingDeviceIds(pendingIds);
    } catch (err: any) {
      toast({
        title: "Error al obtener respaldos",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const openRequestModal = async () => {
    setIsRequestModalOpen(true);
    try {
      const allLicenses = await getLicenses();
      const paid = allLicenses.filter(
        (l) => l.status === "active" && (l.type === "permanent" || l.type === "monthly")
      );
      setPaidLicenses(paid);
    } catch (e) {
      console.error(e);
    }
  };


  const handleSendBackupRequest = async () => {
    setIsSendingRequest(true);
    try {
      if (selectedDeviceForRequest === "all") {
        const count = await requestAllBackups();
        toast({
          title: "Solicitudes masivas enviadas",
          description: `Se enviaron solicitudes de respaldo a ${count} cuenta(s) permanentes/mensuales. Subirán su backup al estar en línea.`,
        });
      } else {
        await requestBackup(selectedDeviceForRequest);
        const targetLic = paidLicenses.find((l) => l.deviceId === selectedDeviceForRequest);
        toast({
          title: "Solicitud enviada",
          description: `Solicitud de respaldo enviada a ${targetLic?.alias ?? selectedDeviceForRequest}.`,
        });
      }
      setIsRequestModalOpen(false);
      fetchBackups();
    } catch (err: any) {
      toast({
        title: "Error al solicitar respaldo",
        description: err.message || "No se pudo registrar la solicitud",
        variant: "destructive",
      });
    } finally {
      setIsSendingRequest(false);
    }
  };


  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedBackups,
    goNext,
    goPrev,
    hasNext,
    hasPrev,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination(backups, 15);

  const stats = useMemo(() => {
    const completed = backups.filter((b) => b.status === "completed");
    return {
      total: backups.length,
      sizeBytes: completed.reduce((s, b) => s + b.sizeBytes, 0),
      failed: backups.filter((b) => b.status === "failed").length,
    };
  }, [backups]);

  async function handleExtract(bkp: Backup) {
    setExtractingId(bkp.id);
    try {
      if (bkp.driveUrl) {
        window.open(bkp.driveUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Abriendo Google Drive",
          description: `Descargando respaldo de ${bkp.alias ?? bkp.deviceId}`,
        });
        return;
      }
      const data = await getBackupData(bkp.id);
      if (!data) {
        toast({
          title: "Sin datos",
          description: "Este respaldo no contiene información.",
          variant: "destructive",
        });
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${bkp.deviceId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Backup extraído",
        description: `${bkp.alias ?? bkp.deviceId} · ${formatBytes(bkp.sizeBytes)}`,
      });
    } catch (err: any) {
      toast({
        title: "Error al extraer backup",
        description: err.message || "Error al obtener los datos del servidor",
        variant: "destructive",
      });
    } finally {
      setExtractingId(null);
    }
  }

  async function handleCopyShare(bkp: Backup) {
    if (!bkp.shareCode) {
      toast({
        title: "Sin código de compartir",
        description: "Este backup no tiene share code asignado.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(bkp.shareCode);
      toast({
        title: "Código copiado",
        description: `${bkp.shareCode} · ${bkp.alias ?? bkp.deviceId}`,
      });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "El portapapeles no está disponible.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Top Header Actions ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border/60 shadow-tone-sm">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Radio className="size-4 text-emerald-500 animate-pulse" />
            Control Remoto de Respaldos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Solicita la generación y envío del respaldo en tiempo real a los dispositivos POS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openRequestModal}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Send className="size-4" />
            Solicitar Backup Remoto
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchBackups}
            title="Refrescar respaldos"
            className="size-9 shrink-0"
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/60 shadow-tone-sm">
              <CardContent className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              icon={DatabaseBackup}
              tone="bg-primary/15 text-primary"
              label="Total backups"
              value={String(stats.total)}
            />
            <StatCard
              icon={HardDrive}
              tone="bg-accent/15 text-accent"
              label="Espacio usado"
              value={formatBytes(stats.sizeBytes)}
            />
            <StatCard
              icon={AlertTriangle}
              tone="bg-destructive/15 text-destructive"
              label="Backups fallidos"
              value={String(stats.failed)}
            />
          </>
        )}
      </section>

      {/* ── Tabla ── */}
      <Card className="border-border/60 shadow-tone-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 min-w-[140px]">Dispositivo</TableHead>
              <TableHead className="min-w-[140px]">Alias</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Ventas</TableHead>
              <TableHead className="min-w-[120px]">Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right pr-4">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j} className="py-3">
                      <Skeleton className="h-4 w-full max-w-[100px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : backups.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-12">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
                      <Inbox className="size-5" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No hay backups registrados
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Los dispositivos sincronizarán sus respaldos automáticamente.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedBackups.map((bkp) => {
                const sm = STATUS_META[bkp.status];
                const StatusIcon = sm.icon;
                return (
                  <TableRow key={bkp.id} className="group">
                    <TableCell className="pl-4 font-mono text-xs text-foreground">
                      {bkp.deviceId}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {bkp.alias ?? (
                        <span className="text-muted-foreground italic">Sin alias</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatBytes(bkp.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {bkp.productCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {bkp.salesCount}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(bkp.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1", sm.className)}>
                        <StatusIcon
                          className={cn(
                            "size-3",
                            bkp.status === "in_progress" && "animate-spin"
                          )}
                        />
                        {sm.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {bkp.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs opacity-70 group-hover:opacity-100"
                            onClick={() => handleExtract(bkp)}
                            disabled={extractingId === bkp.id}
                          >
                            {extractingId === bkp.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3.5" />
                            )}
                            Extraer
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
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setDetail(bkp)}>
                              <Eye className="size-4" /> Ver detalle
                            </DropdownMenuItem>
                            {bkp.driveUrl ? (
                              <DropdownMenuItem onClick={() => handleExtract(bkp)}>
                                <Download className="size-4 text-emerald-600" /> Descargar de Drive
                              </DropdownMenuItem>
                            ) : bkp.status === "completed" ? (
                              <DropdownMenuItem onClick={() => handleExtract(bkp)}>
                                <Download className="size-4" /> Extraer backup
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onClick={() => handleCopyShare(bkp)}
                              disabled={!bkp.shareCode}
                            >
                              <Copy className="size-4" /> Copiar código share
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                              Share: {bkp.shareCode ?? "—"}
                            </div>
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
            label="backups"
          />
        </div>
      </Card>

      {/* ── Dialog detalle ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDriveDownload className="size-5 text-primary" /> Detalle del backup
            </DialogTitle>
            <DialogDescription>
              Información completa del respaldo del dispositivo.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail label="Dispositivo" value={detail.deviceId} mono />
                <Detail label="Alias" value={detail.alias ?? "—"} />
                <Detail label="Cliente" value={detail.clientName ?? "—"} />
                <Detail label="Tamaño" value={formatBytes(detail.sizeBytes)} />
                <Detail label="Productos" value={String(detail.productCount)} />
                <Detail label="Ventas" value={String(detail.salesCount)} />
                <Detail label="Clientes" value={String(detail.customerCount)} />
                <Detail
                  label="Estado"
                  value={STATUS_META[detail.status].label}
                />
                <Detail label="Creado" value={formatDate(detail.createdAt)} />
                <Detail label="Share code" value={detail.shareCode ?? "—"} mono />
              </div>
              {detail.status === "failed" && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    El backup falló durante la sincronización. El dispositivo reintentará
                    automáticamente en la próxima conexión.
                  </span>
                </div>
              )}
              {detail.status === "completed" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleExtract(detail)}
                    disabled={extractingId === detail.id}
                  >
                    {extractingId === detail.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Extraer JSON
                  </Button>
                  {detail.shareCode && (
                    <Button
                      variant="outline"
                      onClick={() => handleCopyShare(detail)}
                    >
                      <Copy className="size-4" /> Copiar share
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog Pedir Backup ── */}
      <Dialog open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen}>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-5 text-emerald-600" /> Solicitar Backup Remoto
            </DialogTitle>
            <DialogDescription>
              Envía una señal remota a través de Supabase. Al detectar esta solicitud, el punto de venta generará su copia de seguridad y la enviará a Google Drive/Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dispositivo Destino
              </label>
              <Select
                value={selectedDeviceForRequest}
                onValueChange={setSelectedDeviceForRequest}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona dispositivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">⚡ Todos las cuentas permanentes / mensuales</SelectItem>
                  {paidLicenses.map((lic) => (
                    <SelectItem key={lic.id} value={lic.deviceId}>
                      {lic.alias
                        ? `${lic.alias} (${lic.type === "permanent" ? "Permanente" : "Mensual"})`
                        : `${lic.deviceId} (${lic.type === "permanent" ? "Permanente" : "Mensual"})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <Radio className="size-4 shrink-0 mt-0.5 text-emerald-500 animate-pulse" />
              <span>
                El dispositivo procesará el respaldo inmediatamente si la aplicación POS está abierta, o al iniciar sesión por próxima vez.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsRequestModalOpen(false)}>
              Cancelar
            </Button>

            <Button
              onClick={handleSendBackupRequest}
              disabled={isSendingRequest}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {isSendingRequest ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar Solicitud
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

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof DatabaseBackup;
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
