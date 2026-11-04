import { AuthPage, RecoverForm } from "@/components/auth-form";

export const metadata = { title: "Recuperar contraseña · PresupuestApp" };

export default function Page() {
  return (
    <AuthPage title="Recuperá tu contraseña" subtitle="Te mandamos un link por email.">
      <RecoverForm />
    </AuthPage>
  );
}
