// src/middleware.ts — Puerta de autenticación de la Estación.
//
// - `/api/backup/*`: PÚBLICO para el middleware. Son los endpoints que los POS
//   en campo consumen con su propio secreto (`x-backup-secret`, fail-closed
//   401). Los equipos no tienen cookie de sesión admin y no deben pedirla.
// - `/api/track`: beacon PÚBLICO de visitas (registra a quien abre el link,
//   incluso antes del login).
// - `/login`, `/_next/*`, estáticos: públicos.
// - Todo lo demás: exige cookie de sesión firmada válida; si no, → /login.
//   Fail-closed: sin ADMIN_SESSION_SECRET configurado, nadie entra.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Si entra a /login, redirigir directo al panel
  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
