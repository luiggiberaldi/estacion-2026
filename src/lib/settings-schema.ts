// Ajustes de la Estación: tipos, valores por defecto y validación.
//
// Módulo puro (sin acceso a la base): lo usan el servidor (settings-store.ts,
// settings-actions.ts) y la vista de Ajustes. Los valores por defecto salen de
// licensePolicy.js, el mismo módulo que usan las cajas: si la tabla
// station_settings aún no existe (migración 006 sin aplicar), todo se comporta
// exactamente como antes.

import {
  DEMO_DURATION_DAYS,
  MONTHLY_GRACE_DAYS,
  PRODUCT_PRICES,
} from "./licensePolicy";

/** Productos con precio editable (Pro está pausado y no se vende). */
export const SETTINGS_PRODUCT_IDS = ["bodega", "farmacia"] as const;
export type SettingsProductId = (typeof SETTINGS_PRODUCT_IDS)[number];

export function isSettingsProductId(v: unknown): v is SettingsProductId {
  return SETTINGS_PRODUCT_IDS.includes(v as SettingsProductId);
}

export interface ProductTerms {
  /** Precio de la licencia permanente (USD, pago único). */
  permanent: number;
  /** Precio de la mensualidad (USD). */
  monthly: number;
  /** Días de la demo automática que la caja activa al instalarse. */
  demoDays: number;
  /** Días que suma la Estación al extender o regalar una demo. */
  demoExtensionDays: number;
  /** Días de gracia tras vencer una mensualidad antes de bloquear la caja. */
  monthlyGraceDays: number;
}

export interface ContactSettings {
  businessName: string;
  /** Solo dígitos, con código de país (p. ej. 584141234567). */
  whatsapp: string;
  email: string;
  /** Datos de pago que se pegan en los mensajes ({pago}). */
  paymentInfo: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  description: string;
  body: string;
}

export interface StationSettings {
  products: Record<SettingsProductId, ProductTerms>;
  contact: ContactSettings;
  templates: MessageTemplate[];
}

/** Marcadores que entienden las plantillas, con su explicación para la UI. */
export const TEMPLATE_PLACEHOLDERS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "{nombre}", label: "Nombre o alias del cliente" },
  { key: "{producto}", label: "Nombre del producto (Lite, Farmacia)" },
  { key: "{licencia}", label: "Tipo de licencia" },
  { key: "{equipo}", label: "ID del equipo" },
  { key: "{vencimiento}", label: "Fecha de vencimiento" },
  { key: "{dias}", label: "Días que faltan" },
  { key: "{precio}", label: "Precio permanente del producto" },
  { key: "{mensual}", label: "Precio mensual del producto" },
  { key: "{demo}", label: "Días de la demo automática" },
  { key: "{pago}", label: "Datos de pago (Ajustes → Contacto)" },
  { key: "{negocio}", label: "Tu nombre comercial" },
];

export const DEFAULT_TEMPLATES: ReadonlyArray<MessageTemplate> = Object.freeze([
  {
    id: "bienvenida",
    title: "Licencia activada",
    description: "Dar la bienvenida tras activar",
    body: "¡Hola {nombre}! 👋\nTu licencia {licencia} de {producto} ya está activa en tu equipo {equipo}.\nCualquier duda con la app, respóndeme por aquí.\n¡A vender! 💪",
  },
  {
    id: "demo_vence",
    title: "Demo por vencer",
    description: "Recordatorio antes de que expire la prueba",
    body: "¡Hola {nombre}! 👋\nTe escribo de {negocio}: tu período de prueba de {producto} vence en {dias} ({vencimiento}).\nSi quieres seguir usando la app sin interrupciones, activa tu licencia permanente por {precio} (pago único).\n¿Te la activo?",
  },
  {
    id: "demo_vencida",
    title: "Demo vencida",
    description: "La prueba terminó, ofrecer licencia",
    body: "¡Hola {nombre}! 👋\nTu prueba de {producto} terminó el {vencimiento}.\nPara reactivar tu equipo {equipo}, la licencia permanente cuesta {precio} (pago único, sin mensualidades).\n¿La activamos?",
  },
  {
    id: "pago_recibido",
    title: "Pago recibido",
    description: "Confirmar pago de licencia permanente",
    body: "¡Hola {nombre}! ✅\nPago recibido. Tu licencia permanente de {producto} ya está activa en tu equipo {equipo} (pago único, sin mensualidades).\n¡Gracias por tu confianza! 🙌",
  },
  {
    id: "sin_licencia",
    title: "Primer contacto",
    description: "Equipo registrado sin licencia activa",
    body: "¡Hola {nombre}! 👋\nVi que registraste {producto} en tu equipo {equipo} pero aún no tienes licencia activa.\nTienes {demo} días de prueba gratis. ¿Quieres que te ayude a activarla?",
  },
  {
    id: "mensualidad",
    title: "Cobro de mensualidad",
    description: "Recordar el pago mensual",
    body: "¡Hola {nombre}! 👋\nTu mensualidad de {producto} ({mensual}) vence el {vencimiento}.\nPuedes pagar aquí:\n{pago}\n¡Gracias!",
  },
] satisfies MessageTemplate[]);

function defaultTerms(id: SettingsProductId): ProductTerms {
  return {
    permanent: PRODUCT_PRICES[id].permanent,
    monthly: PRODUCT_PRICES[id].monthly,
    demoDays: DEMO_DURATION_DAYS.demo3,
    demoExtensionDays: DEMO_DURATION_DAYS.demo7,
    monthlyGraceDays: MONTHLY_GRACE_DAYS,
  };
}

export function defaultSettings(): StationSettings {
  return {
    products: { bodega: defaultTerms("bodega"), farmacia: defaultTerms("farmacia") },
    contact: { businessName: "PreciosAlDía", whatsapp: "", email: "", paymentInfo: "" },
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
  };
}

// ── Validación ──────────────────────────────────────────────────────────────

export const LIMITS = {
  price: { min: 0, max: 100000 },
  demoDays: { min: 1, max: 30 },
  demoExtensionDays: { min: 1, max: 90 },
  monthlyGraceDays: { min: 0, max: 30 },
  text: 120,
  paymentInfo: 500,
  templateTitle: 60,
  templateDescription: 120,
  templateBody: 2000,
  templates: 20,
} as const;

export class SettingsValidationError extends Error {}

function num(raw: unknown, field: string, { min, max }: { min: number; max: number }, integer: boolean): number {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new SettingsValidationError(`${field}: debe ser un número.`);
  }
  if (integer && !Number.isInteger(n)) {
    throw new SettingsValidationError(`${field}: debe ser un número entero.`);
  }
  if (n < min || n > max) {
    throw new SettingsValidationError(`${field}: debe estar entre ${min} y ${max}.`);
  }
  // Precios con a lo sumo 2 decimales.
  return integer ? n : Math.round(n * 100) / 100;
}

function text(raw: unknown, field: string, max: number): string {
  if (raw == null) return "";
  if (typeof raw !== "string") throw new SettingsValidationError(`${field}: debe ser texto.`);
  const v = raw.trim();
  if (v.length > max) throw new SettingsValidationError(`${field}: máximo ${max} caracteres.`);
  return v;
}

const PRODUCT_LABEL: Record<SettingsProductId, string> = { bodega: "Lite", farmacia: "Farmacia" };

/**
 * Valida y normaliza un objeto de ajustes completo. Lanza
 * SettingsValidationError con un mensaje en español si algo no cuadra.
 */
export function validateSettings(input: unknown): StationSettings {
  if (!input || typeof input !== "object") throw new SettingsValidationError("Ajustes inválidos.");
  const src = input as Partial<Record<keyof StationSettings, unknown>>;
  const productsSrc = (src.products ?? {}) as Record<string, Record<string, unknown> | undefined>;

  const products = {} as Record<SettingsProductId, ProductTerms>;
  for (const id of SETTINGS_PRODUCT_IDS) {
    const p = productsSrc[id];
    if (!p) throw new SettingsValidationError(`Faltan los ajustes de ${PRODUCT_LABEL[id]}.`);
    const label = PRODUCT_LABEL[id];
    products[id] = {
      permanent: num(p.permanent, `${label} · precio permanente`, LIMITS.price, false),
      monthly: num(p.monthly, `${label} · precio mensual`, LIMITS.price, false),
      demoDays: num(p.demoDays, `${label} · días de demo`, LIMITS.demoDays, true),
      demoExtensionDays: num(p.demoExtensionDays, `${label} · días al extender demo`, LIMITS.demoExtensionDays, true),
      monthlyGraceDays: num(p.monthlyGraceDays, `${label} · días de gracia`, LIMITS.monthlyGraceDays, true),
    };
  }

  const c = (src.contact ?? {}) as Record<string, unknown>;
  const whatsapp = text(c.whatsapp, "WhatsApp", LIMITS.text).replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) {
    throw new SettingsValidationError("WhatsApp: escribe el número con código de país (p. ej. 584141234567).");
  }
  const email = text(c.email, "Correo", LIMITS.text);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SettingsValidationError("Correo: no parece un correo válido.");
  }
  const contact: ContactSettings = {
    businessName: text(c.businessName, "Nombre comercial", LIMITS.text) || "PreciosAlDía",
    whatsapp,
    email,
    paymentInfo: text(c.paymentInfo, "Datos de pago", LIMITS.paymentInfo),
  };

  const tSrc = Array.isArray(src.templates) ? src.templates : [];
  if (tSrc.length > LIMITS.templates) {
    throw new SettingsValidationError(`Máximo ${LIMITS.templates} plantillas.`);
  }
  const seen = new Set<string>();
  const templates: MessageTemplate[] = tSrc.map((raw, i) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const id = text(t.id, `Plantilla ${i + 1} · id`, 40).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!id) throw new SettingsValidationError(`Plantilla ${i + 1}: falta el identificador.`);
    if (seen.has(id)) throw new SettingsValidationError(`Plantilla repetida: ${id}.`);
    seen.add(id);
    const title = text(t.title, `Plantilla ${i + 1} · título`, LIMITS.templateTitle);
    const body = text(t.body, `Plantilla "${title || id}" · texto`, LIMITS.templateBody);
    if (!title) throw new SettingsValidationError(`Plantilla ${i + 1}: falta el título.`);
    if (!body) throw new SettingsValidationError(`Plantilla "${title}": el texto está vacío.`);
    return {
      id,
      title,
      description: text(t.description, `Plantilla "${title}" · descripción`, LIMITS.templateDescription),
      body,
    };
  });
  if (templates.length === 0) throw new SettingsValidationError("Debe quedar al menos una plantilla.");

  return { products, contact, templates };
}

/**
 * Convierte lo guardado en la base (posiblemente parcial o de una versión
 * anterior) en ajustes completos, rellenando con los valores por defecto. Nunca
 * lanza: un dato raro en la base no debe tumbar la Estación.
 */
export function mergeWithDefaults(stored: unknown): StationSettings {
  const base = defaultSettings();
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Record<string, unknown>;

  const products = { ...base.products };
  const sp = (s.products ?? {}) as Record<string, Record<string, unknown> | undefined>;
  for (const id of SETTINGS_PRODUCT_IDS) {
    const p = sp[id];
    if (!p) continue;
    const merged = { ...base.products[id] };
    for (const k of Object.keys(merged) as (keyof ProductTerms)[]) {
      const v = Number(p[k]);
      if (p[k] != null && Number.isFinite(v) && v >= 0) merged[k] = v;
    }
    products[id] = merged;
  }

  const sc = (s.contact ?? {}) as Record<string, unknown>;
  const contact = { ...base.contact };
  for (const k of Object.keys(contact) as (keyof ContactSettings)[]) {
    if (typeof sc[k] === "string") contact[k] = sc[k] as string;
  }
  if (!contact.businessName) contact.businessName = base.contact.businessName;

  // Plantillas: lista guardada (array) o, si no hay, las de fábrica.
  let templates = base.templates;
  if (Array.isArray(s.templates) && s.templates.length > 0) {
    const valid = (s.templates as unknown[]).filter(
      (t): t is MessageTemplate =>
        !!t && typeof t === "object" &&
        typeof (t as MessageTemplate).id === "string" &&
        typeof (t as MessageTemplate).title === "string" &&
        typeof (t as MessageTemplate).body === "string"
    ).map((t) => ({ ...t, description: typeof t.description === "string" ? t.description : "" }));
    if (valid.length > 0) templates = valid;
  }

  return { products, contact, templates };
}

/** Términos de un producto; para productos sin ajustes (Pro) usa licensePolicy. */
export function termsFor(settings: StationSettings, productId: string): ProductTerms {
  if (isSettingsProductId(productId)) return settings.products[productId];
  const prices = (PRODUCT_PRICES as Record<string, { permanent: number; monthly: number }>)[productId];
  return {
    permanent: prices?.permanent ?? 0,
    monthly: prices?.monthly ?? 0,
    demoDays: DEMO_DURATION_DAYS.demo3,
    demoExtensionDays: DEMO_DURATION_DAYS.demo7,
    monthlyGraceDays: MONTHLY_GRACE_DAYS,
  };
}

// ── PIN ─────────────────────────────────────────────────────────────────────

/** PINs que se adivinan al primer intento: no se aceptan como PIN nuevo. */
export function weakPinReason(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "El PIN debe tener exactamente 6 dígitos.";
  if (/^(\d)\1{5}$/.test(pin)) return "No uses el mismo dígito repetido.";
  const asc = "0123456789012345";
  const desc = "9876543210987654";
  if (asc.includes(pin) || desc.includes(pin)) return "No uses dígitos seguidos (123456, 654321…).";
  return null;
}
