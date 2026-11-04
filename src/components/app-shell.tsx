"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Briefcase, FileText, Home, Loader2, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrandTheme } from "@/components/brand-theme";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncNow } from "@/lib/sync";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/panel", label: "Inicio", icon: Home },
  { href: "/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/trabajos", label: "Trabajos", icon: Briefcase },
  { href: "/perfil", label: "Perfil", icon: User },
];

function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-7 animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

function useBackgroundSync() {
  useEffect(() => {
    const sync = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

/** Aviso fino arriba de todo: sin conexión o con cambios esperando subir. */
function SyncBanner() {
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const failed = useLiveQuery(() => db.outbox.filter((entry) => Boolean(entry.error)).count(), [], 0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (failed > 0) {
    return (
      <Link href="/perfil" className="block bg-destructive px-4 py-1.5 text-center text-xs font-medium text-white">
        {failed === 1 ? "1 cambio no se pudo guardar" : `${failed} cambios no se pudieron guardar`}. Tocá para ver.
      </Link>
    );
  }
  if (!online) {
    return (
      <p className="bg-foreground px-4 py-1.5 text-center text-xs font-medium text-background">
        Sin conexión. Podés seguir trabajando{pending > 0 ? ` (${pending} por subir)` : ""}.
      </p>
    );
  }
  return null;
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Primer ingreso en este equipo: hasta bajar el perfil no hay nada que mostrar. */
function FirstLoad() {
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const result = await syncNow();
    if (result === "offline") setFailed(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!failed) return <FullPageSpinner label="Preparando tu cuenta…" />;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-muted-foreground">No pudimos cargar tu cuenta. Necesitás conexión para el primer ingreso.</p>
      <Button onClick={load}>Reintentar</Button>
    </div>
  );
}

function Guarded({ children, requireOnboarding }: { children: ReactNode; requireOnboarding: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  // undefined: IndexedDB todavía no respondió. null: falta bajar el perfil del servidor.
  const professional = useLiveQuery(
    async () => (await db.professionals.toCollection().first()) ?? null,
    [],
  );

  const needsOnboarding = professional ? !professional.onboarded_at : false;

  useEffect(() => {
    if (auth.status === "signed-out") router.replace("/login");
    else if (requireOnboarding && needsOnboarding) router.replace("/onboarding");
  }, [auth.status, needsOnboarding, requireOnboarding, router]);

  if (auth.status !== "signed-in" || professional === undefined) return <FullPageSpinner />;
  if (professional === null) return <FirstLoad />;
  if (requireOnboarding && needsOnboarding) return <FullPageSpinner />;
  return <>{children}</>;
}

/** Marco de las pantallas privadas. El control de sesión es del lado del cliente porque
 *  tiene que funcionar sin red; lo que protege los datos de verdad es RLS. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Guarded requireOnboarding>
        <ShellChrome>{children}</ShellChrome>
      </Guarded>
    </AuthProvider>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  useBackgroundSync();
  // El editor de presupuestos tiene su propia barra fija con el total y las acciones.
  const hideNav = usePathname() === "/presupuestos/editar";
  return (
    <>
      <BrandTheme />
      <SyncBanner />
      <div className="pb-nav mx-auto max-w-2xl">{children}</div>
      {!hideNav && <BottomNav />}
    </>
  );
}

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Guarded requireOnboarding={false}>
        <BrandTheme />
        {children}
      </Guarded>
    </AuthProvider>
  );
}

export function PageHeader({ title, action, back }: { title: string; action?: ReactNode; back?: ReactNode }) {
  return (
    <header className="flex min-h-16 items-center gap-2 px-4 pt-2">
      {back}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mx-4 mt-6 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
