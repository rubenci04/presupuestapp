"use client";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearLocalData, db, getKv, setKv } from "./db";
import { getSupabase } from "./supabase";
import { syncNow } from "./sync";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string };

const AuthContext = createContext<AuthState>({ status: "loading" });

export const useAuth = () => useContext(AuthContext);

const OWNER_KEY = "ownerUserId";

/** Si en este equipo entra otro usuario, no debe ver los datos locales del anterior. */
async function claimLocalData(userId: string, email: string) {
  const owner = await getKv<string>(OWNER_KEY);
  if (owner && owner !== userId) await clearLocalData();
  await setKv(OWNER_KEY, userId);
  await setKv("ownerEmail", email);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    async function apply(user: { id: string; email?: string } | null) {
      if (!user) {
        if (!cancelled) setState({ status: "signed-out" });
        return;
      }
      const email = user.email ?? "";
      await claimLocalData(user.id, email);
      if (!cancelled) setState({ status: "signed-in", userId: user.id, email });
      void syncNow();
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (data.session) return apply(data.session.user);
      // Token vencido sin red: la sesión sigue siendo válida, solo no se pudo renovar.
      const owner = await getKv<string>(OWNER_KEY);
      if (error && isAuthRetryableFetchError(error) && owner) {
        return apply({ id: owner, email: await getKv<string>("ownerEmail") });
      }
      return apply(null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Diferido: llamar a Supabase dentro de este callback puede trabar su lock interno.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => void apply(session?.user ?? null), 0);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Cuántos cambios se perderían al cerrar sesión ahora. */
export function pendingChangesCount() {
  return db.outbox.count();
}

export async function signOut() {
  await getSupabase().auth.signOut({ scope: "local" });
  await clearLocalData();
}

export const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  email_not_confirmed: "Todavía no confirmaste tu email. Revisá tu casilla.",
  user_already_exists: "Ya hay una cuenta con ese email.",
  weak_password: "La contraseña es muy débil. Usá al menos 8 caracteres.",
  over_email_send_rate_limit: "Se enviaron demasiados emails. Probá de nuevo en un rato.",
};

export function authErrorMessage(error: { code?: string; message: string }) {
  if (error.code && AUTH_ERRORS[error.code]) return AUTH_ERRORS[error.code];
  if (/fetch|network/i.test(error.message)) return "No hay conexión. Probá de nuevo cuando tengas señal.";
  return "No se pudo completar la operación. Probá de nuevo.";
}
