import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

// Todas las páginas son estáticas: el HTML no depende de la sesión. Se precachean para
// que la app abra sin conexión en cualquier pantalla, aunque nunca se haya visitado.
// "/" no va: lo agrega el plugin, y una entrada repetida con otra revisión hace que
// Workbox aborte el precache entero.
const APP_ROUTES = [
  "/login",
  "/registro",
  "/recuperar",
  "/nueva-clave",
  "/bienvenida",
  "/panel",
  "/presupuestos",
  "/presupuestos/editar",
  "/presupuestos/ver",
  "/presupuestos/historial",
  "/clientes",
  "/trabajos",
  "/trabajos/ver",
  "/perfil",
  "/offline",
];

const buildRevision = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false, // Recargar perdería un presupuesto a medio escribir.
  dynamicStartUrl: false,
  fallbacks: { document: "/offline" },
  workboxOptions: {
    // También los .txt, que son el payload de la navegación cliente en un export estático.
    // Sin ellos, offline Next cae a una navegación dura hacia el .txt y la app se rompe.
    additionalManifestEntries: [
      ...APP_ROUTES.flatMap((url) => [url, `${url}.txt`]),
      "/index.txt",
    ].map((url) => ({ url, revision: buildRevision })),
    // Los detalles van por query (/presupuestos/ver?id=...): sin esto no matchean el precache.
    ignoreURLParametersMatching: [/.*/],
    // Los datos los maneja Dexie: el service worker nunca debe cachear Supabase.
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") || url.port === "54321",
        handler: "NetworkOnly",
      },
    ],
  },
});

const nextConfig: NextConfig = {
  // Sitio 100 % estático: la seguridad vive en RLS y se puede hostear en cualquier lado.
  output: "export",
  images: { unoptimized: true },
};

export default withPWA(nextConfig);
