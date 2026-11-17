// Códigos de vinculación de respaldo (lógica pura, sin I/O).
//
// El admin genera en la Estación un código corto para UN equipo; el dueño lo
// escribe en su caja y la caja lo canjea por su credencial de respaldo.
// Ver docs/migrations/008-codigos-vinculacion-respaldo.sql.
//
// - 8 caracteres de un alfabeto sin confusiones (sin 0/O, 1/I/L, U).
//   30^8 ≈ 6,5·10^11 combinaciones; con 15 min de vida, un solo uso y freno de
//   intentos, adivinarlo no es viable.
// - Se muestra como "ABCD-EFGH"; se acepta con o sin guion, en minúsculas o
//   con espacios.
// - Solo se guarda su sha256.

import { createHash, randomInt } from "node:crypto";

export const CLAIM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CLAIM_CODE_LENGTH = 8;
export const CLAIM_TTL_MS = 15 * 60 * 1000;

/** Genera un código nuevo (sin guion). */
export function generateClaimCode(): string {
  let out = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    out += CLAIM_CODE_ALPHABET[randomInt(CLAIM_CODE_ALPHABET.length)];
  }
  return out;
}

/** "ABCDEFGH" → "ABCD-EFGH" (solo para mostrar). */
export function formatClaimCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Normaliza lo que escribe la persona: quita espacios y guiones y pasa a
 * mayúsculas. Devuelve null si no es un código con forma válida.
 */
export function normalizeClaimCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]+/g, "").toUpperCase();
  if (code.length !== CLAIM_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!CLAIM_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

export function hashClaimCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}
