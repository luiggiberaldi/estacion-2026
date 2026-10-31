// src/lib/require-admin.ts — Guardia de sesión para las acciones del servidor.
//
// Las server actions ("use server") son endpoints POST públicos: cualquiera que
// conozca su id puede invocarlas, con o sin middleware. Como usan la llave
// service-role de Supabase, CADA acción exportada debe llamar a requireAdmin()
// antes de tocar la base. Fail-closed: sin ADMIN_SESSION_SECRET nadie pasa.

import { requireSessionEmail } from "./auth-actions";

export async function requireAdmin(): Promise<string> {
  const email = await requireSessionEmail();
  if (!email) throw new Error("No autorizado: inicia sesión en la Estación.");
  return email;
}
