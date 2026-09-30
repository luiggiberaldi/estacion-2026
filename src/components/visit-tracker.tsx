"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// VisitTracker — registra cada apertura/navegación del panel vía POST /api/track.
// Se monta una vez en el root layout; dispara en mount y en cada cambio de
// pathname. Guard por pathname contra el doble-invoke de StrictMode.
export function VisitTracker() {
  const pathname = usePathname();
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || sentFor.current === pathname) return;
    sentFor.current = pathname;

    const payload = {
      path: pathname,
      referer: document.referrer || null,
      screen:
        typeof window !== "undefined"
          ? `${window.screen.width}x${window.screen.height}`
          : null,
      lang: typeof navigator !== "undefined" ? navigator.language : null,
      tz:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : null,
    };

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // El tracking nunca debe romper la app.
    });
  }, [pathname]);

  return null;
}
