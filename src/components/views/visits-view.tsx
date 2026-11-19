"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Eye,
  CalendarDays,
  Users,
  Loader2,
  RotateCw,
  Globe2,
  UserCheck,
  AlertCircle,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelative, parseDevice, isBotUserAgent } from "@/lib/utils";
import { getVisits, getVisitStats, type Visit, type VisitStats } from "@/lib/visits";

const PAGE = 50;
const EMPTY_STATS: VisitStats = { today: 0, last7Days: 0, uniqueToday: 0, total: 0, topCountries: [] };

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Eye; label: string; value: string; tone: string }) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-tone-sm">
      <CardHeader className="pb-2">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide pt-1">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-display tracking-tight text-foreground leading-none">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

/** Fecha/hora en America/Caracas con hora. */
function formatCaracas(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function cleanReferer(ref: string | null): string {
  if (!ref) return "Directo";
  return ref.replace(/^https?:\/\//, "");
}

export function VisitsView() {
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [stats, setStats] = useState<VisitStats>(EMPTY_STATS);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideBots, setHideBots] = useState(true);
  const [route, setRoute] = useState<"all" | "login" | "panel">("all");
  const seq = useRef(0);

  const fetchData = async (showLoading = true) => {
    const mine = ++seq.current;
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const [page, s] = await Promise.all([getVisits(PAGE, 0), getVisitStats()]);
      if (mine !== seq.current) return;
      setVisits(page.visits);
      setHasMore(page.hasMore);
      setStats(s);
    } catch (err: any) {
      if (mine !== seq.current) return;
      setError(err?.message || "Error de servidor");
    } finally {
      if (mine === seq.current) setIsLoading(false);
    }
  };

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await getVisits(PAGE, visits.length);
      setVisits((prev) => [...prev, ...page.visits]);
      setHasMore(page.hasMore);
    } catch (err: any) {
      toast({
        title: "No se pudieron cargar más visitas",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const shown = useMemo(
    () =>
      visits.filter((v) => {
        if (hideBots && isBotUserAgent(v.userAgent)) return false;
        const isLogin = (v.path || "/") === "/login";
        if (route === "login") return isLogin;
        if (route === "panel") return !isLogin;
        return true;
      }),
    [visits, hideBots, route]
  );
  const botsHidden = hideBots ? visits.filter((v) => isBotUserAgent(v.userAgent)).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display">Registro de visitas</h2>
          <p className="text-sm text-muted-foreground">
            Quien abre el link queda registrado aquí. No se cuentan tus propias visitas locales ni los bots conocidos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(false)}>
          <RotateCw className={cn("size-4 mr-2", isLoading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 border-l-4 border-destructive p-4 rounded-r-xl text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">No se pudieron cargar las visitas: {error}</span>
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={CalendarDays} label="Visitas hoy" value={String(stats.today)} tone="bg-primary/15 text-primary" />
        <Kpi
          icon={UserCheck}
          label="Personas distintas hoy"
          value={String(stats.uniqueToday)}
          tone="bg-success/15 text-success"
        />
        <Kpi
          icon={Eye}
          label="Últimos 7 días"
          value={String(stats.last7Days)}
          tone="bg-accent/15 text-accent-foreground"
        />
        <Kpi
          icon={Users}
          label="Visitas totales"
          value={String(stats.total)}
          tone="bg-secondary text-secondary-foreground"
        />
      </div>

      {stats.topCountries.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Globe2 className="size-4" /> Países (últimos 7 días)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.topCountries.map((c) => (
              <Badge key={c.country} variant="secondary" className="text-xs">
                {c.country} · {c.count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground">Últimas visitas</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "login", "panel"] as const).map((r) => (
              <Button key={r} size="sm" variant={route === r ? "default" : "outline"} onClick={() => setRoute(r)}>
                {r === "all" ? "Todas" : r === "login" ? "Solo /login" : "Solo panel"}
              </Button>
            ))}
            <Button size="sm" variant={hideBots ? "default" : "outline"} onClick={() => setHideBots((v) => !v)}>
              <Bot className="size-4 mr-1" /> {hideBots ? "Bots ocultos" : "Mostrar bots"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Eye className="size-8 mx-auto mb-2 opacity-40" />
              {error
                ? "No se pudo cargar la lista."
                : visits.length === 0
                  ? "Aún no hay visitas registradas."
                  : "Ninguna visita coincide con el filtro."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        <div className="font-medium">{formatCaracas(v.createdAt)}</div>
                        <div className="text-muted-foreground">{formatRelative(v.createdAt)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {v.path || "/"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.ip || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {[v.city, v.country].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {isBotUserAgent(v.userAgent) ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Bot
                          </Badge>
                        ) : (
                          <>
                            {parseDevice(v.userAgent)}
                            {v.screen && <span className="text-muted-foreground"> · {v.screen}</span>}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={v.referer ?? ""}>
                        {cleanReferer(v.referer)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {!isLoading && (hasMore || botsHidden > 0) && (
          <div className="flex items-center justify-between gap-3 border-t border-border/50 p-3 text-xs text-muted-foreground">
            <span>
              Mostrando {shown.length} de {visits.length} cargadas
              {botsHidden > 0 ? ` (${botsHidden} de bots ocultas)` : ""}
            </span>
            {hasMore && (
              <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : "Cargar más"}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
