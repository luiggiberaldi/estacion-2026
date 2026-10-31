"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import {
  changeAdminPin,
  getAdminPinStatus,
  updateStationSettings,
  type AdminPinStatus,
} from "@/lib/settings-actions";
import {
  DEFAULT_TEMPLATES,
  LIMITS,
  SETTINGS_PRODUCT_IDS,
  TEMPLATE_PLACEHOLDERS,
  weakPinReason,
  type MessageTemplate,
  type ProductTerms,
  type SettingsProductId,
  type StationSettings,
} from "@/lib/settings-schema";
import { productName } from "@/lib/products";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const TEXTAREA =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y";

const TERM_FIELDS: ReadonlyArray<{
  key: keyof ProductTerms;
  label: string;
  hint: string;
  prefix?: string;
  suffix?: string;
  step: string;
  limits: { min: number; max: number };
}> = [
  { key: "permanent", label: "Licencia permanente", hint: "Pago único", prefix: "$", step: "0.01", limits: LIMITS.price },
  { key: "monthly", label: "Mensualidad", hint: "Cobro mensual", prefix: "$", step: "0.01", limits: LIMITS.price },
  { key: "demoDays", label: "Demo automática", hint: "La caja la activa sola al instalarse", suffix: "días", step: "1", limits: LIMITS.demoDays },
  { key: "demoExtensionDays", label: "Extender demo", hint: "Lo que suma «Extender» en Demos", suffix: "días", step: "1", limits: LIMITS.demoExtensionDays },
  { key: "monthlyGraceDays", label: "Gracia mensual", hint: "Días tras vencer antes de bloquear", suffix: "días", step: "1", limits: LIMITS.monthlyGraceDays },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
}

export function SettingsView() {
  const { settings, available, updatedAt, loading, refresh } = useSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<StationSettings>(settings);
  const [saving, setSaving] = useState(false);

  // Al llegar ajustes nuevos del servidor, el borrador vuelve a reflejarlos.
  useEffect(() => setDraft(settings), [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  const setTerm = (id: SettingsProductId, key: keyof ProductTerms, value: string) =>
    setDraft((d) => ({
      ...d,
      products: { ...d.products, [id]: { ...d.products[id], [key]: value === "" ? ("" as unknown as number) : Number(value) } },
    }));

  const setContact = (key: keyof StationSettings["contact"], value: string) =>
    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));

  const setTemplate = (index: number, patch: Partial<MessageTemplate>) =>
    setDraft((d) => ({ ...d, templates: d.templates.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));

  const addTemplate = () =>
    setDraft((d) => ({
      ...d,
      templates: [
        ...d.templates,
        { id: `plantilla_${Date.now().toString(36)}`, title: "Nueva plantilla", description: "", body: "¡Hola {nombre}! 👋\n" },
      ],
    }));

  const removeTemplate = (index: number) =>
    setDraft((d) => ({ ...d, templates: d.templates.filter((_, i) => i !== index) }));

  const resetTemplates = () =>
    setDraft((d) => ({ ...d, templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })) }));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateStationSettings(draft);
      if (!res.ok) {
        toast({ title: "No se guardaron los ajustes", description: res.error, variant: "destructive" });
        return;
      }
      await refresh();
      toast({ title: "Ajustes guardados", description: "Las cajas toman los precios nuevos en su próxima verificación." });
    } catch (e) {
      toast({ title: "Error al guardar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !updatedAt && !available) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!available && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex gap-3 py-4 text-sm">
            <AlertTriangle className="size-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Falta activar los ajustes en la base de datos</p>
              <p className="text-muted-foreground">
                Ves los valores de fábrica. Para poder guardar cambios hay que aplicar la migración 006
                (station_settings). Hasta entonces la Estación y las cajas siguen usando estos valores.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="precios">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="precios"><Tag className="size-4" /> Precios y plazos</TabsTrigger>
          <TabsTrigger value="contacto"><Store className="size-4" /> Contacto</TabsTrigger>
          <TabsTrigger value="plantillas"><MessageSquare className="size-4" /> Plantillas</TabsTrigger>
          <TabsTrigger value="seguridad"><KeyRound className="size-4" /> PIN de acceso</TabsTrigger>
        </TabsList>

        {/* ── Precios y plazos ── */}
        <TabsContent value="precios" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {SETTINGS_PRODUCT_IDS.map((id) => (
              <Card key={id}>
                <CardHeader>
                  <CardTitle className="text-base">{productName(id)}</CardTitle>
                  <CardDescription>
                    Precio en USD y plazos de este producto. Las cajas los leen al verificar su licencia.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {TERM_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`${id}-${f.key}`} className="text-xs font-semibold">
                        {f.label}
                      </Label>
                      <div className="flex items-center gap-2">
                        {f.prefix && <span className="text-sm text-muted-foreground">{f.prefix}</span>}
                        <Input
                          id={`${id}-${f.key}`}
                          type="number"
                          inputMode="decimal"
                          min={f.limits.min}
                          max={f.limits.max}
                          step={f.step}
                          value={String(draft.products[id][f.key] ?? "")}
                          onChange={(e) => setTerm(id, f.key, e.target.value)}
                          disabled={!available}
                        />
                        {f.suffix && <span className="text-sm text-muted-foreground">{f.suffix}</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Cambiar un precio no toca las licencias ya vendidas: afecta los mensajes, el estimado de
            ingresos y lo que ven las cajas. La gracia mensual se aplica a todas las mensualidades del producto.
          </p>
        </TabsContent>

        {/* ── Contacto ── */}
        <TabsContent value="contacto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tus datos de contacto</CardTitle>
              <CardDescription>
                Se usan en las plantillas ({"{negocio}"}, {"{pago}"}) y las cajas pueden mostrarlos para renovar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-business" className="text-xs font-semibold">Nombre comercial</Label>
                <Input id="c-business" value={draft.contact.businessName} maxLength={LIMITS.text}
                  onChange={(e) => setContact("businessName", e.target.value)} disabled={!available} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-wa" className="text-xs font-semibold">WhatsApp (con código de país)</Label>
                <Input id="c-wa" inputMode="tel" placeholder="584141234567" value={draft.contact.whatsapp}
                  maxLength={LIMITS.text} onChange={(e) => setContact("whatsapp", e.target.value)} disabled={!available} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email" className="text-xs font-semibold">Correo</Label>
                <Input id="c-email" type="email" value={draft.contact.email} maxLength={LIMITS.text}
                  onChange={(e) => setContact("email", e.target.value)} disabled={!available} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-pay" className="text-xs font-semibold">Datos de pago</Label>
                <textarea id="c-pay" rows={4} className={TEXTAREA} maxLength={LIMITS.paymentInfo}
                  placeholder={"Pago Móvil: Banco, teléfono, cédula\nZelle: correo"}
                  value={draft.contact.paymentInfo} onChange={(e) => setContact("paymentInfo", e.target.value)}
                  disabled={!available} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plantillas ── */}
        <TabsContent value="plantillas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marcadores disponibles</CardTitle>
              <CardDescription>Se reemplazan con los datos del cliente al abrir Mensajes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <Badge key={p.key} variant="outline" title={p.label} className="font-mono text-[11px]">
                  {p.key}
                </Badge>
              ))}
            </CardContent>
          </Card>

          {draft.templates.map((t, i) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Título</Label>
                    <Input value={t.title} maxLength={LIMITS.templateTitle}
                      onChange={(e) => setTemplate(i, { title: e.target.value })} disabled={!available} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Cuándo usarla</Label>
                    <Input value={t.description} maxLength={LIMITS.templateDescription}
                      onChange={(e) => setTemplate(i, { description: e.target.value })} disabled={!available} />
                  </div>
                </div>
                <textarea rows={5} className={TEXTAREA} maxLength={LIMITS.templateBody} value={t.body}
                  onChange={(e) => setTemplate(i, { body: e.target.value })} disabled={!available} />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive"
                    onClick={() => removeTemplate(i)} disabled={!available || draft.templates.length <= 1}>
                    <Trash2 className="size-4" /> Quitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addTemplate}
              disabled={!available || draft.templates.length >= LIMITS.templates}>
              <Plus className="size-4" /> Agregar plantilla
            </Button>
            <Button variant="ghost" onClick={resetTemplates} disabled={!available}>
              <RotateCcw className="size-4" /> Volver a las de fábrica
            </Button>
          </div>
        </TabsContent>

        {/* ── PIN ── */}
        <TabsContent value="seguridad">
          <PinCard />
        </TabsContent>
      </Tabs>

      {/* Barra de guardado (precios, contacto y plantillas) */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <span className="text-xs text-muted-foreground">
          {dirty ? "Tienes cambios sin guardar." : `Guardado: ${formatDateTime(updatedAt)}`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setDraft(settings)} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!available || !dirty || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar ajustes
          </Button>
        </div>
      </div>
    </div>
  );
}

function PinCard() {
  const { toast } = useToast();
  const { available } = useSettings();
  const [status, setStatus] = useState<AdminPinStatus | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminPinStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const nextProblem = next.length === 6 ? weakPinReason(next) : null;

  async function handleChange() {
    if (next !== confirm) {
      toast({ title: "Los PIN nuevos no coinciden", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await changeAdminPin(current, next);
      if (!res.ok) {
        toast({ title: "No se cambió el PIN", description: res.error, variant: "destructive" });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus(await getAdminPinStatus());
      toast({ title: "PIN cambiado", description: "Las demás sesiones abiertas se cerraron. Esta sigue activa." });
    } catch (e) {
      toast({ title: "Error al cambiar el PIN", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">PIN de acceso a la Estación</CardTitle>
        <CardDescription>
          6 dígitos. Al cambiarlo se cierran todas las demás sesiones abiertas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.isWeak && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
            <span>El PIN actual es muy fácil de adivinar. Cámbialo ahora.</span>
          </div>
        )}
        {!available && (
          <p className="text-sm text-muted-foreground">
            Para cambiar el PIN desde aquí hay que aplicar la migración 006. Mientras tanto vale el PIN
            configurado en Vercel.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["pin-current", "PIN actual", current, setCurrent],
            ["pin-next", "PIN nuevo", next, setNext],
            ["pin-confirm", "Repite el nuevo", confirm, setConfirm],
          ] as const).map(([id, label, value, set]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
              <Input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={6}
                value={value} onChange={(e) => set(digits(e.target.value))} disabled={!available || busy} />
            </div>
          ))}
        </div>
        {nextProblem && <p className="text-xs text-destructive">{nextProblem}</p>}
        {confirm.length === 6 && next !== confirm && (
          <p className="text-xs text-destructive">Los PIN nuevos no coinciden.</p>
        )}
        <Button onClick={handleChange}
          disabled={!available || busy || current.length !== 6 || next.length !== 6 || next !== confirm || !!nextProblem}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Cambiar PIN
        </Button>
        {status && (
          <p className="text-[11px] text-muted-foreground">
            PIN vigente: {status.source === "db" ? "cambiado desde Ajustes" : "el configurado en Vercel"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
