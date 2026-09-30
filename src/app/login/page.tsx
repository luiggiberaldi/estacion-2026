import { AuthProvider } from "@/lib/auth-context";
import { LoginView } from "@/components/login-view";

export const metadata = {
  title: "Acceso — Estación Maestra",
};

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginView />
    </AuthProvider>
  );
}
