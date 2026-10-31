// Catálogo de productos comerciales de PreciosAlDía.
//
// - `bodega`   → PreciosAlDía Lite (un solo dispositivo, pago único).
// - `farmacia` → PreciosAlDía Farmacia (otra versión del sistema: su propia app y
//                su propia nube de datos; aquí solo se emiten sus licencias).
// - `pro`      → PreciosAlDía Pro (multi-negocio; mensualidad o pago único).
//
// El discriminador `product_id` ya existe en la tabla `licenses` de Supabase;
// este catálogo es la única fuente de verdad del lado de la estación.

import { PRODUCT_PRICES as LICENSE_PRODUCT_PRICES } from "./licensePolicy";

export const PRODUCT_LITE = { id: "bodega", name: "PreciosAlDía Lite", short: "Lite" } as const;

// PRO queda preservado para reactivarlo después, pero no se ofrece en la UI por ahora.
export const PRODUCT_PRO = { id: "pro", name: "PreciosAlDía Pro", short: "Pro" } as const;
export const PRODUCT_FARMACIA = { id: "farmacia", name: "PreciosAlDía Farmacia", short: "Farmacia" } as const;
export const PRODUCTS = [PRODUCT_LITE, PRODUCT_FARMACIA, PRODUCT_PRO] as const;
// Fuente única para las opciones ofrecidas en la UI mientras PRO está pausado.
export const AVAILABLE_PRODUCTS = [PRODUCT_LITE, PRODUCT_FARMACIA] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

export function isProductId(v: unknown): v is ProductId {
  return v === "bodega" || v === "farmacia" || v === "pro";
}

/** ¿El producto se ofrece hoy en la UI? (Pro sigue en el modelo, pausado.) */
export function isAvailableProductId(v: unknown): v is ProductId {
  return AVAILABLE_PRODUCTS.some((p) => p.id === v);
}

/**
 * ¿La Estación llega a la nube de datos de este producto?
 *
 * Lite vive en el mismo proyecto Supabase que la Estación, así que las acciones
 * que escriben en esa nube (pedir respaldos, recarga remota) le llegan. Farmacia
 * tiene su propia nube: esas acciones no le llegarían, y se desactivan en vez de
 * fallar en silencio. Las licencias de todos los productos sí viven aquí.
 */
export function sharesStationCloud(id: ProductId): boolean {
  return id === "bodega";
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
