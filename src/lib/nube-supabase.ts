// Cliente del Supabase de Precios al Día Nube (otro proyecto, no el de la Estación).
//
// Solo servidor. Usa la llave service_role de la nube: es la única que puede
// cambiar `account_licenses` (D7 del plan de la nube). NO es un módulo
// "use server": las acciones con sesión están en nube-actions.ts.
//
// Variables (en .env.local y en Vercel):
//   NUBE_SUPABASE_URL               p. ej. https://hfuzyauiefhllohonvim.supabase.co (nube-pruebas)
//   NUBE_SUPABASE_SERVICE_ROLE_KEY  llave service_role de ese proyecto

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function nubeConfigured(): boolean {
  return !!process.env.NUBE_SUPABASE_URL && !!process.env.NUBE_SUPABASE_SERVICE_ROLE_KEY;
}

/** Ref del proyecto (para mostrar a cuál nube está conectada la Estación). */
export function nubeProjectRef(): string | null {
  const url = process.env.NUBE_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

let client: SupabaseClient | null = null;

export function getNubeAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getNubeAdmin solo puede ejecutarse del lado del servidor");
  }
  const url = process.env.NUBE_SUPABASE_URL;
  const key = process.env.NUBE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Falta conectar la Nube: define NUBE_SUPABASE_URL y NUBE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
  }
  return client;
}
