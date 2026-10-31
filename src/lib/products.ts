// Catálogo de productos comerciales de PreciosAlDía.
//
// - `bodega` → PreciosAlDía Lite (un solo dispositivo, pago único).
// - `pro`    → PreciosAlDía Pro (multi-negocio; mensualidad o pago único).
//
// El discriminador `product_id` ya existe en la tabla `licenses` de Supabase;
// este catálogo es la única fuente de verdad del lado de la estación.

import { PRODUCT_PRICES as LICENSE_PRODUCT_PRICES } from "./licensePolicy";

export const PRODUCT_LITE = { id: "bodega", name: "PreciosAlDía Lite", short: "Lite" } as const;

// PRO queda preservado para reactivarlo después, pero no se ofrece en la UI por ahora.
export const PRODUCT_PRO = { id: "pro", name: "PreciosAlDía Pro", short: "Pro" } as const;
export const PRODUCTS = [PRODUCT_LITE, PRODUCT_PRO] as const;
// Fuente única para las opciones ofrecidas en la UI mientras PRO está pausado.
export const AVAILABLE_PRODUCTS = [PRODUCT_LITE] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

export function isProductId(v: unknown): v is ProductId {
  return v === "bodega" || v === "pro";
}

export function productName(id: ProductId): string {
  return PRODUCTS.find((p) => p.id === id)?.name ?? id;
}

/**
 * Precios de venta en USD por producto y plan.
 *
 * Única fuente de verdad: `licensePolicy.js` (compartido byte a byte con la
 * caja/POS). Lite cuesta $100 permanente y $10 mensual; los textos de venta y
 * el estimado de ingresos del dashboard derivan de aquí (antes la UI anunciaba
 * $50 y el dashboard contaba $80).
 *
 * `pro` queda en 0 mientras el producto esté pausado: no inventar ingresos.
 */
export const PRODUCT_PRICES = LICENSE_PRODUCT_PRICES;
