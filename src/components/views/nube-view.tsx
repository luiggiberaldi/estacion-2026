"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudOff,
  Users,
  MonitorSmartphone,
  Store,
  Search,
  RotateCw,
  Copy,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Mail,
  Loader2,
  Wifi,
  WifiOff,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate, formatRelative } from "@/lib/utils";
import { getNubeOverview, findNubeDevice, updateNubeLicense, type NubeOverview } from "@/lib/nube-actions";
import type { NubeAccount, NubeDevice, NubeLicenseState, NubeLicenseStatus } from "@/lib/nube-model";
import { isNubeDeviceId, looksLikeNubeId, normalizeDeviceId } from "@/lib/nube-id";

const LICENSE_BADGE: Record<NubeLicenseState, { label: string; className: string }> = {
  prueba: { label: "Prueba", className: "bg-amber-500/15 text-amber-700 border-transparent" },
  activa: { label: "Activa", className: "bg-success/15 text-success border-transparent" },
  suspendida: { label: "Suspendida", className: "bg-destructive/15 text-destructive border-transparent" },
  vencida: { label: "Vencida", className: "bg-destructive/15 text-destructive border-transparent" },
  sin_licencia: { label: "Sin licencia", className: "bg-secondary text-muted-foreground border-transparent" },
};

const ROLE_LABEL = { dueno: "Dueño", administrador: "Administrador", cajero: "Cajero" } as const;

function LicenseBadge({ state }: { state: NubeLicenseState }) {
  const m = LICENSE_BADGE[state];
  return <Badge className={m.className}>{m.label}</Badge>;
}

function DeviceRole({ d }: { d: NubeDevice }) {
  return d.role === "caja" ? (
    <Badge className="bg-primary/15 text-primary border-transparent">Caja {d.cajaLetter}</Badge>
  ) : (
    <Badge variant="secondary">Consulta</Badge>
  );
}

function DeviceStatus({ d }: { d: NubeDevice }) {
  if (d.revokedAt) return <span className="text-xs text-destructive">Expulsado {formatDate(d.revokedAt)}</span>;
  return d.isOnline ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <Wifi className="size-3.5" /> Conectado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <WifiOff className="size-3.5" /> Sin sesión
    </span>
  );
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function NubeView({ mode }: { mode: "accounts" | "devices" }) {
  const { toast } = useToast();
  const [data, setData] = useState<NubeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [found, setFound] = useState<{ device: NubeDevice; account: NubeAccount } | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<NubeAccount | null>(null);
  const [form, setForm] = useState({ status: "trial" as NubeLicenseStatus, maxCajas: "1", maxSedes: "1", expiresAt: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await getNubeOverview());
    } catch (err: any) {
      toast({ title: "No se pudo leer la Nube", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accounts = data?.accounts ?? [];
  const allDevices = useMemo(() => accounts.flatMap((a) => a.devices), [accounts]);

  const q = query.trim().toLowerCase();
  const isNubeQuery = looksLikeNubeId(query);
  const filteredAccounts = useMemo(() => {
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.ownerEmail ?? "").toLowerCase().includes(q) ||
        a.members.some((m) => m.name.toLowerCase().includes(q)) ||
        a.devices.some((d) => d.id.toLowerCase().includes(q) || d.label.toLowerCase().includes(q))
    );
  }, [accounts, q]);
  const filteredDevices = useMemo(() => {
    if (!q) return allDevices;
    return allDevices.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.accountName.toLowerCase().includes(q) ||
        (d.sedeName ?? "").toLowerCase().includes(q)
    );
  }, [allDevices, q]);

  const totals = useMemo(
    () => ({
      cuentas: accounts.length,
      activas: accounts.filter((a) => a.license.state === "activa" || a.license.state === "prueba").length,
      equipos: allDevices.filter((d) => !d.revokedAt).length,
      conectados: allDevices.filter((d) => d.isOnline).length,
    }),
    [accounts, allDevices]
  );

  // ID completo pegado: se busca en el servidor (reconoce el equipo aunque la lista no esté al día).
  useEffect(() => {
    setFound(null);
    if (!isNubeDeviceId(query)) return;
    let cancelled = false;
    setSearching(true);
    findNubeDevice(query)
      .then((r) => {
        if (cancelled) return;
        setFound(r);
        if (r) setOpen((o) => ({ ...o, [r.account.id]: true }));
      })
      .catch((err) => !cancelled && toast({ title: "Búsqueda", description: err.message, variant: "destructive" }))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description: text });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  }

  function openEdit(a: NubeAccount) {
    setEditing(a);
    setForm({
      status: a.license.status ?? "trial",
      maxCajas: String(a.license.maxCajas || 1),
      maxSedes: String(a.license.maxSedes || 1),
      expiresAt: toDateInput(a.license.expiresAt),
    });
  }

  async function saveLicense() {
    if (!editing) return;
    setSaving(true);
    try {
      await updateNubeLicense(editing.id, {
        status: form.status,
        maxCajas: Number(form.maxCajas),
        maxSedes: Number(form.maxSedes),
        // Vence al final del día elegido (hora de Venezuela).
        expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59-04:00` : null,
      });
      toast({ title: "Licencia actualizada", description: editing.name });
      setEditing(null);
      await load();
    } catch (err: any) {
      toast({ title: "No se guardó", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!loading && data && !data.configured) {
    return (
      <Card className="p-8 text-center space-y-3">
        <CloudOff className="mx-auto size-10 text-muted-foreground" />
        <h2 className="font-display text-lg">La Estación aún no está conectada a la Nube</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Agrega <code>NUBE_SUPABASE_URL</code> y <code>NUBE_SUPABASE_SERVICE_ROLE_KEY</code> (la llave
          service_role del proyecto de la nube) en <code>.env.local</code> y en Vercel, y vuelve a abrir la Estación.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Cuentas", value: totals.cuentas, icon: Store },
          { label: "Con licencia vigente", value: totals.activas, icon: KeyRound },
          { label: "Equipos registrados", value: totals.equipos, icon: MonitorSmartphone },
          { label: "Conectados ahora", value: totals.conectados, icon: Wifi },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-1 text-2xl font-semibold">{loading ? <Skeleton className="h-7 w-10" /> : s.value}</div>
          </Card>
        ))}
      </div>

      {/* Buscador: reconoce IDs PDN- */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar negocio, correo, empleado, equipo o ID PDN-…"
            className={cn("pl-9", isNubeQuery && "font-mono")}
            aria-label="Buscar en la Nube"
          />
        </div>
        <div className="flex items-center gap-2">
          {data?.projectRef && (
            <Badge variant="outline" className="gap-1">
              <Cloud className="size-3" /> {data.projectRef}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCw className={cn("size-4", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </div>

      {isNubeQuery && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          {searching ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Buscando el equipo en la Nube…
            </span>
          ) : found ? (
            <span>
              <strong>ID de la Nube reconocido:</strong> «{found.device.label}» (
              {found.device.role === "caja" ? `Caja ${found.device.cajaLetter}` : "Consulta"}) de la cuenta{" "}
              <strong>{found.account.name}</strong>
              {found.account.ownerEmail ? ` · ${found.account.ownerEmail}` : ""}.
            </span>
          ) : isNubeDeviceId(query) ? (
            <span>
              <strong>{normalizeDeviceId(query)}</strong> tiene formato de la Nube, pero no está registrado en{" "}
              {data?.projectRef ?? "esta nube"}.
            </span>
          ) : (
            <span>Es un ID de la Nube (PDN-). Pégalo completo: PDN- y 32 caracteres.</span>
          )}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : mode === "accounts" ? (
        <div className="space-y-3">
          {filteredAccounts.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {q ? "Nada coincide con la búsqueda." : "Todavía no hay cuentas registradas en la Nube."}
            </Card>
          )}
          {filteredAccounts.map((a) => {
            const isOpen = !!open[a.id];
            return (
              <Card key={a.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [a.id]: !isOpen }))}
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-accent/40"
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown className="mt-1 size-4 shrink-0" /> : <ChevronRight className="mt-1 size-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.name}</span>
                      <LicenseBadge state={a.license.state} />
                      {a.equiposConectados > 0 && (
                        <Badge className="bg-success/15 text-success border-transparent">
                          {a.equiposConectados} conectado{a.equiposConectados === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" /> {a.ownerEmail ?? "correo no disponible"}
                        {a.ownerEmail && !a.ownerConfirmed && " (sin confirmar)"}
                      </span>
                      <span>
                        Cajas {a.cajasEnUso}/{a.license.maxCajas} · Sedes {a.sedes.filter((s) => !s.archived).length}/
                        {a.license.maxSedes}
                      </span>
                      <span>{a.members.length} usuario{a.members.length === 1 ? "" : "s"}</span>
                      <span>{a.salesCount} venta{a.salesCount === 1 ? "" : "s"}</span>
                      <span>
                        {a.license.expiresAt ? `Vence ${formatDate(a.license.expiresAt)}` : "Sin vencimiento"}
                      </span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-5 border-t border-border bg-secondary/20 p-4">
                    {/* Datos de la cuenta */}
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <Info label="ID de la cuenta" value={a.id} mono onCopy={() => copy(a.id)} />
                      <Info label="Creada" value={formatDate(a.createdAt)} />
                      <Info label="Último ingreso del dueño" value={formatRelative(a.ownerLastSignInAt)} />
                      <Info label="Última venta" value={formatRelative(a.lastSaleAt)} />
                    </div>

                    {/* Licencia */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                      <div className="text-sm">
                        <div className="font-medium">Licencia de la cuenta</div>
                        <div className="text-xs text-muted-foreground">
                          {LICENSE_BADGE[a.license.state].label} · {a.license.maxCajas} caja(s) · {a.license.maxSedes}{" "}
                          sede(s) · {a.license.expiresAt ? `vence ${formatDate(a.license.expiresAt)}` : "sin vencimiento"}
                          {a.license.updatedAt && ` · cambiada ${formatRelative(a.license.updatedAt)}`}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => openEdit(a)}>
                        <KeyRound className="size-4" /> Cambiar licencia
                      </Button>
                    </div>

                    {/* Sedes y usuarios */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sedes</h3>
                        <div className="flex flex-wrap gap-2">
                          {a.sedes.map((s) => (
                            <Badge key={s.id} variant={s.archived ? "secondary" : "outline"}>
                              {s.name}
                              {s.archived && " (archivada)"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Users className="size-3.5" /> Usuarios
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {a.members.map((m) => (
                            <Badge key={m.id} variant="outline" className={cn(!m.active && "opacity-50 line-through")}>
                              {m.name} · {ROLE_LABEL[m.role]}
                              {m.locked && <Lock className="ml-1 size-3 text-destructive" aria-label="Bloqueado" />}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Equipos */}
                    <div>
                      <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MonitorSmartphone className="size-3.5" /> Equipos ({a.devices.length})
                      </h3>
                      <DevicesTable
                        devices={a.devices}
                        highlight={found?.device.id}
                        onCopy={copy}
                        showAccount={false}
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <DevicesTable devices={filteredDevices} highlight={found?.device.id} onCopy={copy} showAccount />
        </Card>
      )}

      {/* Editar licencia */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Licencia de {editing?.name}</DialogTitle>
            <DialogDescription>
              La licencia es de la cuenta: cuántas cajas y sedes puede usar. Los equipos de consulta no cuentan.
              {editing && ` Hoy usa ${editing.cajasEnUso} caja(s).`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nube-status">Estado</Label>
              <select
                id="nube-status"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as NubeLicenseStatus }))}
              >
                <option value="trial">Prueba</option>
                <option value="active">Activa</option>
                <option value="suspended">Suspendida</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="nube-cajas">Cajas</Label>
                <Input
                  id="nube-cajas"
                  type="number"
                  min={0}
                  max={100}
                  value={form.maxCajas}
                  onChange={(e) => setForm((f) => ({ ...f, maxCajas: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nube-sedes">Sedes</Label>
                <Input
                  id="nube-sedes"
                  type="number"
                  min={1}
                  max={50}
                  value={form.maxSedes}
                  onChange={(e) => setForm((f) => ({ ...f, maxSedes: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nube-vence">Vence (vacío = sin vencimiento)</Label>
              <Input
                id="nube-vence"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            {editing && Number(form.maxCajas) < editing.cajasEnUso && (
              <p className="text-xs text-amber-700">
                Quedan menos cajas que las que usa hoy: las que ya están registradas siguen, pero no podrá registrar
                otra hasta expulsar alguna.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveLicense} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("flex items-center gap-1 truncate", mono && "font-mono text-xs")}>
        <span className="truncate" title={value}>
          {value}
        </span>
        {onCopy && (
          <button type="button" onClick={onCopy} className="text-muted-foreground hover:text-foreground" aria-label="Copiar">
            <Copy className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function DevicesTable({
  devices,
  highlight,
  onCopy,
  showAccount,
}: {
  devices: NubeDevice[];
  highlight?: string;
  onCopy: (t: string) => void;
  showAccount: boolean;
}) {
  if (devices.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin equipos registrados.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Equipo</TableHead>
            {showAccount && <TableHead>Cuenta</TableHead>}
            <TableHead>Tipo</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>En uso por</TableHead>
            <TableHead>Última vez</TableHead>
            <TableHead className="text-right">Ventas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((d) => (
            <TableRow
              key={d.id}
              className={cn(d.revokedAt && "opacity-60", highlight === d.id && "bg-primary/10")}
            >
              <TableCell>
                <div className="font-medium">{d.label}</div>
                <button
                  type="button"
                  onClick={() => onCopy(d.id)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  title={d.id}
                >
                  {d.id.slice(0, 12)}… <Copy className="size-3" />
                </button>
              </TableCell>
              {showAccount && <TableCell>{d.accountName}</TableCell>}
              <TableCell>
                <DeviceRole d={d} />
              </TableCell>
              <TableCell>{d.sedeName ?? "—"}</TableCell>
              <TableCell>
                <DeviceStatus d={d} />
              </TableCell>
              <TableCell className="text-xs">{d.openSessions.length ? d.openSessions.join(", ") : "—"}</TableCell>
              <TableCell className="text-xs">{formatRelative(d.lastSeenAt)}</TableCell>
              <TableCell className="text-right">{d.salesCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
