"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Search,
  Send,
  PhoneOff,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { getLicenses } from "@/lib/actions";
import type { License } from "@/lib/types";
import { useProduct } from "@/lib/product-context";
import { productName, type ProductId } from "@/lib/products";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ─── Plantillas por caso ─── */

interface Template {
  id: string;
  title: string;
  description: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    id: "bienvenida",
    title: "Licencia activada",
    description: "Dar la bienvenida tras activar",
    body: "¡Hola {nombre}! 👋\nTu licencia {licencia} de PreciosAlDía ya está activa en tu equipo {equipo}.\nCualquier duda con la app, respóndeme por aquí.\n¡A vender! 💪",
  },
  {
    id: "demo_vence",
    title: "Demo por vencer",
    description: "Recordatorio antes de que expire la prueba",
    body: "¡Hola {nombre}! 👋\nTe escribo de PreciosAlDía: tu período de prueba vence en {dias} ({vencimiento}).\nSi quieres seguir usando la app sin interrupciones, activa tu licencia permanente por $50 (pago único).\n¿Te la activo?",
  },
  {
    id: "demo_vencida",
    title: "Demo vencida",
    description: "La prueba terminó, ofrecer licencia",
    body: "¡Hola {nombre}! 👋\nTu prueba de PreciosAlDía terminó el {vencimiento}.\nPara reactivar tu equipo {equipo}, la licencia permanente cuesta $50 (pago único, sin mensualidades).\n¿La activamos?",
  },
  {
    id: "pago_recibido",
    title: "Pago recibido",
    description: "Confirmar pago de licencia permanente",
    body: "¡Hola {nombre}! ✅\nPago recibido. Tu licencia permanente de PreciosAlDía ya está activa en tu equipo {equipo} (pago único, sin mensualidades).\n¡Gracias por tu confianza! 🙌",
  },
  {
    id: "sin_licencia",
    title: "Primer contacto",
    description: "Equipo registrado sin licencia activa",
    body: "¡Hola {nombre}! 👋\nVi que registraste PreciosAlDía en tu equipo {equipo} pero aún no tienes licencia activa.\nTienes 3 días de prueba gratis. ¿Quieres que te ayude a activarla?",
  },
];

const TYPE_LABEL: Record<string, string> = {
  permanent: "permanente",
  monthly: "mensual",
  demo7: "demo",
  demo3: "demo",
  registered: "registro",
};

/* ─── Utilidades ─── */

function waPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("58") && digits.length >= 12) return digits;
  if (digits.startsWith("0")) return "58" + digits.slice(1);
  if (digits.length >= 10) return "58" + digits;
  return null;
}

function displayPhone(raw: string | null): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("58") ? "0" + digits.slice(2) : digits;
  return local.length === 11
    ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
    : raw;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function clientLabel(l: License): string {
  return l.alias || l.clientName || l.deviceId;
}

/** Sugiere la plantilla según el estado real de la licencia del cliente. */
function suggestTemplate(l: License): string {
  const days = daysUntil(l.expiresAt);
  const expired = l.status === "expired";
  if (l.type === "demo7" || l.type === "demo3") {
    if (expired) return "demo_vencida";
    if (days !== null && days <= 3) return "demo_vence";
    return "demo_vence";
  }
  if (l.type === "registered") return "sin_licencia";
  return "bienvenida";
}

function fillTemplate(t: Template, l: License): string {
  const days = daysUntil(l.expiresAt);
  return t.body
    .replaceAll("{nombre}", clientLabel(l))
    .replaceAll("{codigo}", l.clientName ?? "—")
    .replaceAll("{licencia}", TYPE_LABEL[l.type] ?? l.type)
    .replaceAll("{vencimiento}", formatDate(l.expiresAt))
    .replaceAll("{dias}", days === null ? "—" : days <= 0 ? "hoy" : `${days} día${days === 1 ? "" : "s"}`)
    .replaceAll("{equipo}", l.deviceId);
}

/* ─── Vista ─── */

export function MessagesView() {
  const { productId } = useProduct();
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("bienvenida");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getLicenses(productId as ProductId)
      .then((data) => {
        if (!cancelled) {
          setLicenses(data);
          setSelectedId((prev) => {
            const withPhone = (l: License) => l.clientPhone && l.clientPhone.trim() !== "";
            if (prev && data.some((l) => l.id === prev && withPhone(l))) return prev;
            return data.find(withPhone)?.id ?? null;
          });
        }
      })
      .catch(() =>
        toast({ title: "Error al cargar clientes", variant: "destructive" })
      )
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, toast]);

  const filtered = useMemo(() => {
    // Solo clientes con teléfono registrado: sin teléfono no se puede enviar nada
    const withPhone = licenses.filter((l) => l.clientPhone && l.clientPhone.trim() !== "");
    const q = query.trim().toLowerCase();
    if (!q) return withPhone;
    return withPhone.filter((l) =>
      [l.alias, l.clientName, l.clientPhone, l.deviceId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [licenses, query]);

  const selected = useMemo(
    () => licenses.find((l) => l.id === selectedId) ?? null,
    [licenses, selectedId]
  );

  const template = useMemo(
    () => TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0],
    [templateId]
  );

  // Al cambiar de cliente: sugerir plantilla según su caso y prellenar el texto
  useEffect(() => {
    if (!selected) {
      setText("");
      return;
    }
    const suggested = suggestTemplate(selected);
    setTemplateId(suggested);
    const t = TEMPLATES.find((x) => x.id === suggested) ?? TEMPLATES[0];
    setText(fillTemplate(t, selected));
  }, [selected]);

  // Al cambiar de plantilla: regenerar el texto para el cliente actual
  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (t && selected) setText(fillTemplate(t, selected));
  };

  const sendPhone = selected ? waPhone(selected.clientPhone) : null;

  const handleSend = () => {
    if (!selected) return;
    if (!sendPhone) {
      toast({
        title: "Sin teléfono",
        description: "Este cliente no tiene teléfono registrado. Agrégalo en Licencias → Generar licencia.",
        variant: "destructive",
      });
      return;
    }
    window.open(`https://wa.me/${sendPhone}?text=${encodeURIComponent(text)}`, "_blank");
    toast({
      title: "Abriendo WhatsApp",
      description: `Conversación con ${clientLabel(selected)} lista para enviar.`,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" /> Mensajes
        </h1>
        <p className="text-sm text-muted-foreground">
          Plantillas por caso para {productName(productId as ProductId)}. Elige el cliente,
          revisa el texto y envíalo por WhatsApp. Solo se muestran clientes con teléfono
          registrado.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, teléfono, código o equipo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* ── Directorio de clientes ── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clientes ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {query.trim()
                  ? `Sin resultados para “${query}”.`
                  : "Ningún cliente tiene teléfono registrado."}
              </p>
            ) : (
              filtered.map((l) => {
                const active = l.id === selectedId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-all",
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/60 hover:border-border hover:bg-secondary/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{clientLabel(l)}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {TYPE_LABEL[l.type] ?? l.type}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {l.clientPhone ? (
                        <span className="font-mono">{displayPhone(l.clientPhone)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <PhoneOff className="size-3" /> Sin teléfono
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate font-mono">
                      {l.deviceId}
                    </p>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ── Plantilla + vista previa ── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selected ? `Mensaje para ${clientLabel(selected)}` : "Selecciona un cliente"}
            </CardTitle>
            {selected && (
              <CardDescription>
                {selected.clientPhone
                  ? `WhatsApp: ${displayPhone(selected.clientPhone)}`
                  : "Este cliente no tiene teléfono registrado."}
                {selected.expiresAt && ` · Vence: ${formatDate(selected.expiresAt)}`}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Caso
              </Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-medium">{t.title}</span>
                      <span className="text-muted-foreground"> — {t.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Texto (editable antes de enviar)
              </Label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Elige un cliente para generar el mensaje…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSend} disabled={!selected || !text.trim()} className="flex-1 min-w-[180px]">
                <Send className="size-4" /> Enviar por WhatsApp
              </Button>
              <Button variant="outline" onClick={handleCopy} disabled={!text.trim()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            {!sendPhone && selected && (
              <p className="text-xs text-amber-600 font-medium">
                Para enviar por WhatsApp este cliente necesita un teléfono. Agrégalo generando
                o editando su licencia.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
