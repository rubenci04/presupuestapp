import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión · PresupuestApp" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <WifiOff className="size-9 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="text-muted-foreground">
        Esta pantalla todavía no está disponible sin internet. Volvé a intentar cuando tengas señal.
      </p>
    </main>
  );
}
