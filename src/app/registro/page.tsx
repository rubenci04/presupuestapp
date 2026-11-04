import { AuthPage, RegisterForm } from "@/components/auth-form";

export const metadata = { title: "Crear cuenta · PresupuestApp" };

export default function Page() {
  return (
    <AuthPage title="Creá tu cuenta" subtitle="En 2 minutos tenés tu primer presupuesto listo.">
      <RegisterForm />
    </AuthPage>
  );
}
