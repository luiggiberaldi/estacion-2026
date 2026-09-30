"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, CheckCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelative } from "@/lib/utils";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";
import {
  Sparkles,
  Clock,
  TimerOff,
  DatabaseBackup,
  Smartphone,
} from "lucide-react";

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  demo_created: { icon: Sparkles, tone: "bg-primary/15 text-primary" },
  demo_expiring: { icon: Clock, tone: "bg-amber-500/15 text-amber-600" },
  demo_expired: { icon: TimerOff, tone: "bg-destructive/15 text-destructive" },
  backup_failed: { icon: DatabaseBackup, tone: "bg-destructive/15 text-destructive" },
  device_new: { icon: Smartphone, tone: "bg-emerald-500/15 text-emerald-600" },
};

export function NotificationBell({ onSeeAll }: { onSeeAll: () => void }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [count, list] = await Promise.all([getUnreadCount(), getNotifications(8)]);
      setUnread(count);
      setRecent(list);
    } catch {
      /* la campana nunca rompe el topbar */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleMarkAll = async () => {
    await markAllRead();
    setUnread(0);
    setRecent((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={unread > 0 ? `${unread} notificaciones sin leer` : "Notificaciones"}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] rounded-full"
              variant="destructive"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Notificaciones</span>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <CheckCheck className="size-3.5" />
              Marcar leídas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Sin notificaciones.
            </p>
          ) : (
            recent.map((n) => {
              const meta = TYPE_ICON[n.type] ?? TYPE_ICON.device_new;
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    onSeeAll();
                  }}
                  className="w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-secondary/50 border-b border-border/50 last:border-0"
                >
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                    <Icon className="size-4" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-snug", !n.readAt && "font-semibold")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                  {!n.readAt && (
                    <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </button>
              );
            })
          )}
        </div>
        <button
          onClick={() => {
            setOpen(false);
            onSeeAll();
          }}
          className="w-full px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-secondary/50 border-t border-border"
        >
          Ver todas
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
