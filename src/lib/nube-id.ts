// Reconocer de qué sistema es un ID de equipo.
//
// - Precios al Día (Bodega / Farmacia): `PDA-XXXXXXXX…` → licencias en la tabla
//   `licenses` del Supabase de la Estación.
// - Precios al Día Nube: `PDN-` + 32 hex (lo genera `register_device` en el
//   Supabase de la nube). Su licencia NO es del equipo sino de la cuenta
//   (`account_licenses`), y vive en otro Supabase.
//
// Módulo puro: lo usan la UI, las server actions y las pruebas.

export const NUBE_DEVICE_ID_RE = /^PDN-[0-9A-F]{32}$/;

export type StationIdKind = "nube" | "clasico" | "desconocido";

/** Normaliza lo que se pega o escribe: sin espacios y en mayúsculas. */
export function normalizeDeviceId(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, "").toUpperCase() : "";
}

/** ¿Es un ID completo y válido de un equipo de la Nube? */
export function isNubeDeviceId(raw: unknown): boolean {
  return NUBE_DEVICE_ID_RE.test(normalizeDeviceId(raw));
}

/** ¿Parece de la Nube (empieza por PDN-) aunque esté incompleto? */
export function looksLikeNubeId(raw: unknown): boolean {
  return normalizeDeviceId(raw).startsWith("PDN-");
}

export function classifyDeviceId(raw: unknown): StationIdKind {
  const id = normalizeDeviceId(raw);
  if (id.startsWith("PDN-")) return "nube";
  if (id.length > 0) return "clasico";
  return "desconocido";
}
