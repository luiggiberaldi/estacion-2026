"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface AdminUser {
  email: string;
  name: string;
  role: "superadmin" | "operator";
}

interface AuthContextValue {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "em_admin_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUser(JSON.parse(saved) as AdminUser);
      }
    } catch {
      /* no-op */
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 600));
    const normalizedEmail = (email || "").trim().toLowerCase();
    const isTargetEmail = normalizedEmail === "luiggiberaldi94@gmial.com" || normalizedEmail === "luiggiberaldi94@gmail.com";
    if (isTargetEmail && password === "24457713") {
      const u: AdminUser = { email: normalizedEmail, name: "Luiggi Beraldi", role: "superadmin" };
      setUser(u);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      } catch {
        /* no-op */
      }
      return { ok: true };
    }
    return { ok: false, error: "Credenciales incorrectas" };
  };


  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* no-op */
    }
  };

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
