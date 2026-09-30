// Catálogo de productos comerciales de PreciosAlDía.
//
// - `bodega` → PreciosAlDía Lite (un solo dispositivo, pago único).
// - `pro`    → PreciosAlDía Pro (multi-negocio; mensualidad o pago único).
//
// El discriminador `product_id` ya existe en la tabla `licenses` de Supabase;
// este catálogo es la única fuente de verdad del lado de la estación.

export const PRODUCTS = [
  { id: "bodega", name: "PreciosAlDía Lite", short: "Lite" },
  { id: "pro", name: "PreciosAlDía Pro", short: "Pro" },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

export function isProductId(v: unknown): v is ProductId {
  return v === "bodega" || v === "pro";
}

export function productName(id: ProductId): string {
  return PRODUCTS.find((p) => p.id === id)?.name ?? id;
}

/**
 * Precios de referencia en USD para el estimado de ingresos del dashboard.
 * Lite conserva los valores históricos ($80 permanente / $15 mensual).
 * TODO(luigi): definir precios oficiales de Pro (permanente y mensualidad).
 */
export const PRODUCT_PRICES: Record<ProductId, { permanent: number; monthly: number }> = {
  bodega: { permanent: 80, monthly: 15 },
  pro: { permanent: 0, monthly: 0 },
};
