"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { PRODUCT_LITE, isAvailableProductId, type ProductId } from "@/lib/products";

interface ProductContextValue {
  productId: ProductId;
  setProductId: (p: ProductId) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/**
 * Producto seleccionado globalmente en la estación.
 * Solo se aceptan productos disponibles (Lite y Farmacia); PRO permanece en el
 * modelo pero pausado hasta terminar su integración y su aislamiento de datos.
 */
export function ProductProvider({ children }: { children: ReactNode }) {
  const [productId, setProductId] = useState<ProductId>(PRODUCT_LITE.id);
  const setAvailableProductId = (next: ProductId) => {
    if (isAvailableProductId(next)) setProductId(next);
  };
  return (
    <ProductContext.Provider value={{ productId, setProductId: setAvailableProductId }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProduct debe usarse dentro de <ProductProvider>");
  return ctx;
}
