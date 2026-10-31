"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getStationSettings } from "@/lib/settings-actions";
import { defaultSettings, termsFor, type ProductTerms, type StationSettings } from "@/lib/settings-schema";

interface SettingsContextValue {
  settings: StationSettings;
  /** false = falta la migración 006: se muestran los valores por defecto. */
  available: boolean;
  updatedAt: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  terms: (productId: string) => ProductTerms;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Ajustes de la Estación para las vistas (precios, días, contacto, plantillas).
 * Mientras cargan se usan los valores por defecto de licensePolicy.js, así
 * ninguna vista queda en blanco.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StationSettings>(defaultSettings);
  const [available, setAvailable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStationSettings();
      setSettings(res.settings);
      setAvailable(res.available);
      setUpdatedAt(res.updatedAt);
    } catch (e) {
      console.warn("[settings] no se pudieron cargar los ajustes:", (e as Error)?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const terms = useCallback((productId: string) => termsFor(settings, productId), [settings]);

  return (
    <SettingsContext.Provider value={{ settings, available, updatedAt, loading, refresh, terms }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings debe usarse dentro de <SettingsProvider>");
  return ctx;
}
