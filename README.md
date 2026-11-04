# PresupuestApp

**Presupuestos profesionales en 1 minuto, con tu marca.**

PWA para trabajadores independientes de oficios en Argentina: presupuestos con logo y datos propios, materiales con margen de ganancia, PDF listo para WhatsApp y una agenda simple de trabajos. Funciona sin conexión y sincroniza al volver la señal.

## Qué incluye

- **Cuenta y perfil:** email y contraseña o Google; datos personales, logo, color de marca y texto al pie.
- **Oficios:** catálogo de 45 oficios argentinos, más los personalizados.
- **Presupuestos:** cliente, mano de obra, materiales con markup (30 % por defecto, el cliente nunca lo ve), IVA de 21 %, 10,5 % o 0 %, condiciones, numeración automática, búsqueda, filtros y duplicado.
- **PDF A4:** descarga, compartir por Web Share API y link a WhatsApp, con historial de PDFs generados.
- **Trabajos:** un presupuesto aceptado pasa a la agenda, con estados, fechas, notas, fotos y filtros.
- **Offline:** todas las pantallas abren sin red. Se puede crear y editar, generar PDFs y sacar fotos; todo se sube solo después.

## Stack

Next.js 15 (App Router, export estático) · TypeScript estricto · Tailwind CSS 4 · shadcn/ui · Supabase (Auth, PostgreSQL, Storage) · Dexie (IndexedDB) · @ducanh2912/next-pwa · @react-pdf/renderer · Vitest · Playwright

## Cómo está armado

```
src/app/(app)/      Pantallas privadas (panel, presupuestos, clientes, trabajos, perfil)
src/app/...         Landing, login, registro, onboarding, offline
src/components/     UI compartida, PDF y vista previa
src/lib/db.ts       Esquema local (Dexie)
src/lib/data.ts     Todas las escrituras de la app
src/lib/sync.ts     Sincronización con Supabase
supabase/migrations Schema, RLS, buckets y catálogo de oficios
supabase/tests      Tests de RLS y schema sobre Postgres embebido
e2e/                Flujos completos en Chrome móvil
```

Tres decisiones explican casi todo lo demás:

1. **Sitio 100 % estático (`output: "export"`).** No hay servidor propio ni secretos: la seguridad de los datos la da RLS en Supabase. Por eso los detalles usan query params (`/presupuestos/ver?id=...`): así una sola página precacheada sirve para cualquier presupuesto sin conexión.
2. **Local-first.** La UI lee y escribe IndexedDB. Cada escritura deja una entrada en un outbox, y `sync.ts` sube los cambios y baja lo último. Los ids los genera el cliente, así que se pueden crear filas relacionadas sin red. Con un usuario por cuenta, gana la última escritura.
3. **El número de presupuesto lo asigna el servidor** con un trigger, para que dos equipos no repitan números. Un presupuesto creado sin señal figura como "Sin número" hasta sincronizar.

Los PDFs y las fotos tienen datos de clientes, así que van en buckets privados y se leen con URLs firmadas. Las columnas `pdf_url` y `url` guardan el path dentro del bucket. El link de WhatsApp es una URL firmada que vence a los 30 días y sirve para cualquiera que la tenga.

### Agregados al modelo de datos pedido

| Agregado | Motivo |
| --- | --- |
| `professionals.last_name`, `onboarded_at`, `last_budget_number` | Apellido, control del onboarding y correlativo |
| `oficios.category`, `oficios.professional_id` | Agrupar el catálogo y permitir oficios personalizados |
| `budgets.payment_method` | Forma de pago, que no tenía columna |
| `budget_items.position` | Conservar el orden de los ítems |
| Tabla `budget_pdfs` | Historial de PDFs generados |
| Bucket `job-photos` | Fotos de trabajos |

## Desarrollo local

Requisitos: Node 20 o superior y Docker Desktop corriendo (para Supabase local).

```bash
npm install
```

```bash
npx supabase start
```

Ese comando aplica las migraciones y muestra la URL y la clave `anon`. Copialas a `.env.local`:

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

La app queda en http://localhost:3000. El service worker está desactivado en `dev`; para probar la PWA:

```bash
npm run build
```

```bash
npm run preview
```

### Variables de entorno

| Variable | Dónde se obtiene |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Connect |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API Keys: la clave publishable o la `anon` (públicas; los datos los protege RLS) |

Se incrustan en el build: si las cambiás, hay que volver a compilar. **Nunca** uses acá la clave secret o `service_role`.

### Tests

```bash
npm test
```

Corre tests unitarios (formatos, cálculos) y prueba las migraciones reales en Postgres embebido: RLS entre usuarios, numeración, FK, buckets. No necesita Docker.

```bash
npm run test:e2e
```

Compila y corre los flujos en Chrome (necesita Chrome instalado) contra `e2e/fake-backend.mjs`, un backend en memoria que imita a Supabase. Cubre registro, onboarding, presupuesto, PDF, WhatsApp, agenda, fotos y el modo offline. No necesita Docker.

```bash
npm run test:e2e:real
```

Corre los flujos contra el Supabase local de verdad (hace falta `npx supabase start` antes). Además comprueba el aislamiento entre usuarios por HTTP, los límites de los buckets, el link firmado de WhatsApp, la caída de la API con `docker stop` y la recuperación de contraseña con el mail real en Mailpit. No cubre el login con Google, que necesita credenciales propias.

## Deploy

Para hacerlo solo desde los paneles web, sin terminal, seguí [docs/DEPLOY_PASO_A_PASO.md](docs/DEPLOY_PASO_A_PASO.md). Abajo está la versión con la CLI de Supabase.

### 1. Supabase (producción)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Aplicá las migraciones:

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref TU_PROJECT_REF
   ```

   ```bash
   npx supabase db push
   ```

3. En **Authentication > URL Configuration**, poné tu dominio en **Site URL** y agregá `https://tu-dominio/**` en **Redirect URLs**.
4. Si no querés confirmación por email, desactivala en **Authentication > Sign In / Providers > Email**. La app soporta los dos modos.

### 2. Login con Google

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) creá un **ID de cliente OAuth** de tipo *Aplicación web*.
2. En **URIs de redireccionamiento autorizados** agregá `https://TU_PROJECT_REF.supabase.co/auth/v1/callback`.
3. En Supabase, **Authentication > Sign In / Providers > Google**, activalo y pegá el Client ID y el Secret.

### 3. Hosting: Cloudflare Pages (recomendado)

Como el sitio es estático, sirve cualquier host. Para un producto que se va a usar comercialmente, la mejor opción gratuita es **Cloudflare Pages**: según comparativas públicas, el plan gratis tiene ancho de banda ilimitado y permite uso comercial. Confirmá las condiciones actuales en [Cloudflare](https://developers.cloudflare.com/pages/platform/limits/) antes de lanzar.

1. **Workers & Pages > Create > Pages > Connect to Git** y elegí este repo.
2. Configuración de build:
   - Framework preset: `Next.js (Static HTML Export)`
   - Build command: `npx next build`
   - Output directory: `out`
3. Agregá las dos variables de entorno. La versión de Node sale de `.node-version`.

### Alternativa: Vercel

Importá el repo en [vercel.com](https://vercel.com) y agregá las variables; detecta la configuración sola. Es lo más simple, pero el plan **Hobby es solo para uso personal no comercial** ([condiciones](https://vercel.com/docs/limits/fair-use-guidelines)): sirve para probar, y para cobrar o usarlo comercialmente hace falta el plan Pro.

### A tener en cuenta en Supabase gratis

El plan gratuito pausa el proyecto tras unos 7 días sin actividad y tiene límites de base y de almacenamiento: revisá los valores vigentes en [supabase.com/pricing](https://supabase.com/pricing). Con usuarios reales conviene pasar al plan Pro: si se pausa, nadie puede sincronizar hasta reactivarlo a mano.

## Limitaciones conocidas

- **Primer ingreso:** requiere conexión, para bajar el perfil y el catálogo. Subir el logo también.
- **PDF sin señal:** sale con "Sin número" y así queda en el historial. Con señal conviene generarlo de nuevo antes de enviarlo.
- **Compartir PDF:** la Web Share API con archivos depende del navegador; donde no está, se descarga el PDF.
- **PDF y Unicode:** usa la fuente Helvetica integrada, que cubre español pero no emojis ni alfabetos no latinos.
- **Fuera de este MVP:** recibos, facturación AFIP, pagos integrados, multiusuario, geolocalización de fotos.
