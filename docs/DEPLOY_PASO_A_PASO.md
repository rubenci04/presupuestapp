# Cómo publicar PresupuestApp, paso a paso

Esta guía es para hacerlo todo desde los paneles web, sin usar la terminal.

**PresupuestApp ya no necesita cuenta, ni base de datos, ni variables.** Se publica como un sitio común y cada persona guarda sus datos en su propio celular. Por eso la parte que hay que hacer sí o sí es corta: publicar en Cloudflare (parte A) y probarla en un Android (parte B).

Supabase (la base de datos en internet) quedó como **opcional**, para cuando se quiera ofrecer un respaldo en la nube. Está explicado al final (parte C) y no hace falta para lanzar.

Necesitás una cuenta de GitHub con acceso al repo `rubenci04/presupuestapp` y un celular Android. Calculá media hora.

> Los paneles cambian seguido. Si un botón no se llama exactamente igual, buscá el más parecido.

---

## A. Publicar en Cloudflare Pages

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com) y creá una cuenta o iniciá sesión.
2. Andá a **Compute > Workers & Pages > Create application**.
3. Elegí **Pages** (puede aparecer como una pestaña o como un link "Get started" abajo de todo) y **Import an existing Git repository**.

   > Si la pantalla te pide un **Deploy command**, estás en el flujo de Workers: volvé atrás y buscá Pages.

4. Conectá tu GitHub, dale acceso al repo `presupuestapp` y seleccionalo.
5. Completá la configuración:

   | Campo | Valor |
   | --- | --- |
   | Project name | `presupuestapp` (define tu dirección `.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | `Next.js (Static HTML Export)` |
   | Build command | `npx next build` |
   | Build output directory | `out` |

6. **No cargues ninguna variable de entorno.** Si ves el apartado **Environment variables**, dejalo vacío.
7. Tocá **Save and Deploy** y esperá unos minutos.

La versión de Node no hay que cargarla: la toma del archivo `.node-version` del repo.

Cuando termine, Cloudflare te muestra tu dirección, algo como `https://presupuestapp.pages.dev`. Abrila en el celular.

**Para tener en cuenta:**

- Cada `push` a `main` publica una versión nueva sola.
- Si más adelante querés usar tu propio dominio, se agrega en **Custom domains** del mismo proyecto.
- Cloudflare [permite uso comercial en el plan gratuito, según comparativas públicas](https://freetier-atlas.pages.dev/en/tools/cloudflare-pages/). Antes de cobrar por la app, confirmalo en las [condiciones de Cloudflare](https://developers.cloudflare.com/pages/platform/limits/).

---

## B. Probar la app en un Android

Usá Chrome y tu dirección `https://...pages.dev`.

### B.1 Primer uso

1. Al abrirla tiene que aparecer **directo** la pantalla "¡Bienvenido a PresupuestApp!", sin pedir mail ni contraseña.
2. Completá tu nombre, tu teléfono, elegí un oficio y tocá **Empezar**. El logo y el color son opcionales.
3. Tiene que abrirse **Nuevo presupuesto**. Armá uno con un cliente, un trabajo y un material, y tocá **Armar PDF**.
4. Comprobá que:
   - El número sea **Nº 1**.
   - **Descargar PDF** baje un archivo con tu nombre y, si lo cargaste, tu logo. No tienen que figurar lo que te cuestan los materiales ni tu ganancia.
   - **Enviar por WhatsApp** abra el menú de Android con el PDF adjunto, y puedas elegir WhatsApp y un contacto.

### B.2 Instalarla

1. En Chrome, abrí el menú **⋮** y tocá **Instalar app** o **Agregar a la pantalla principal**. También puede aparecer el botón **Poner la app en el celular** en **Ajustes**.
2. Abrila desde el ícono: tiene que verse sin la barra de direcciones.

Instalarla ayuda a que el navegador no borre los datos si el celular se queda sin espacio.

### B.3 Prueba sin señal

Hacela después de haber abierto la app una vez con internet.

1. Poné el celular en **modo avión**.
2. Abrí la app desde el ícono: tiene que cargar igual.
3. Creá un presupuesto nuevo y armá el PDF: tiene que salir con su número, sin pedir internet.
4. Entrá a un trabajo y sacale una foto.
5. Cerrá y volvé a abrir la app: todo tiene que seguir ahí.

### B.4 Copia de seguridad

Probá esto antes de darle la app a alguien: es lo único que protege sus datos.

1. Entrá a **Inicio > Ajustes** y tocá **Guardar copia**. Se baja un archivo `PresupuestApp-copia-AAAA-MM-DD.json`.
2. Si aparece **Enviar copia**, tocalo para mandarlo a Drive, a WhatsApp o por mail.
3. Para comprobar que sirve: desinstalá la app (o borrá los datos del sitio en Chrome), volvé a abrirla y, en la pantalla de bienvenida, tocá **Ya usaba la app: recuperar mi copia de seguridad** y elegí el archivo. Tienen que volver los presupuestos, los clientes, las fotos y el logo.

Si pasó una semana sin copias, la app avisa en el inicio con un cartel que se puede dejar para más tarde.

### B.5 Después de publicar una versión nueva

La app se actualiza sola la siguiente vez que se abre con internet; a veces hace falta cerrarla y abrirla de nuevo. Los datos no se tocan.

---

## Si algo falla

| Qué ves | Causa probable | Qué hacer |
| --- | --- | --- |
| El build de Cloudflare falla | Configuración de compilación | Revisá el cuadro del paso A.5 y leé el final del log |
| Página en blanco o error 404 | Carpeta de salida mal puesta | Tiene que ser `out` |
| Pide instalar o no aparece "Instalar app" | Chrome decide cuándo ofrecerlo | Usá el menú **⋮ > Agregar a la pantalla principal** |
| Se perdieron los datos | Se borraron los datos del navegador o se desinstaló la app | Recuperá la copia (B.4) |
| El PDF no se adjunta en WhatsApp | El navegador no permite compartir archivos | La app descarga el PDF y abre el chat: adjuntalo desde ahí |

---

## C. Más adelante (opcional): cuenta y respaldo en la nube

> **Esto no hace falta para lanzar y hoy no está conectado a la app.** El código de login, la sincronización y el SQL están guardados en el repo, pero la app no los usa: nunca muestra un login, y la nube está apagada con el interruptor `CLOUD_SYNC` en `src/lib/config.ts`. Activarlo requiere además trabajo de programación (agregar el login al flujo y conectar la sincronización) que todavía no se hizo ni se probó.
>
> Lo que sigue deja preparado el lado de Supabase para ese momento.

### C.1 Crear el proyecto en Supabase y correr el SQL

1. Entrá a [supabase.com](https://supabase.com), creá un proyecto llamado `presupuestapp` y elegí la región **South America (São Paulo)**. Dejá la **Data API** activada.
2. Hacelo **antes de tener usuarios**. En el repo de GitHub, abrí `supabase/setup_completo.sql` y copiá todo con **Copy raw file**.
3. En Supabase, abrí **SQL Editor**, pegá todo y tocá **Run**. Se puede correr más de una vez sin romper nada. Abajo tiene que aparecer **`oficios: 45`** y **`buckets: 3`**.
4. Copiá la **URL del proyecto** (`https://abcdefgh.supabase.co`, sin barra final ni `/rest/v1`) y la **Publishable key** (`sb_publishable_...`) desde **Connect** o **Project Settings > API Keys**.

**Regla de oro:** solo se usa la clave **publishable**, que está pensada para ir en la app. La clave **secret** o **service_role** no se usa nunca: no la pegues en Cloudflare, en el código ni en un chat.

### C.2 Cargar las variables en Cloudflare

Cuando la parte de código esté lista: en tu proyecto de Cloudflare, **Settings > Variables and Secrets**, agregá:

| Nombre | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Tu URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tu clave `sb_publishable_...` |

Las variables se graban al compilar: después de cambiarlas, andá a **Deployments** y tocá **Retry deployment**.

### C.3 Auth

- **URL Configuration:** en **Authentication > URL Configuration**, poné tu dirección `https://...pages.dev` como **Site URL** y agregá `https://...pages.dev/**` en **Redirect URLs**.
- **Mails:** el servicio que trae Supabase [manda 2 mails por hora y solo a personas del equipo del proyecto](https://supabase.com/docs/guides/auth/auth-smtp). Para probar, desactivá **Confirm email** (**Authentication > Sign In / Providers > Email**). Antes de lanzar con usuarios reales, conectá un SMTP propio (por ejemplo Resend o Brevo) en **Authentication > Emails > SMTP Settings** y volvé a activarlo.
- **Contraseña mínima:** poné **8** en **Authentication > Sign In / Providers > Email**, porque la app pide 8.

### C.4 Login con Google

1. En [Google Cloud Console](https://console.cloud.google.com), creá un proyecto, completá **Google Auth Platform > Branding** y elegí **External** en **Audience**.
2. En **Clients > Create client**: tipo **Web application**, con tu dirección `https://...pages.dev` en **Authorized JavaScript origins** y `https://TU_PROJECT_ID.supabase.co/auth/v1/callback` en **Authorized redirect URIs**. Copiá el **Client ID** y el **Client secret**.
3. En Supabase, **Authentication > Sign In / Providers > Google**: activalo y pegá los dos datos.
4. Mientras la app de Google esté en modo **Testing**, solo entran los mails de **Test users**. Para abrirla a todos, tocá **Publish app**.

### C.5 Cosas que conviene saber

Según [guías de terceros](https://makerkit.dev/blog/saas/supabase-pricing), el plan gratuito de Supabase pausa el proyecto tras 7 días sin actividad. Con usuarios reales conviene el plan Pro.
