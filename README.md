# PresupuestApp

**Presupuestos profesionales en 1 minuto, con tu marca.**

PWA para trabajadores independientes de oficios en Argentina: presupuestos con logo y datos propios, materiales con margen de ganancia, PDF listo para WhatsApp y una agenda simple de trabajos.

**No pide cuenta ni login.** Al abrirla hay una sola pantalla de bienvenida y listo. Todo se guarda en el celular y funciona sin internet. Supabase queda en el código como opción para un respaldo en la nube más adelante, pero hoy no se usa.

## Qué incluye

- **Bienvenida única:** nombre o negocio, teléfono, oficio, y de forma opcional logo y color. Después, directo a "Nuevo presupuesto".
- **Oficios:** catálogo de 45 oficios argentinos con buscador, más "Otro" y los personalizados.
- **Presupuestos:** cliente, mano de obra, materiales con ganancia (30 % por defecto, el cliente nunca la ve), IVA de 21 %, 10,5 % o 0 %, condiciones, número correlativo local (1, 2, 3…), búsqueda, filtros y duplicado.
- **PDF A4:** con logo y marca. Se envía por WhatsApp con el menú de compartir de Android, que adjunta el archivo, o se descarga. Historial de PDFs.
- **Trabajos:** un presupuesto aceptado pasa a la agenda, con estados, fechas, notas, fotos y filtros.
- **Copia de seguridad:** se guarda todo (incluidos logo, fotos y PDFs) en un archivo y se recupera desde Ajustes o desde la bienvenida. Un aviso suave en el inicio recuerda hacerla cada semana.
- **Sin conexión:** todas las pantallas abren sin red, porque no hay servidor de por medio.

## Stack

Next.js 15 (App Router, export estático) · TypeScript estricto · Tailwind CSS 4 · shadcn/ui · Dexie (IndexedDB) · @ducanh2912/next-pwa · @react-pdf/renderer · Vitest · Playwright. Supabase (Auth, PostgreSQL, Storage) está en el código pero apagado.

## Cómo está armado

```
src/app/(app)/      Pantallas de la app (inicio, presupuestos, clientes, trabajos, ajustes)
src/app/bienvenida  Primer uso
src/app/...         "/" (redirige), offline, y login/registro (opcionales, sin uso hoy)
src/components/     UI compartida, PDF y vista previa
src/lib/db.ts       Esquema local (Dexie)
src/lib/data.ts     Todas las escrituras de la app
src/lib/backup.ts   Copia de seguridad: exportar e importar
src/lib/catalog.ts  Los 45 oficios
src/lib/config.ts   CLOUD_SYNC (apagado) y claves de la base local
src/lib/sync.ts     Sincronización con Supabase (dormida)
supabase/           Migraciones, setup_completo.sql y tests del schema (dormidos)
e2e/                Flujos completos en Chrome móvil, sin red
```

Decisiones que explican casi todo:

1. **Todo en el dispositivo.** Los datos viven en IndexedDB. El logo, las fotos y los PDFs se guardan como `Blob` en la misma base. Al iniciar se llama a `navigator.storage.persist()` para pedirle al navegador que no los borre si falta espacio.
2. **Sitio estático (`output: "export"`).** No hay servidor ni secretos. Los detalles usan query params (`/presupuestos/ver?id=...`), así una sola página precacheada sirve para cualquier presupuesto sin conexión.
3. **Número correlativo local.** Sale de un contador guardado aparte: si se borra el último presupuesto, su número no se reutiliza, porque ya pudo haberse enviado.
4. **El respaldo en la nube está apagado, no borrado.** `CLOUD_SYNC = false` en `src/lib/config.ts` hace que las escrituras no encolen nada. El código de login, `sync.ts` y el SQL siguen ahí; las rutas `/login` y `/registro` existen pero no están enlazadas, y sin las variables de Supabase solo muestran un aviso.

## Desarrollo local

Requisitos: Node 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

La app queda en http://localhost:3000. **No hace falta ninguna variable de entorno.** El service worker está desactivado en `dev`; para probar la PWA:

```bash
npm run build
```

```bash
npm run preview
```

### Tests

```bash
npm test
```

Unitarios (formatos, cálculos, numeración local y copia de seguridad sobre IndexedDB simulado) y pruebas de las migraciones de Supabase sobre Postgres embebido. No necesita Docker ni Supabase.

```bash
npm run test:e2e
```

Compila la app **sin variables de Supabase** y corre los flujos en Chrome móvil: abrir, bienvenida, presupuesto, PDF, compartir, trabajos, fotos, copia de seguridad y recuperación, todo con el servidor cortado, y que nada se salga de la pantalla en 360 px. Verifica además que la app no hace ningún pedido fuera de sí misma. Necesita Chrome instalado.

## Deploy

Es un sitio estático: **no necesita variables de entorno.** La guía completa para hacerlo desde los paneles web, sin terminal, está en [docs/DEPLOY_PASO_A_PASO.md](docs/DEPLOY_PASO_A_PASO.md).

Resumen para Cloudflare Pages:

| Campo | Valor |
| --- | --- |
| Framework preset | `Next.js (Static HTML Export)` |
| Build command | `npx next build` |
| Build output directory | `out` |
| Node | 24, fijado en `.node-version` |
| Variables | ninguna |

Cloudflare Pages [permite uso comercial en el plan gratuito, según comparativas públicas](https://freetier-atlas.pages.dev/en/tools/cloudflare-pages/); confirmalo en sus [condiciones](https://developers.cloudflare.com/pages/platform/limits/). El plan Hobby de Vercel es [solo para uso no comercial](https://vercel.com/docs/limits/fair-use-guidelines).

## Respaldo en la nube (opcional, para más adelante)

El SQL completo está en `supabase/setup_completo.sql` y los pasos para crear el proyecto, configurar Auth y el login con Google están en la parte C de la guía de deploy. Para activarlo falta, además de crear el proyecto: cargar las dos variables `NEXT_PUBLIC_SUPABASE_*`, poner `CLOUD_SYNC = true`, y agregar el login y la sincronización al flujo de la app, que hoy no están conectados. Esos pasos de código no se probaron en esta versión.

## Limitaciones conocidas

- **Los datos viven en un solo celular.** Si se borran los datos del navegador, se desinstala la app o se pierde el equipo, se pierden. Por eso la copia de seguridad y el aviso.
- **No hay sincronización entre equipos.** Para pasar los datos a otro celular, se usa la copia de seguridad.
- **Compartir PDF:** la Web Share API con archivos depende del navegador. Si no está, se descarga el PDF y se abre el chat de WhatsApp con el mensaje, para adjuntarlo a mano.
- **PDF:** usa la fuente Helvetica integrada, que cubre español pero no emojis ni alfabetos no latinos.
- **Fuera de este MVP:** recibos, facturación AFIP, pagos integrados, multiusuario, geolocalización de fotos.
