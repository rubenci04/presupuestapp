import { AuthPage, LoginForm } from "@/components/auth-form";

export const metadata = { title: "Iniciar sesión · PresupuestApp" };

export default function Page() {
  return (
    <AuthPage title="Entrá a tu cuenta">
      <LoginForm />
    </AuthPage>
  );
}
