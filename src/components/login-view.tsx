"use client";

import { useState, type FormEvent } from "react";
import { Shield, Lock, Mail, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";

export function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError("El PIN debe tener 6 dígitos.");
      return;
    }
    setIsLoading(true);
    const result = await login(email, pin);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error || "Error al iniciar sesión");
      return;
    }
    // La cookie httpOnly ya quedó seteada por la server action; recarga
    // completa para que el middleware la valide en la navegación.
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-background to-secondary/30 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md shadow-tone-lg border-border/60 relative z-10">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="size-8 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-display">Estación Maestra</CardTitle>
            <CardDescription className="text-sm">
              Panel de administración · Precios al Día Bodega
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Correo electrónico
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@preciosaldia.com"
                  className="pl-10 h-12"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className="pl-10 h-12 tracking-[0.3em] text-center text-lg font-semibold"
                  required
                  autoComplete="one-time-code"
                  minLength={6}
                  maxLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-sm font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Verificando...
                </>
              ) : (
                "Ingresar al panel"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
