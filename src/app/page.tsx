"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AdminShell, type AdminView } from "@/components/admin-shell";
import { LoginView } from "@/components/login-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { LicensesView } from "@/components/views/licenses-view";
import { DemosView } from "@/components/views/demos-view";
import { BackupsView } from "@/components/views/backups-view";
import { SubscriptionsView } from "@/components/views/subscriptions-view";
import { DevicesView } from "@/components/views/devices-view";
import { Loader2 } from "lucide-react";

function AdminAppInternal() {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeView, setActiveView] = useState<AdminView>("dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // Acceso libre temporal (login deshabilitado)
  // if (!isAuthenticated) {
  //   return <LoginView />;
  // }

  return (
    <AdminShell activeView={activeView} onViewChange={setActiveView}>
      {activeView === "dashboard" && <DashboardView />}
      {activeView === "licenses" && <LicensesView />}
      {activeView === "demos" && <DemosView />}
      {activeView === "backups" && <BackupsView />}
      {activeView === "subscriptions" && <SubscriptionsView />}
      {activeView === "devices" && <DevicesView />}
    </AdminShell>
  );
}

const AdminApp = dynamic(() => Promise.resolve(AdminAppInternal), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  ),
});

export default function Home() {
  return (
    <AuthProvider>
      <AdminApp />
    </AuthProvider>
  );
}

