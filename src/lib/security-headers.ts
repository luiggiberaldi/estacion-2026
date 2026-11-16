// Cabeceras de seguridad de la Estación (las aplica next.config.ts a todas las rutas).
//
// Lógica pura y sin dependencias para poder probarla sin levantar Next.
// - frame-ancestors / X-Frame-Options: nadie puede meter el panel en un iframe
//   ajeno (clickjacking).
// - nosniff: el navegador no adivina tipos de archivo.
// - Referrer-Policy: no se filtran rutas internas a otros sitios.
// - Permissions-Policy: la cámara se permite solo aquí (escáner QR, html5-qrcode);
//   micrófono y ubicación, nunca.
// - HSTS solo en producción: en localhost por HTTP rompería el desarrollo.
//
// No se añade una CSP completa (script-src con nonces) a propósito: requiere
// pasar el nonce por el proxy y probar cada vista. Va aparte, primero en modo
// Report-Only.
//
// Estas cabeceras NO pisan el CORS de /api/backup/* (backup-auth.ts pone otras).

export interface HeaderPair {
  key: string;
  value: string;
}

export function securityHeaders(isProduction: boolean): HeaderPair[] {
  const headers: HeaderPair[] = [
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ];
  if (isProduction) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}
