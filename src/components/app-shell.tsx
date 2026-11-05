"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Briefcase, FileText, Home, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BrandTheme } from "@/components/brand-theme";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/panel", label: "Inicio", icon: Home },
  // El guion invisible deja partir la palabra en "Presu-puestos" solo si no entra en pantallas angostas.
  { href: "/presupuestos", label: "Presu­puestos", name: "Presupuestos", icon: FileText },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/trabajos", label: "Trabajos", icon: Briefcase },
];

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Loader2 className="size-8 animate-spin" aria-label="Cargando" />
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={"name" in rest ? rest.name : label}
                className={cn(
                  "flex h-20 flex-col items-center justify-start gap-1 px-1 pt-2 text-center text-base leading-tight font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Marco de las pantallas de la app. No hay login: si todavía no se cargó el perfil de este
 * equipo, manda a la bienvenida.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  // undefined: IndexedDB todavía no respondió. null: primer uso.
  const professional = useLiveQuery(async () => (await db.professionals.toCollection().first()) ?? null, []);
  // El editor de presupuestos tiene su propia barra fija con el total y las acciones.
  const hideNav = usePathname() === "/presupuestos/editar";

  const needsWelcome = professional === null || (professional !== undefined && !professional.onboarded_at);

  useEffect(() => {
    if (needsWelcome) router.replace("/bienvenida");
  }, [needsWelcome, router]);

  if (professional === undefined || needsWelcome) return <FullPageSpinner />;

  return (
    <>
      <BrandTheme />
      <div className="pb-nav mx-auto max-w-2xl">{children}</div>
      {!hideNav && <BottomNav />}
    </>
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
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
