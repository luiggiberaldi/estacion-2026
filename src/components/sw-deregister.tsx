'use client';
/**
 * SWDeregister — desregistra cualquier Service Worker activo y limpia los
 * caches del navegador al montar. Evita que SWs de otras apps (ej. bodega
 * Vite PWA) intercepten los Server Actions de Next.js y causen errores
 * "Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported".
 */
import { useEffect } from 'react';

export function SWDeregister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // 1. Desregistrar todos los SWs activos
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
        console.info('[SWDeregister] Service Worker desregistrado:', reg.scope);
      }
    });

    // 2. Limpiar todos los caches de la Cache API
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        caches.delete(key);
        console.info('[SWDeregister] Cache eliminado:', key);
      });
    });
  }, []);

  return null;
}
