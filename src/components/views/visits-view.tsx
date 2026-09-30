"use client";

import { useState, useEffect } from "react";
import { Eye, CalendarDays, Users, Loader2, RotateCw } from "lucide-react";
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
import { cn, formatRelative, parseDevice } from "@/lib/utils";
import {
  getVisits,
  getVisitStats,
  type Visit,
} from "@/lib/visits";

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

export function VisitsView() {
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [v, s] = await Promise.all([getVisits(100), getVisitStats()]);
      setVisits(v);
      setStats(s);
    } catch (err: any) {
      toast({
        title: "Error al cargar visitas",
        description: err.message || "Error de servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display">Registro de visitas</h2>
          <p className="text-sm text-muted-foreground">
            Toda persona que abre el link queda registrada aquí.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(false)}>
          <RotateCw className="size-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Kpi
          icon={CalendarDays}
          label="Visitas hoy"
          value={String(stats.today)}
          tone="bg-primary/15 text-primary"
        />
        <Kpi
          icon={Users}
          label="Visitas totales"
          value={String(stats.total)}
          tone="bg-accent/15 text-accent-foreground"
        />
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Últimas visitas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : visits.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Eye className="size-8 mx-auto mb-2 opacity-40" />
              Aún no hay visitas registradas.
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.map((v) => (
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
                        {parseDevice(v.userAgent)}
                        {v.screen && (
                          <span className="text-muted-foreground"> · {v.screen}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
