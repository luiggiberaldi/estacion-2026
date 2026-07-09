"use client";

import { useState, useEffect, useMemo } from "react";
import {
  KeyRound,
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Clock,
  Infinity as InfinityIcon,
  Ban,
  Trash2,
  Smartphone,
  Inbox,
  Loader2,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelative, formatDate } from "@/lib/utils";

import { getLicenses, createOrUpdateLicense, revokeLicense, deleteLicense } from "@/lib/actions";
import type { License, LicenseType } from "@/lib/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes y helpers de presentación
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "permanent" | "monthly" | "demo7" | "revoked" | "registered";

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: "permanent", label: "Permanentes" },
  { key: "monthly", label: "Mensuales" },
  { key: "demo7", label: "Demos" },
  { key: "revoked", label: "Revocadas" },
  { key: "registered", label: "Sin Licencia" },
];

const TYPE_LABEL: Record<LicenseType, string> = {
  permanent: "Permanente",
  monthly: "Mensual",
  demo7: "Demo",
  revoked: "Revocada",
  registered: "Sin licencia",
};

function statusBadge(lic: License): {
  label: string;
  className: string;
} {
  // Expiración próxima (7 días)
  const isExpiringSoon =
    lic.status === "active" &&
    lic.expiresAt &&
    new Date(lic.expiresAt).getTime() - Date.now() < 7 * 86400000;

  if (lic.status === "active" && !isExpiringSoon)
    return { label: "Activa", className: "bg-success/15 text-success border-transparent" };
  if (lic.status === "active" && isExpiringSoon)
    return { label: "Por expirar", className: "bg-warning/15 text-warning border-transparent" };
  if (lic.status === "revoked" || lic.type === "revoked")
    return { label: "Revocada", className: "bg-destructive/15 text-destructive border-transparent" };
  if (lic.status === "expired")
    return { label: "Expirada", className: "bg-secondary text-secondary-foreground border-transparent" };
  return { label: "Pendiente", className: "bg-secondary text-muted-foreground border-transparent" };
}

const TYPE_BADGE: Record<LicenseType, string> = {
  permanent: "bg-primary/10 text-primary border-transparent",
  monthly: "bg-accent/10 text-accent border-transparent",
  demo7: "bg-warning/10 text-warning border-transparent",
  revoked: "bg-destructive/10 text-destructive border-transparent",
  registered: "bg-secondary text-muted-foreground border-transparent",
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────────────────

export function LicensesView() {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("permanent");
  const [query, setQuery] = useState("");

  // Diálogos
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailLic, setDetailLic] = useState<License | null>(null);
  const [confirm, setConfirm] = useState<
    { lic: License; action: "revoke" | "delete" } | null
  >(null);
  const [changeTypeLic, setChangeTypeLic] = useState<License | null>(null);
  const [newLicType, setNewLicType] = useState<LicenseType>("permanent");
  const [newDays, setNewDays] = useState(30);

  // Form de generación
  const [formDeviceId, setFormDeviceId] = useState("");
  const [formType, setFormType] = useState<LicenseType>("permanent");
  const [formDays, setFormDays] = useState(3);
  const [formAlias, setFormAlias] = useState("");
  const [formClient, setFormClient] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLicenses = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getLicenses();
      setLicenses(data);
    } catch (err: any) {
      toast({
        title: "Error al cargar licencias",
        description: err.message || "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return licenses.filter((l) => {
      const matchesTab =
        activeTab === "revoked"
          ? l.status === "revoked" || l.type === "revoked"
          : l.status !== "revoked" && l.type === activeTab;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        l.deviceId.toLowerCase().includes(q) ||
        (l.alias?.toLowerCase().includes(q) ?? false) ||
        (l.clientName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [licenses, activeTab, query]);

  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedLicenses,
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
  }, [activeTab, query]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      permanent: 0,
      monthly: 0,
      demo7: 0,
      revoked: 0,
      registered: 0,
    };
    licenses.forEach((l) => {
      if (l.status === "revoked" || l.type === "revoked") c.revoked++;
      else if (l.type in c) c[l.type as TabKey]++;
    });
    return c;
  }, [licenses]);

  // ── Handlers ──

  async function handleGenerate() {
    if (!formDeviceId.trim()) {
      toast({ title: "Falta el ID del dispositivo", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const expiresAt =
        formType === "demo7"
          ? new Date(Date.now() + formDays * 86400000).toISOString()
          : formType === "monthly"
            ? new Date(Date.now() + 30 * 86400000).toISOString()
            : null;

      await createOrUpdateLicense({
        deviceId: formDeviceId.trim().toUpperCase(),
        type: formType,
        expiresAt,
        alias: formAlias.trim(),
        clientName: formClient.trim(),
      });

      toast({
        title: "Licencia generada",
        description: `${TYPE_LABEL[formType]} para ${formDeviceId.trim().toUpperCase()}`,
      });
      setGenerateOpen(false);
      setFormDeviceId("");
      setFormAlias("");
      setFormClient("");
      setFormType("permanent");
      setFormDays(3);
      await fetchLicenses(false);
    } catch (err: any) {
      toast({
        title: "Error al generar licencia",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeTypeSubmit() {
    if (!changeTypeLic) return;
    setIsSubmitting(true);
    try {
      const expiresAt =
        newLicType === "demo7"
          ? new Date(Date.now() + newDays * 86400000).toISOString()
          : newLicType === "monthly"
            ? new Date(Date.now() + newDays * 86400000).toISOString()
            : null;

      await createOrUpdateLicense({
        deviceId: changeTypeLic.deviceId,
        type: newLicType,
        expiresAt,
        status: "active",
      });

      toast({
        title: "Licencia actualizada",
        description: `El dispositivo ${changeTypeLic.alias ?? changeTypeLic.deviceId} ahora es ${TYPE_LABEL[newLicType]}`,
      });
      setChangeTypeLic(null);
      await fetchLicenses(false);
    } catch (err: any) {
      toast({
        title: "Error al actualizar licencia",
        description: err.message || "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAction(action: string, lic: License) {
    if (action === "detail") {
      setDetailLic(lic);
      return;
    }
    if (action === "revoke") {
      setConfirm({ lic, action: "revoke" });
      return;
    }
    if (action === "delete") {
      setConfirm({ lic, action: "delete" });
      return;
    }
    if (action === "demo") {
      setIsLoading(true);
      try {
        await createOrUpdateLicense({
          deviceId: lic.deviceId,
          type: "demo7",
          expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
          status: "active",
        });
        toast({ title: "Demo activada", description: `${lic.alias ?? lic.deviceId} · 3 días` });
        await fetchLicenses(false);
      } catch (err: any) {
        toast({
          title: "Error al activar demo",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (action === "permanent") {
      setIsLoading(true);
      try {
        await createOrUpdateLicense({
          deviceId: lic.deviceId,
          type: "permanent",
          expiresAt: null,
          status: "active",
        });
        toast({
          title: "Convertida a permanente",
          description: lic.alias ?? lic.deviceId,
        });
        await fetchLicenses(false);
      } catch (err: any) {
        toast({
          title: "Error al convertir licencia",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    const { lic, action } = confirm;
    setIsLoading(true);
    try {
      if (action === "revoke") {
        await revokeLicense(lic.deviceId);
        toast({
          title: "Licencia revocada",
          description: lic.alias ?? lic.deviceId,
          variant: "destructive",
        });
      } else {
        await deleteLicense(lic.deviceId);
        toast({
          title: "Dispositivo eliminado",
          description: lic.alias ?? lic.deviceId,
          variant: "destructive",
        });
      }
      await fetchLicenses(false);
    } catch (err: any) {
      toast({
        title: "Error al procesar acción",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setConfirm(null);
      setIsLoading(false);
    }
  }

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por dispositivo, alias o cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Button onClick={() => setGenerateOpen(true)} className="sm:ml-auto">
          <Plus className="size-4" /> Generar licencia
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          {TAB_CONFIG.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              {t.label}
              <Badge
                variant="secondary"
                className="ml-1 h-4 min-w-4 px-1 justify-center text-[10px] tabular-nums"
              >
                {counts[t.key]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_CONFIG.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <Card className="border-border/60 shadow-tone-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 min-w-[140px]">Dispositivo</TableHead>
                    <TableHead className="min-w-[140px]">Alias</TableHead>
                    <TableHead className="min-w-[140px]">Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="min-w-[120px]">Última conexión</TableHead>
                    <TableHead className="text-right pr-4">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <TableCell key={j} className="py-3">
                            <Skeleton className="h-4 w-full max-w-[120px]" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-12">
                        <div className="flex flex-col items-center text-center">
                          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-3">
                            <Inbox className="size-5" strokeWidth={1.5} />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            No hay licencias en esta categoría
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {query
                              ? "Ajusta la búsqueda para ver resultados."
                              : "Genera una nueva licencia para comenzar."}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLicenses.map((lic) => {
                      const sb = statusBadge(lic);
                      return (
                        <TableRow key={lic.id} className="group">
                          <TableCell className="pl-4 font-mono text-xs text-foreground">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "size-1.5 rounded-full shrink-0",
                                  lic.isOnline ? "bg-success" : "bg-muted-foreground/40"
                                )}
                                aria-hidden
                              />
                              {lic.deviceId}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {lic.alias ?? (
                              <span className="text-muted-foreground italic">Sin alias</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lic.clientName ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("font-medium", TYPE_BADGE[lic.type])}
                            >
                              {TYPE_LABEL[lic.type]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("font-medium", sb.className)}>
                              {sb.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatRelative(lic.lastSeenAt)}
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
                                <DropdownMenuItem onClick={() => handleAction("detail", lic)}>
                                  <Eye className="size-4" /> Ver detalle
                                </DropdownMenuItem>
                                {lic.type !== "demo7" && lic.type !== "permanent" && lic.type !== "revoked" && (
                                  <DropdownMenuItem onClick={() => handleAction("demo", lic)}>
                                    <Clock className="size-4" /> Activar demo
                                  </DropdownMenuItem>
                                )}
                                {lic.type !== "permanent" && lic.type !== "revoked" && (
                                  <DropdownMenuItem
                                    onClick={() => handleAction("permanent", lic)}
                                  >
                                    <InfinityIcon className="size-4" /> Hacer permanente
                                  </DropdownMenuItem>
                                )}
                                {lic.status === "revoked" || lic.type === "revoked" ? (
                                   <DropdownMenuItem
                                     onClick={() => {
                                       setChangeTypeLic(lic);
                                       setNewLicType("monthly");
                                       setNewDays(30);
                                     }}
                                   >
                                     <KeyRound className="size-4" /> Reactivar licencia
                                   </DropdownMenuItem>
                                 ) : (
                                   <>
                                     <DropdownMenuItem
                                       onClick={() => {
                                         setChangeTypeLic(lic);
                                         setNewLicType(lic.type);
                                         setNewDays(lic.type === "demo7" ? 3 : 30);
                                       }}
                                     >
                                       <KeyRound className="size-4" /> Cambiar tipo de cuenta
                                     </DropdownMenuItem>
                                     <DropdownMenuSeparator />
                                     <DropdownMenuItem
                                       variant="destructive"
                                       onClick={() => handleAction("revoke", lic)}
                                     >
                                       <Ban className="size-4" /> Revocar
                                     </DropdownMenuItem>
                                   </>
                                 )}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleAction("delete", lic)}
                                >
                                  <Trash2 className="size-4" /> Eliminar
                                </DropdownMenuItem>
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
                  label="licencias"
                />
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Dialog: generar licencia ── */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Generar licencia
            </DialogTitle>
            <DialogDescription>
              Registra una nueva licencia para un dispositivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gen-device" className="text-xs uppercase tracking-wider text-muted-foreground">
                ID del dispositivo *
              </Label>
              <Input
                id="gen-device"
                placeholder="PDA-XXXXXXXX"
                value={formDeviceId}
                onChange={(e) => setFormDeviceId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gen-alias" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Alias
                </Label>
                <Input
                  id="gen-alias"
                  placeholder="Bodega Don José"
                  value={formAlias}
                  onChange={(e) => setFormAlias(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-client" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Cliente
                </Label>
                <Input
                  id="gen-client"
                  placeholder="Nombre del cliente"
                  value={formClient}
                  onChange={(e) => setFormClient(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Tipo de licencia
                </Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as LicenseType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Permanente</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="demo7">Demo</SelectItem>
                    <SelectItem value="registered">Sin licencia (registro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formType === "demo7" && (
                <div className="space-y-2">
                  <Label htmlFor="gen-days" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Días de demo
                  </Label>
                  <Input
                    id="gen-days"
                    type="number"
                    min={1}
                    max={30}
                    value={formDays}
                    onChange={(e) => setFormDays(Number(e.target.value) || 7)}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generando...
                </>
              ) : (
                "Generar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: detalle ── */}
      <Dialog open={!!detailLic} onOpenChange={(o) => !o && setDetailLic(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-primary" /> Detalle de licencia
            </DialogTitle>
            <DialogDescription>
              Información completa del dispositivo y su licencia.
            </DialogDescription>
          </DialogHeader>
          {detailLic && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm py-1">
              <Detail label="Dispositivo" value={detailLic.deviceId} mono />
              <Detail label="Alias" value={detailLic.alias ?? "—"} />
              <Detail label="Cliente" value={detailLic.clientName ?? "—"} />
              <Detail label="Teléfono" value={detailLic.clientPhone ?? "—"} />
              <Detail label="Email de Marketing" value={detailLic.marketingEmail ?? "—"} />
              <Detail label="Tipo" value={TYPE_LABEL[detailLic.type]} />
              <Detail
                label="Estado"
                value={statusBadge(detailLic).label}
              />
              <Detail label="Código" value={detailLic.code} mono />
              <Detail label="Plataforma" value={detailLic.platform.toUpperCase()} />
              <Detail label="App versión" value={detailLic.appVersion ?? "—"} />
              <Detail label="Online" value={detailLic.isOnline ? "Sí" : "No"} />
              <Detail label="Creada" value={formatDate(detailLic.createdAt)} />
              <Detail label="Activada" value={formatDate(detailLic.activatedAt)} />
              <Detail label="Expira" value={formatDate(detailLic.expiresAt)} />
              <Detail label="Última conexión" value={formatRelative(detailLic.lastSeenAt)} />
            </div>
          )}
          {detailLic?.notes && (
            <div className="rounded-lg bg-secondary/50 border border-border/60 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Notas: </span>
              {detailLic.notes}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: cambiar tipo de cuenta ── */}
      <Dialog open={!!changeTypeLic} onOpenChange={(o) => !o && setChangeTypeLic(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Cambiar tipo de cuenta
            </DialogTitle>
            <DialogDescription>
              Modifica el tipo de licencia para {changeTypeLic?.alias ?? changeTypeLic?.deviceId}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="change-type">Tipo de Licencia</Label>
              <Select
                value={newLicType}
                onValueChange={(val) => setNewLicType(val as LicenseType)}
              >
                <SelectTrigger id="change-type">
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanente</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="demo7">Demo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newLicType === "monthly" || newLicType === "demo7") && (
              <div className="space-y-2">
                <Label htmlFor="change-days">
                  {newLicType === "demo7" ? "Días de demo" : "Días de licencia"}
                </Label>
                <Input
                  id="change-days"
                  type="number"
                  min={1}
                  max={365}
                  value={newDays}
                  onChange={(e) => setNewDays(Number(e.target.value) || 30)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTypeLic(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleChangeTypeSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: cambiar tipo de cuenta ── */}
      <Dialog open={!!changeTypeLic} onOpenChange={(o) => !o && setChangeTypeLic(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Cambiar tipo de cuenta
            </DialogTitle>
            <DialogDescription>
              Modifica el tipo de licencia para {changeTypeLic?.alias ?? changeTypeLic?.deviceId}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="change-type">Tipo de Licencia</Label>
              <Select
                value={newLicType}
                onValueChange={(val) => setNewLicType(val as LicenseType)}
              >
                <SelectTrigger id="change-type">
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanente</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="demo7">Demo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newLicType === "monthly" || newLicType === "demo7") && (
              <div className="space-y-2">
                <Label htmlFor="change-days">
                  {newLicType === "demo7" ? "Días de demo" : "Días de licencia"}
                </Label>
                <Input
                  id="change-days"
                  type="number"
                  min={1}
                  max={365}
                  value={newDays}
                  onChange={(e) => setNewDays(Number(e.target.value) || 30)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTypeLic(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleChangeTypeSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmación destructiva ── */}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "revoke"
                ? "¿Revocar esta licencia?"
                : "¿Eliminar este dispositivo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "revoke"
                ? `El dispositivo ${confirm?.lic.alias ?? confirm?.lic.deviceId} perderá acceso inmediatamente. Esta acción puede revertirse.`
                : `Se eliminará permanentemente el registro de ${confirm?.lic.alias ?? confirm?.lic.deviceId}. Esta acción no puede deshacerse.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                confirm?.action === "revoke"
                  ? "bg-warning text-warning-foreground hover:bg-warning/90"
                  : "bg-destructive text-white hover:bg-destructive/90"
              )}
            >
              {confirm?.action === "revoke" ? "Revocar" : "Eliminar"}
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
