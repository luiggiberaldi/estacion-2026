"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bell,
  BellRing,
  Clock,
  TimerOff,
  DatabaseBackup,
  Smartphone,
  Sparkles,
  CheckCheck,
  Loader2,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelative } from "@/lib/utils";
import {
  getNotifications,
  markAllRead,
  markRead,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";
import { PRODUCTS } from "@/lib/products";

const TYPE_META: Record<NotificationType, { label: string; icon: LucideIcon; tone: string }> = {
  demo_created: { label: "Nueva demo", icon: Sparkles, tone: "bg-primary/15 text-primary" },
  demo_expiring: { label: "Demo por vencer", icon: Clock, tone: "bg-amber-500/15 text-amber-600" },
  demo_expired: { label: "Demo vencida", icon: TimerOff, tone: "bg-destructive/15 text-destructive" },
  backup_failed: { label: "Respaldo fallido", icon: DatabaseBackup, tone: "bg-destructive/15 text-destructive" },
  device_new: { label: "Dispositivo nuevo", icon: Smartphone, tone: "bg-emerald-500/15 text-emerald-600" },
};

function productShort(id: string | null): string | null {
  if (!id) return null;
  return PRODUCTS.find((p) => p.id === id)?.short ?? id;
}

export function NotificationsView() {
  const { toast } = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getNotifications(100);
      setItems(data);
    } catch (err: any) {
      toast({
        title: "Error al cargar notificaciones",
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

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.readAt) : items),
    [items, filter]
  );
  const unreadCount = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const handleOpen = async (n: AppNotification) => {
    if (n.readAt) return;
    try {
      await markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    } catch {
      /* se ignora */
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display">Notificaciones</h2>
          <p className="text-sm text-muted-foreground">
            Demos nuevas, por vencer y vencidas · respaldos fallidos · dispositivos nuevos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData(false)}>
            <RotateCw className="size-4 mr-2" />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="size-4 mr-2" />
            )}
            Marcar todas como leídas
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
        <TabsList>
          <TabsTrigger value="all">Todas ({items.length})</TabsTrigger>
          <TabsTrigger value="unread">No leídas ({unreadCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {unreadCount > 0 ? <BellRing className="size-8 mx-auto mb-2 opacity-40" /> : <Bell className="size-8 mx-auto mb-2 opacity-40" />}
            {filter === "unread" ? "No tienes notificaciones sin leer." : "Aún no hay notificaciones."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.device_new;
            const Icon = meta.icon;
            const unread = !n.readAt;
            const prod = productShort(n.productId);
            return (
              <button
                key={n.id}
                onClick={() => handleOpen(n)}
                className={cn(
                  "w-full text-left rounded-xl border p-4 flex gap-3 items-start transition-colors",
                  unread
                    ? "border-primary/40 bg-primary/[0.04] hover:bg-primary/[0.08]"
                    : "border-border/60 bg-card hover:bg-secondary/40"
                )}
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                  <Icon className="size-5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
                      {n.title}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {meta.label}
                    </Badge>
                    {prod && (
                      <Badge variant="secondary" className="text-[10px]">
                        {prod}
                      </Badge>
                    )}
                  </div>
                  {n.body && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{formatRelative(n.createdAt)}</p>
                </div>
                {unread && <span className="size-2.5 rounded-full bg-primary shrink-0 mt-1.5" aria-label="Sin leer" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
