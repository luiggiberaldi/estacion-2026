"use client";

// Contexto de autenticación del lado cliente.
// La verificación de credenciales vive SOLO en el servidor
// (src/lib/auth-actions.ts): aquí no hay claves ni hashes.

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { loginAction, logoutAction, getSessionUser, type AdminSessionUser } from "./auth-actions";

interface AuthContextValue {
  user: AdminSessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSessionUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (pin: string) => {
    const res = await loginAction(pin);
    if (res.ok) {
      try {
        setUser(await getSessionUser());
      } catch {
        setUser(null);
      }
    }
    return res;
  }, []);

  const logout = useCallback(() => {
    logoutAction().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
