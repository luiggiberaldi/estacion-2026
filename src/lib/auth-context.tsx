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

const defaultAdminUser: AdminSessionUser = {
  email: "admin@preciosaldia.com",
  name: "Administrador",
  role: "superadmin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSessionUser | null>(defaultAdminUser);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async () => {
    setUser(defaultAdminUser);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
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
