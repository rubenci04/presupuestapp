import { OnboardingShell } from "@/components/app-shell";

export const metadata = { title: "Configurá tu cuenta · PresupuestApp" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell>{children}</OnboardingShell>;
}
