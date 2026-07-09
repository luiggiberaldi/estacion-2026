"use client";

import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  KeyRound,
  Clock,
  DatabaseBackup,
  BadgeDollarSign,
  Smartphone,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AdminView =
  | "dashboard"
  | "licenses"
  | "demos"
  | "backups"
  | "subscriptions"
  | "devices";

interface NavItem {
  id: AdminView;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Resumen general" },
  { id: "licenses", label: "Licencias", icon: KeyRound, description: "Activar, revocar, modificar" },
  { id: "demos", label: "Demos", icon: Clock, description: "Demos activas y expiradas" },
  { id: "backups", label: "Backups", icon: DatabaseBackup, description: "Extraer respaldos" },
  { id: "subscriptions", label: "Mensualidades", icon: BadgeDollarSign, description: "Suscripciones recurrentes" },
  { id: "devices", label: "Dispositivos", icon: Smartphone, description: "Dispositivos registrados" },
];

interface AdminShellProps {
  activeView: AdminView;
  onViewChange: (v: AdminView) => void;
  children: ReactNode;
}

export function AdminShell({ activeView, onViewChange, children }: AdminShellProps) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeItem = NAV_ITEMS.find((n) => n.id === activeView);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sidebar (desktop) ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="size-5" strokeWidth={2} />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-base text-sidebar-foreground">Estación Maestra</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Bodega v1.2</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="truncate">{item.label}</span>
                    {!isActive && (
                      <span className="text-[10px] text-muted-foreground truncate">{item.description}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          {/* User footer */}
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold uppercase">
                {user?.name?.charAt(0) || "A"}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate text-sidebar-foreground">{user?.name}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Cerrar sesión"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Main content ── */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Menú"
          >
            {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>

          <div className="flex flex-col">
            <h1 className="font-display text-xl leading-none">{activeItem?.label}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{activeItem?.description}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar dispositivo, alias..."
                className="pl-9 h-9 w-64 bg-secondary/50"
              />
            </div>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
              <Bell className="size-4" />
              <Badge className="absolute -top-0.5 -right-0.5 size-4 p-0 text-[9px] justify-center bg-destructive text-white border-0">
                3
              </Badge>
            </Button>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">Sistema en línea</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
