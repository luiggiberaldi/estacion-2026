import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Custom fetch wrapper with a 5-second timeout to prevent hanging forever when offline
const fetchWithTimeout = (url: URL | RequestInfo, options?: RequestInit, timeout = 5000): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error("Timeout de conexión con la base de datos (Supabase)"));
    }, timeout);

    fetch(url, { ...options, signal: controller.signal })
      .then((res) => {
        clearTimeout(id);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
};

// Cliente público para el lado del cliente (seguro para el navegador)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options) => fetchWithTimeout(url, options, 5000),
  },
});

// Cliente administrador para uso exclusivo del lado del servidor (Next.js Server Actions / API Routes)
export const getSupabaseAdmin = () => {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdmin solo puede ejecutarse del lado del servidor");
  }
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no está definida en las variables de entorno");
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options) => fetchWithTimeout(url, options, 5000),
    },
  });
};
