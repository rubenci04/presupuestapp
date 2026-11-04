import { AuthPage, NewPasswordForm } from "@/components/auth-form";

export const metadata = { title: "Nueva contraseña · PresupuestApp" };

export default function Page() {
  return (
    <AuthPage title="Elegí una contraseña nueva">
      <NewPasswordForm />
    </AuthPage>
  );
}
