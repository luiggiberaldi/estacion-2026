"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Smartphone,
  MoreHorizontal,
  Eye,
  Tag,
  KeyRound,
  Inbox,
  Loader2,
  Mail,
  Phone,
  Building2,
  Send,
  RotateCw,
  Copy,
  Link2,
  Link2Off,
  ShieldCheck,
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
import { cn, formatRelative, formatDate, shortDeviceId } from "@/lib/utils";
import { getDevices, updateDeviceAlias, requestBackup, sendRemoteReloadCommand } from "@/lib/actions";
import {
  getDeviceCredentialStatuses,
  issueDeviceClaimCode,
  revokeDeviceCredential,
  type DeviceCredentialStatus,
  type IssuedClaimCode,
} from "@/lib/credential-actions";

import type { Device } from "@/lib/types";
import { productName, sharesStationCloud } from "@/lib/products";
import { useProduct } from "@/lib/product-context";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function DevicesView() {
  const { toast } = useToast();
  const { productId } = useProduct();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detail, setDetail] = useState<Device | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Device | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  // Vinculación de respaldo por equipo (credencial propia para el relay).
  const [credStatus, setCredStatus] = useState<Record<string, DeviceCredentialStatus>>({});
  const [claim, setClaim] = useState<(IssuedClaimCode & { label: string }) | null>(null);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Device | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const seqRef = useRef(0);
  const fetchDevices = async (showLoading = true) => {
    const seq = ++seqRef.current;
    if (showLoading) setIsLoading(true);
    try {
      const data = await getDevices(productId);
      if (seq !== seqRef.current) return;
      setDevices(data);
      if (sharesStationCloud(productId)) {
        getDeviceCredentialStatuses()
          .then((st) => { if (seq === seqRef.current) setCredStatus(st); })
          .catch(() => { /* sin migración 004/008: la vista sigue funcionando */ });
      } else {
        setCredStatus({});
      }
    } catch (err: any) {
      if (seq !== seqRef.current) return;
      toast({
        title: "Error al cargar dispositivos",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      if (seq === seqRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [productId]);

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

  async function handleCopyDeviceId(deviceId: string) {
    try {
      await navigator.clipboard.writeText(deviceId);
      toast({ title: "ID copiado", description: deviceId });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "El portapapeles no está disponible.",
        variant: "destructive",
      });
    }
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

  async function handleGenerateLicense(d: Device) {
    try {
      // Acción real: copiar el ID del dispositivo para pegarlo en Licencias → Generar licencia
      await navigator.clipboard.writeText(d.deviceId);
      toast({
        title: "ID del dispositivo copiado",
        description: `${d.deviceId} — pégalo en Licencias → "Generar licencia" para activarlo.`,
      });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: `Copia manualmente el ID: ${d.deviceId}`,
        variant: "destructive",
      });
    }
  }

  async function handleRequestBackup(d: Device) {
    try {
      await requestBackup(d.deviceId);
      toast({
        title: "Solicitud enviada",
        description: `Solicitud de respaldo remoto enviada a ${d.alias ?? d.deviceId}.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al solicitar respaldo",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    }
  }

  // Cuenta atrás del código abierto.
  useEffect(() => {
    if (!claim) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [claim]);

  async function handleIssueClaim(d: Device) {
    setClaimLoading(d.deviceId);
    try {
      const issued = await issueDeviceClaimCode(d.deviceId);
      setNowTick(Date.now());
      setClaim({ ...issued, label: d.alias ?? d.businessName ?? shortDeviceId(d.deviceId) });
    } catch (err: any) {
      toast({ title: "No se pudo generar el código", description: err.message || "Error de servidor", variant: "destructive" });
    } finally {
      setClaimLoading(null);
    }
  }

  async function handleCopyClaim() {
    if (!claim) return;
    try {
      await navigator.clipboard.writeText(claim.code);
      toast({ title: "Código copiado", description: "Pásaselo al dueño de la caja." });
    } catch {
      toast({ title: "No se pudo copiar", description: claim.code, variant: "destructive" });
    }
  }

  async function handleUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      await revokeDeviceCredential(unlinkTarget.deviceId);
      toast({
        title: "Vínculo de respaldo quitado",
        description: `${unlinkTarget.alias ?? unlinkTarget.deviceId} ya no puede usar la vía de emergencia hasta que se vincule de nuevo.`,
      });
      setUnlinkTarget(null);
      fetchDevices(false);
    } catch (err: any) {
      toast({ title: "No se pudo quitar el vínculo", description: err.message || "Error de servidor", variant: "destructive" });
    } finally {
      setUnlinking(false);
    }
  }

  async function handleRemoteReload(d?: Device) {
    try {
      // Con dispositivo: va directo al device_id. Sin dispositivo ("todos"):
      // scoped al producto visible, nada de default silencioso a Lite.
      const count = await sendRemoteReloadCommand(productId, d?.deviceId);
      toast({
        title: "Comando enviado",
        description: d
          ? `Comando de recarga insertado para ${d.alias ?? d.deviceId}. El POS lo procesará al sincronizar comandos remotos.`
          : `Comando insertado para ${count} cuenta(s) activa(s) de ${productName(productId)}. El POS lo procesará al sincronizar comandos remotos.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al enviar señal",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    }
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
              <TableHead className="pl-4 min-w-[110px]">Dispositivo</TableHead>
              <TableHead className="min-w-[140px]">Alias</TableHead>
              <TableHead className="min-w-[150px]">Negocio</TableHead>
              <TableHead className="min-w-[110px]">Registrado</TableHead>
              <TableHead className="min-w-[120px]">Última conexión</TableHead>
              <TableHead className="text-center">Online</TableHead>
              <TableHead className="text-right pr-4 sticky right-0 bg-card border-l border-border/40 z-10">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j} className="py-3">
                      <Skeleton className="h-4 w-full max-w-[100px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : devices.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12">
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
                return (
                  <TableRow key={d.id} className="group">
                    <TableCell className="pl-4 font-mono text-xs text-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span title={d.deviceId}>{shortDeviceId(d.deviceId)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-60 hover:opacity-100"
                          onClick={() => handleCopyDeviceId(d.deviceId)}
                          aria-label="Copiar ID del dispositivo"
                          title="Copiar ID completo"
                        >
                          <Copy className="size-3" />
                        </Button>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {d.alias ?? (
                        <span className="text-muted-foreground italic">Sin alias</span>
                      )}
                      {credStatus[d.deviceId]?.linked && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success align-middle"
                          title="Esta caja tiene su propia llave para la vía de emergencia de respaldos"
                        >
                          <ShieldCheck className="size-3" /> Respaldo vinculado
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.businessName ?? "—"}
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
                    <TableCell className="text-right pr-4 sticky right-0 bg-card border-l border-border/40">
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
                          <DropdownMenuItem disabled={!sharesStationCloud(productId)} onClick={() => handleRequestBackup(d)}>
                            <Send className="size-4 text-emerald-600" /> Solicitar Backup
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!sharesStationCloud(productId)} onClick={() => handleRemoteReload(d)}>
                            <RotateCw className="size-4 text-sky-500" /> Recargar POS Remoto
                          </DropdownMenuItem>
                          {sharesStationCloud(productId) && (
                            <>
                              <DropdownMenuItem disabled={claimLoading === d.deviceId} onClick={() => handleIssueClaim(d)}>
                                <Link2 className="size-4 text-primary" />
                                {credStatus[d.deviceId]?.linked ? "Nuevo código de respaldo" : "Vincular respaldo"}
                              </DropdownMenuItem>
                              {credStatus[d.deviceId]?.linked && (
                                <DropdownMenuItem onClick={() => setUnlinkTarget(d)}>
                                  <Link2Off className="size-4 text-destructive" /> Quitar vínculo de respaldo
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
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
                <Detail label="Cliente" value={detail.clientName ?? "—"} />
                <Detail label="Teléfono" value={detail.clientPhone ?? "—"} mono />
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

      {/* ── Dialog código de vinculación de respaldo ── */}
      <Dialog open={!!claim} onOpenChange={(o) => { if (!o) { setClaim(null); fetchDevices(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-5 text-primary" /> Vincular respaldo
            </DialogTitle>
            <DialogDescription>
              Código para <strong>{claim?.label}</strong>. Sirve una sola vez y solo para esta caja.
            </DialogDescription>
          </DialogHeader>
          {claim && (() => {
            const left = Math.max(0, new Date(claim.expiresAt).getTime() - nowTick);
            const mm = Math.floor(left / 60000);
            const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-secondary/40 py-5 text-center">
                  <p className="font-mono text-3xl font-semibold tracking-[0.25em] text-foreground select-all">
                    {left > 0 ? claim.code : "VENCIDO"}
                  </p>
                  <p className={cn("mt-2 text-xs", left > 0 ? "text-muted-foreground" : "text-destructive")}>
                    {left > 0 ? `Vence en ${mm}:${ss}` : "Genera uno nuevo desde el menú del equipo."}
                  </p>
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>En la caja: <strong>Ajustes → Sistema → Respaldo en la nube</strong>.</li>
                  <li>Escribe el código en <strong>«Código de vinculación»</strong> y pulsa <strong>Vincular</strong>.</li>
                  <li>Al terminar, esta caja aparecerá aquí como <strong>Respaldo vinculado</strong>.</li>
                </ol>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClaim(null); fetchDevices(false); }}>
              Cerrar
            </Button>
            <Button onClick={handleCopyClaim} disabled={!claim || new Date(claim.expiresAt).getTime() <= nowTick}>
              <Copy className="size-4" /> Copiar código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog quitar vínculo de respaldo ── */}
      <Dialog open={!!unlinkTarget} onOpenChange={(o) => { if (!o && !unlinking) setUnlinkTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Quitar el vínculo de respaldo?</DialogTitle>
            <DialogDescription>
              {unlinkTarget?.alias ?? unlinkTarget?.deviceId} dejará de poder usar la vía de emergencia de
              respaldos hasta que lo vincules otra vez con un código nuevo. Su respaldo normal no cambia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinkTarget(null)} disabled={unlinking}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? <><Loader2 className="size-4 animate-spin" /> Quitando…</> : "Sí, quitar vínculo"}
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
