"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Loader2, Save } from "lucide-react";
import { getNubeTrialSettings, updateNubeTrialSettings, type NubeTrialSettings } from "@/lib/nube-actions";
import { NUBE_TRIAL_LIMITS } from "@/lib/nube-model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FIELDS = [
  {
    key: "trialDays",
    label: "Días de prueba",
    hint: "Lo que dura la prueba de un negocio que se registra",
    suffix: "días",
    limits: NUBE_TRIAL_LIMITS.trialDays,
  },
  {
    key: "trialMaxCajas",
    label: "Equipos de la prueba",
    hint: "Cajas que puede registrar durante la prueba (las de consulta no cuentan)",
    suffix: "cajas",
    limits: NUBE_TRIAL_LIMITS.trialMaxCajas,
  },
] as const;

type FormKey = (typeof FIELDS)[number]["key"];

function formatDateTime(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
}

/** Prueba con la que nace una cuenta nueva de la Nube (tabla nube_settings). */
export function NubeTrialSettingsCard() {
  const { toast } = useToast();
  const [data, setData] = useState<NubeTrialSettings | null>(null);
  const [form, setForm] = useState<Record<FormKey, string>>({ trialDays: "", trialMaxCajas: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apply = (s: NubeTrialSettings) => {
    setData(s);
    setForm({ trialDays: String(s.values.trialDays), trialMaxCajas: String(s.values.trialMaxCajas) });
  };

  useEffect(() => {
    let cancelled = false;
    getNubeTrialSettings()
      .then((s) => !cancelled && apply(s))
      .catch((e) => !cancelled && setLoadError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    !!data &&
    (form.trialDays !== String(data.values.trialDays) || form.trialMaxCajas !== String(data.values.trialMaxCajas));

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updateNubeTrialSettings({
        trialDays: form.trialDays === "" ? "" : Number(form.trialDays),
        trialMaxCajas: form.trialMaxCajas === "" ? "" : Number(form.trialMaxCajas),
      });
      apply(saved);
      toast({
        title: "Prueba de la Nube actualizada",
        description: `Las cuentas nuevas tendrán ${saved.values.trialDays} días y ${saved.values.trialMaxCajas} caja(s).`,
      });
    } catch (e) {
      toast({ title: "No se guardó", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex gap-3 py-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <p>No se pudieron leer los ajustes de la Nube: {loadError}</p>
        </CardContent>
      </Card>
    );
  }

  if (data && !data.configured) {
    return (
      <Card>
        <CardContent className="flex gap-3 py-4 text-sm">
          <CloudOff className="size-5 shrink-0 text-muted-foreground" />
          <p>La Estación aún no está conectada a la Nube (faltan NUBE_SUPABASE_URL y su llave service_role).</p>
        </CardContent>
      </Card>
    );
  }

  const editable = !!data?.available;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prueba de las cuentas nuevas</CardTitle>
        <CardDescription>
          Con esto nace cada negocio que se registra en la Nube (siempre con 1 sede). Solo afecta a las cuentas que
          se creen a partir de ahora; para cambiar una cuenta existente usa «Cambiar licencia» en Cuentas Nube.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editable && (
          <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="size-5 shrink-0 text-warning" />
            <p>
              Falta aplicar en la Nube la migración <code>015_ajustes_prueba_desde_estacion.sql</code>. Hasta entonces
              las cuentas nuevas reciben la prueba fija de 15 días y 2 cajas.
            </p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`nube-${f.key}`} className="text-xs font-semibold">
                {f.label}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`nube-${f.key}`}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={f.limits.min}
                  max={f.limits.max}
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  disabled={!editable || saving}
                  className="max-w-[8rem]"
                />
                <span className="text-sm text-muted-foreground">{f.suffix}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {f.hint} · entre {f.limits.min} y {f.limits.max}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {dirty ? "Tienes cambios sin guardar." : `Guardado: ${formatDateTime(data?.updatedAt ?? null)}`}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => data && apply(data)} disabled={!dirty || saving}>
              Descartar
            </Button>
            <Button onClick={handleSave} disabled={!editable || !dirty || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
