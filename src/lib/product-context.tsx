"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProductId } from "@/lib/products";

interface ProductContextValue {
  productId: ProductId;
  setProductId: (p: ProductId) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/**
 * Producto seleccionado globalmente en la estación (Lite / Pro).
 * Las vistas de licencias, demos, mensualidades y dashboard filtran por él.
 * Backups y Dispositivos quedan globales en v1 (son del ecosistema Lite;
 * los backups Pro se integran en una fase posterior).
 */
export function ProductProvider({ children }: { children: ReactNode }) {
  const [productId, setProductId] = useState<ProductId>("bodega");
  return (
    <ProductContext.Provider value={{ productId, setProductId }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProduct debe usarse dentro de <ProductProvider>");
  return ctx;
}
