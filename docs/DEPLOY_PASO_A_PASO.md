# Cómo publicar PresupuestApp, paso a paso

Esta guía es para hacerlo todo desde los paneles web, sin usar la terminal. Vas a usar dos servicios:

- **Supabase:** guarda los datos, los usuarios y los archivos.
- **Cloudflare Pages:** publica la app en internet.

Necesitás una cuenta de GitHub con acceso al repo `rubenci04/presupuestapp` y un celular Android para la prueba final. Calculá una hora la primera vez.

> Los paneles cambian seguido. Si un botón no se llama exactamente igual, buscá el más parecido.

**Regla de oro sobre las claves:** en esta guía solo se usa la clave **publishable** (empieza con `sb_publishable_`), que está pensada para ir en la app. La clave **secret** o **service_role** no se usa nunca: no la pegues en Cloudflare, en el código ni en un chat.

---

## A. Crear el proyecto en Supabase y correr el SQL

### A.1 Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta o iniciá sesión.
2. Tocá **New project**.
3. Completá los datos:
   - **Name:** `presupuestapp`.
   - **Database password:** tocá **Generate** y guardala en un lugar seguro. La app no la usa, pero conviene no perderla.
   - **Region:** **South America (São Paulo)**, la más cercana a Argentina.
4. Si aparecen opciones de seguridad, dejá **Data API activada**. La app no funciona sin ella.
5. Tocá **Create new project** y esperá un par de minutos.

### A.2 Correr el SQL

Hacé esto **antes de registrar cualquier usuario**. Quien se registre antes queda sin perfil y la app no le va a cargar.

1. En el repo de GitHub, abrí [`supabase/setup_completo.sql`](../supabase/setup_completo.sql) y tocá el botón **Copy raw file** (el ícono de copiar, arriba a la derecha del archivo).
2. En Supabase, abrí **SQL Editor** en el menú de la izquierda y creá una consulta nueva.
3. Pegá todo y tocá **Run**.
4. Puede aparecer un aviso de operación destructiva, porque el script reemplaza policies y triggers. Confirmá: no borra datos.
5. Abajo tiene que aparecer **`oficios: 45`** y **`buckets: 3`**.

Si da error, no se aplica nada: se puede corregir y volver a correr sin problema.

### A.3 Copiar la URL y la clave

Las vas a necesitar en el paso D, así que dejalas a mano.

1. Tocá **Connect**, arriba en el panel del proyecto. También están en **Project Settings > API Keys**.
2. Copiá la **URL del proyecto**, con esta forma: `https://abcdefgh.supabase.co`. Tiene que terminar ahí, sin `/rest/v1` ni barra final.
3. Copiá la **Publishable key**, que empieza con `sb_publishable_`.

---

## B. Configurar Auth

### B.1 Site URL y Redirect URLs

Estas direcciones indican a qué páginas puede volver un usuario después de confirmar un mail o entrar con Google. Si están mal, esos links van a `localhost` o fallan.

Vas a saber tu dirección definitiva recién al terminar el paso D. **Volvé acá después de publicar.** Si tu dirección es `https://presupuestapp.pages.dev`:

1. Andá a **Authentication > URL Configuration**.
2. En **Site URL** poné: `https://presupuestapp.pages.dev`
3. En **Redirect URLs** tocá **Add URL** y agregá: `https://presupuestapp.pages.dev/**`
4. Guardá.

Los dos asteriscos del final son necesarios, porque la app vuelve a `/panel` y a `/nueva-clave`.

### B.2 Mails: importante antes de tener usuarios reales

El servicio de mail que trae Supabase es solo para pruebas: [manda 2 mails por hora y únicamente a personas del equipo del proyecto](https://supabase.com/docs/guides/auth/auth-smtp). A cualquier otra persona le falla con el error `Email address not authorized`.

Afecta a la confirmación de cuenta y a "olvidé mi contraseña". Elegí según la etapa:

**Mientras probás vos solo: desactivá la confirmación.**

1. Andá a **Authentication > Sign In / Providers > Email**.
2. Desactivá **Confirm email** y guardá.

Con esto cualquiera puede registrarse con un mail ajeno, sin comprobar que es suyo. Sirve para probar, no para lanzar. "Olvidé mi contraseña" sigue sujeto al límite de arriba.

**Antes de lanzar: conectá un servicio de mail propio.**

1. Creá una cuenta en un servicio de envío, como [Resend](https://resend.com) o [Brevo](https://www.brevo.com). Te va a pedir verificar un dominio propio.
2. Copiá los datos SMTP que te da ese servicio.
3. En Supabase, andá a **Authentication > Emails > SMTP Settings**, activá **Custom SMTP** y pegalos.
4. Volvé a activar **Confirm email**.
5. Revisá en **Authentication > Rate Limits** cuántos mails por hora permitís.

### B.3 Contraseñas

La app pide 8 caracteres como mínimo. Para que el servidor exija lo mismo, poné **8** en **Authentication > Sign In / Providers > Email > Minimum password length**.

---

## C. Login con Google

Es opcional: sin esto funciona igual el ingreso con email, pero el botón "Continuar con Google" va a dar error. Necesitás tu **Project ID** de Supabase, que es la parte `abcdefgh` de la URL del paso A.3.

### C.1 En Google

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) y creá un proyecto llamado `PresupuestApp`.
2. Buscá **Google Auth Platform** y completá **Branding**: nombre de la app, mail de soporte y mail de contacto.
3. En **Audience**, elegí **External**.
4. Andá a **Clients > Create client**:
   - **Application type:** Web application.
   - **Authorized JavaScript origins:** `https://presupuestapp.pages.dev` (tu dirección real del paso D).
   - **Authorized redirect URIs:** `https://abcdefgh.supabase.co/auth/v1/callback`
5. Tocá **Create** y copiá el **Client ID** y el **Client secret**.

### C.2 En Supabase

1. Andá a **Authentication > Sign In / Providers > Google** y activalo.
2. Pegá el **Client ID** y el **Client secret**, y guardá.

### C.3 Publicar la pantalla de Google

Mientras la app esté en modo **Testing**, solo pueden entrar los mails que agregues en **Audience > Test users**. Cuando quieras abrirla a todos, tocá **Publish app** en esa misma pantalla.

---

## D. Publicar en Cloudflare Pages

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

6. Abrí **Environment variables** y agregá las dos del paso A.3:

   | Nombre | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Tu URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tu clave `sb_publishable_...` |

   La variable se llama `ANON_KEY` por costumbre, pero la clave publishable va ahí. Si tu proyecto muestra solamente la clave `anon` (empieza con `eyJ`), también sirve.

7. Tocá **Save and Deploy** y esperá unos minutos.

La versión de Node no hay que cargarla: la toma del archivo `.node-version` del repo.

Cuando termine, Cloudflare te muestra tu dirección, algo como `https://presupuestapp.pages.dev`. **Volvé al paso B.1 y al C.1 para cargarla.**

**Para tener en cuenta:**

- Cada `push` a `main` publica una versión nueva sola.
- Las variables se graban en el momento de compilar. Si cambiás una, andá a **Deployments** y tocá **Retry deployment** en el último, o no va a tener efecto.

---

## E. Probar la PWA en un Android

Usá Chrome y tu dirección `https://...pages.dev`.

### E.1 Primera prueba, con internet

1. Registrate y completá los tres pasos, con logo incluido.
2. Creá un presupuesto con mano de obra y un material, y tocá **Generar PDF**.
3. Comprobá que:
   - El número sea **Nº 1**.
   - **Descargar** abra un PDF con tu logo, en el que **no** aparezcan tu costo ni tu markup.
   - **Enviar por WhatsApp** abra el chat del cliente con el mensaje y el link. Abrí ese link: tiene que mostrar el PDF.
   - **Compartir PDF** abra el menú de Android y puedas elegir WhatsApp.

### E.2 Instalarla

1. En Chrome, abrí el menú **⋮** y tocá **Instalar app** o **Agregar a la pantalla principal**. También puede aparecer el botón **Instalar en el celular** en **Perfil**.
2. Abrila desde el ícono: tiene que verse sin la barra de direcciones.

### E.3 Prueba sin señal

Es la prueba clave. Hacela después de haber abierto la app una vez con internet.

1. Poné el celular en **modo avión**.
2. Abrí la app desde el ícono: tiene que cargar y avisar "Sin conexión".
3. Creá un presupuesto con un cliente nuevo y generá el PDF: va a figurar como **Sin número**.
4. Entrá a un trabajo existente y sacale una foto.
5. Sacá el modo avión y volvé a abrir la app.
6. Después de unos segundos, el presupuesto tiene que tener su número y la foto tiene que seguir ahí.
7. Comprobá en Supabase, en **Table Editor > budgets**, que el presupuesto llegó.

El PDF generado sin señal queda sin número. Si todavía no lo mandaste, generalo de nuevo con señal.

### E.4 Si hay un problema con versiones viejas

Después de publicar una versión nueva, la app se actualiza sola la siguiente vez que se abre con internet; a veces hace falta cerrarla y abrirla de nuevo.

---

## Si algo falla

| Qué ves | Causa probable | Qué hacer |
| --- | --- | --- |
| Pantalla de error al abrir la app, o no conecta | Variables mal cargadas | Revisá el paso D.6 y hacé **Retry deployment** |
| "No pudimos cargar tu cuenta" | No se corrió el SQL, o te registraste antes de correrlo | Corré el SQL. Si ya te habías registrado, borrá ese usuario en **Authentication > Users** y registrate de nuevo |
| `permission denied` en los registros de Supabase | Faltan los permisos del SQL | Volvé a correr `setup_completo.sql` |
| No llega el mail, o aparece `Email address not authorized` | Límite del mail de Supabase | Paso B.2 |
| El link del mail o Google te lleva a `localhost` | Falta la Site URL | Paso B.1 |
| Google muestra `redirect_uri_mismatch` | URI mal cargada | Revisá el paso C.1: tiene que terminar en `/auth/v1/callback` |
| Google muestra `access_denied` | App en modo Testing | Agregá tu mail en **Test users** o publicala (C.3) |
| El build de Cloudflare falla | Configuración de compilación | Revisá el cuadro del paso D.5 y leé el final del log |

**Supabase gratis se pausa:** según [guías de terceros](https://makerkit.dev/blog/saas/supabase-pricing), tras 7 días sin actividad. Si la app deja de sincronizar, entrá al panel y reactivá el proyecto. Con usuarios reales conviene el plan Pro.
