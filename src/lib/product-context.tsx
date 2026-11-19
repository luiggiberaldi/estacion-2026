"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { PRODUCT_LITE, isAvailableProductId, type ProductId } from "@/lib/products";

/**
 * Sistema que se administra en la Estación:
 * - "clasico": Precios al Día Bodega / Farmacia (licencia por dispositivo, Supabase de la Estación).
 * - "nube": Precios al Día Nube (licencia por cuenta, Supabase propio de la nube).
 */
export type StationSystem = "clasico" | "nube";

interface ProductContextValue {
  productId: ProductId;
  setProductId: (p: ProductId) => void;
  system: StationSystem;
  setSystem: (s: StationSystem) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/**
 * Producto seleccionado globalmente en la estación.
 * Solo se aceptan productos disponibles (Lite y Farmacia); PRO permanece en el
 * modelo pero pausado hasta terminar su integración y su aislamiento de datos.
 * La Nube no es un `ProductId` (no vive en la tabla `licenses`): es otro sistema.
 */
export function ProductProvider({ children }: { children: ReactNode }) {
  const [productId, setProductId] = useState<ProductId>(PRODUCT_LITE.id);
  const [system, setSystem] = useState<StationSystem>("clasico");
  const setAvailableProductId = (next: ProductId) => {
    if (isAvailableProductId(next)) setProductId(next);
  };
  return (
    <ProductContext.Provider value={{ productId, setProductId: setAvailableProductId, system, setSystem }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProduct debe usarse dentro de <ProductProvider>");
  return ctx;
}
