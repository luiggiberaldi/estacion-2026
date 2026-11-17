// Reglas puras del freno de login (sin Next ni Supabase, para poder probarlas).

/**
 * ¿La IP está en ADMIN_BREAKGLASS_IPS? Lista separada por comas, coincidencia
 * exacta (sin rangos). Es el plan B para entrar desde un equipo nuevo mientras
 * alguien fuerza el tope global. Vacía o sin definir = nadie.
 */
export function isBreakglassIp(ip: string, envValue: string | undefined | null): boolean {
  if (!ip || ip === "unknown" || !envValue) return false;
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ip.trim());
}
