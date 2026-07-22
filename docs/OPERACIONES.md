# Manual de Operaciones — Atelier

> Guía para mantener Atelier vivo: publicar el backend, hornear el APK, tocar la
> base y salir de un apuro. Escrita para que **Andy** siga los pasos sin ser
> programador. Cada sección tiene primero los **pasos simples** y después un
> bloque **"Para técnicos"** (plegable) con el detalle fino.
>
> Regla de oro de este manual: **nunca escribimos claves ni contraseñas acá**.
> Solo decimos *dónde* viven. Si ves un valor secreto en este archivo, está mal.

Última revisión: 2026-07-11.

---

## Índice

1. [Mapa del sistema](#1-mapa-del-sistema)
2. [Desplegar el backend (Vercel)](#2-desplegar-el-backend-vercel)
3. [Hornear un APK nuevo (EAS)](#3-hornear-un-apk-nuevo-eas)
4. [Variables de entorno y secretos](#4-variables-de-entorno-y-secretos)
5. [Migraciones de base](#5-migraciones-de-base)
6. [Recuperación y emergencias](#6-recuperación-y-emergencias)
7. [Cuentas y accesos](#7-cuentas-y-accesos)
8. [Limitaciones conocidas](#8-limitaciones-conocidas)

---

## 1. Mapa del sistema

Atelier tiene cuatro piezas. Así se conectan:

```
   ┌──────────────┐        internet         ┌───────────────────┐
   │  App móvil   │  ───────────────────▶   │   Backend (API)   │
   │  (APK/Expo)  │   https://atelier-      │  Vercel: atelier- │
   │  el teléfono │   2-0-mu.vercel.app     │  2-0              │
   │  del chef    │                          └─────────┬─────────┘
   └──────────────┘                                    │
          ▲                                             │ lee/escribe
          │ se hornea con                               ▼
   ┌──────────────┐                          ┌───────────────────┐
   │  EAS (Expo)  │                          │  Base de datos    │
   │  fábrica de  │                          │  Neon Postgres    │
   │  APKs        │                          │  prod: atelier-   │
   └──────────────┘                          │  pilot            │
                                             └───────────────────┘
```

- **App móvil (el teléfono del chef).** Un APK de Android hecho con Expo. Es lo
  que el chef instala. Andy y los chefs del piloto son Android; **no hay iPhone
  en el piloto** (no hay cuenta Apple todavía). El APK apunta al backend por la
  dirección `https://atelier-2-0-mu.vercel.app`.

- **Backend (la API).** Vive en **Vercel**, proyecto **`atelier-2-0`**. Es el
  cerebro: guarda recetas, habla con la IA, manda los correos de acceso. Su
  dirección pública es **https://atelier-2-0-mu.vercel.app**.

- **Base de datos.** Es **Neon** (Postgres). Hay **dos** bases:
  - **Producción = `atelier-pilot`** (la real, con las recetas de los chefs).
  - **Desarrollo/pruebas = `ep-summer-heart`** (para probar sin romper nada).
  - Existe además una base vieja abandonada (`atelier2.0` / `ep-round-field`)
    que **no** se usa y **no** hay que borrar sin pensarlo.

- **EAS (la fábrica de APKs).** Es el servicio de Expo que compila el APK en la
  nube. No es parte de la app que corre; es la máquina que la "hornea".

### Dónde vive cada tablero (URLs)

| Pieza | Dónde entrar |
|---|---|
| Backend (deploys, logs, variables) | Vercel → proyecto **atelier-2-0** |
| Base de datos | Neon → base **atelier-pilot** (prod) y **ep-summer-heart** (dev) |
| APKs / builds | https://expo.dev/accounts/andygome/projects/atelier/builds |
| Salud del backend | https://atelier-2-0-mu.vercel.app/api/health |
| APK vigente para invitar chefs | build **b5f3cee7** (ver sección 3) |

<details>
<summary><b>Para técnicos</b></summary>

- Proyecto Vercel: `atelier-2-0`, id `prj_knDXYv368VqkyzMvSpMz8tym5vwD`, team
  `team_XMsRKUY5w4hXbBSWFURMblxY`, región `fra1`.
- El proyecto Vercel **real** está enlazado en la **raíz del worktree**
  (`lucid-haslett-9cf85d`). Ojo: `apps/api/.vercel` apunta a un proyecto vacío
  equivocado llamado "api". Correr `vercel …` desde la **raíz**, no desde
  `apps/api`.
- Base prod `atelier-pilot`: endpoint **pooled**
  `ep-red-haze-agghqgnm-pooler.c-2.eu-central-1.aws.neon.tech` (sin
  `channel_binding`). El `apps/api/.env.local` del repo apunta a la base de
  **pruebas** (`ep-summer-heart`), a propósito, para que dev nunca escriba en
  prod.
- Repo: monorepo pnpm. `apps/api` (Next.js + Prisma), `apps/mobile` (Expo),
  `packages/db` (Prisma schema + migraciones), `packages/shared` (zod +
  contrato de API), `packages/i18n` (traducciones es/it/en).
- Cuenta Expo: `andygome`; proyecto `@andygome/atelier`, projectId
  `813bc6e8-bac0-4377-ba73-26825523db2e`.
- La app real corre desde la rama **`claude/lucid-haslett-9cf85d`** (desplegada
  a prod), **no** desde `main`. `main` está desactualizada y tiene borradores
  sin commitear — no confiar en lo que se ve ahí.

</details>

---

## 2. Desplegar el backend (Vercel)

Esto publica cambios del **servidor** (la API): correos, IA, reglas, y aplica
solas las migraciones de base pendientes. **No** actualiza la app del teléfono
(eso es hornear un APK, sección 3).

### Pasos simples

1. Abrí una terminal en la carpeta del proyecto (el worktree
   `lucid-haslett-9cf85d`).
2. Corré este comando desde la **raíz** del proyecto:

   ```powershell
   # Desde: C:\Users\Utente\Desktop\atelier-2-0\.claude\worktrees\lucid-haslett-9cf85d
   vercel --prod --yes
   ```

3. Esperá a que termine (unos minutos). En el build, Vercel **aplica solo** las
   migraciones de base que falten — no hay que hacer nada a mano.
4. **Verificá que salió bien.** Abrí en el navegador:

   - https://atelier-2-0-mu.vercel.app/api/health → tiene que decir
     `"status": "ok"`.
   - Para un chequeo profundo (además prueba que la clave de IA funciona):
     https://atelier-2-0-mu.vercel.app/api/health?deep=1 → también `"ok"`.

   Si dice `"degraded"` o no responde, algo falló: mirá la sección
   [6. Recuperación](#6-recuperación-y-emergencias).

### Cómo hacer rollback (volver a un deploy anterior)

Si un deploy nuevo rompió algo, se vuelve al anterior **desde el tablero de
Vercel, sin tocar la terminal**:

1. Entrá a Vercel → proyecto **atelier-2-0** → pestaña **Deployments**.
2. Buscá el último deploy que **sí funcionaba** (los de antes del problema).
3. Abrí su menú (los tres puntitos `···`) → **Promote to Production** (o
   **Instant Rollback**).
4. Confirmá. En segundos el tráfico vuelve a ese deploy viejo.
5. Volvé a chequear `/api/health`.

> El rollback de Vercel **solo cambia el código** que se sirve. **No** revierte
> la base de datos. Si el problema fue una migración, ver la advertencia de la
> sección 5.

<details>
<summary><b>Para técnicos</b></summary>

- El build corre (definido en `apps/api/vercel.json`):
  `cd ../.. && pnpm db:generate && pnpm db:migrate:deploy && pnpm --filter api build`.
  El `pnpm db:migrate:deploy` = **auto-migración**: prod aplica las migraciones
  pendientes en cada deploy. Por eso `AiUsage` (`20260708120000_add_ai_usage`) y
  `menu_soft_delete` (`20260710000000`) se aplicaron solas al desplegar.
- **Redeploy del MISMO código** (sin cambios nuevos): `vercel redeploy <alias>`.
  Ojo: `redeploy` **NO** acepta `--yes`; `vercel --prod` **SÍ**.
- **Vercel BLOQUEA el deploy** (queda "Building…" para siempre, estado
  `BLOCKED`) si el autor git del commit no es miembro de la cuenta. Fix ya
  aplicado en el repo: `git config user.email andygomezgc@gmail.com`. Todo
  commit que se despliegue debe tener ese autor. Diagnóstico por API:
  `GET /v13/deployments/{url}`, campo `readyStateReason`.
- El token del CLI de Vercel (`auth.json`) caduca; correr cualquier comando
  `vercel` lo refresca.
- Hay un cron en Vercel (`vercel.json`): `/api/cron/recalc-criticality` los
  lunes 04:00. Protegido por `CRON_SECRET`.
- `/api/health` sin `deep` valida solo el **formato** de las claves (barato);
  con `?deep=1` pega a `GET https://api.anthropic.com/v1/models` para confirmar
  que la clave de IA de verdad funciona (una key revocada pero con formato ok
  pasa el chequeo barato y rompe el asistente con 401 — el deep lo caza).
  Responde 200 si todo ok, 503 si algo está `degraded`; nunca filtra el error
  interno (queda en los logs del server).

</details>

---

## 3. Hornear un APK nuevo (EAS)

El APK es lo que instalan los chefs. Hay que hornear uno nuevo cuando cambió la
**app del teléfono** (pantallas, login, etc.) — el deploy de Vercel **no**
alcanza para eso.

> **APK vigente hoy: build `b5f3cee7`** (commit `15b9df5`, horneado 2026-07-09).
> Página: https://expo.dev/accounts/andygome/projects/atelier/builds/b5f3cee7-e021-4183-8dec-307f1bb7f2f3
> Este es el link para invitar chefs Android. **Ojo:** el link de descarga de
> distribución interna **caduca a los ~14 días** (~2026-07-23) → después hay que
> re-hornear (gratis) para volver a invitar.
>
> **Hay trabajo sin hornear** en la rama: features de recetas (duplicar,
> papelera, escalar, PDF), menús (duplicar, papelera), productos (papelera,
> duplicar, matching mejorado), export de recetario y banco (PDF/CSV), euros
> consistentes. La próxima horneada los lleva a los chefs.

### La lección crítica (leer antes de hornear)

**NO se puede hornear desde el worktree anidado** (esta carpeta,
`lucid-haslett-9cf85d`, que está *dentro* del repo principal). EAS se confunde
con la raíz del monorepo y falla a los ~11 segundos con
`package.json does not exist in .../apps/mobile`.

**La receta que SÍ funciona: hornear desde un CLON limpio, fuera del
anidamiento.**

### Pasos (la receta exacta que funcionó)

1. Clonar el repo a una carpeta **nueva y separada**, en la rama correcta:

   ```powershell
   git clone <url-del-repo> C:\Users\Utente\atelier-bake --branch claude/lucid-haslett-9cf85d
   ```

2. Entrar e instalar dependencias:

   ```powershell
   # Desde: C:\Users\Utente\atelier-bake
   pnpm install
   ```

3. (Recomendado) Probar que el bundle arma bien **antes** de encolar:

   ```powershell
   # Desde: C:\Users\Utente\atelier-bake\apps\mobile
   npx expo export --platform android
   # tiene que cerrar con "android bundles (1)"; después borrá la carpeta dist
   ```

4. Hornear con la versión **fijada** de EAS (ver aviso abajo) y el perfil
   `pilot`:

   ```powershell
   # Desde: C:\Users\Utente\atelier-bake\apps\mobile
   npx --yes eas-cli@16.17.4 build -p android --profile pilot --non-interactive
   ```

5. Esperar. La cola gratis tarda ~65–80 min y el build en sí ~10–16 min. Al
   terminar, EAS da el link del `.apk` y la página del build en expo.dev.
6. Ese link nuevo es el que se comparte con los chefs (reemplaza al anterior).

> **Aviso — versión de EAS.** `npx eas-cli@latest` **rompe en esta máquina**
> ("Invalid Version" al instalar). **Usar siempre la versión fijada
> `eas-cli@16.17.4`**, como en el comando de arriba.

<details>
<summary><b>Para técnicos</b></summary>

- Perfil `pilot` en `apps/mobile/eas.json`: `distribution: internal`,
  `android.buildType: apk`. Lleva en `env` el `EXPO_PUBLIC_API_URL`
  (apunta a prod) y los `EXPO_PUBLIC_GOOGLE_*` client IDs.
- **Por qué falla desde el worktree** (confirmado, builds 06739415 / df30db79 /
  c0045e0b / 0ac6cf22): (a) el worktree está **anidado** dentro del repo
  principal y **ambos** tienen `pnpm-workspace.yaml` + `package.json` en su raíz
  → EAS detecta mal la raíz del monorepo; (b) además, aquel día el HEAD del
  worktree estaba **detached** (los commits colgaban de un HEAD suelto y el
  branch seguía clavado en un commit viejo). `EAS_NO_VCS=1` **no** alcanzó.
  Antes de clonar hubo que reapuntar el branch al trabajo real:
  `git branch -f claude/lucid-haslett-9cf85d <commit>` y reenganchar el worktree
  con `git checkout claude/lucid-haslett-9cf85d`.
- Upload correcto desde el clon standalone = **9.2 MB** (monorepo completo). Un
  upload de ~4.5 MB es señal de que agarró mal la raíz.
- `--non-interactive` genera la keystore **en la nube** sola (no se traba
  pidiendo confirmación). La keystore/SHA-1 se consultan con
  `eas credentials -p android`.
- Caídas intermitentes de EAS (`SERVER_ERROR`, worker OOM/red) se resuelven
  reintentando; no confundir con el error de raíz del monorepo.
- Gotchas de bundling ya resueltos en el repo (no re-romper): `babel-preset-expo`
  como devDependency explícita de `apps/mobile`; subida de archivos con
  `FileSystem.uploadAsync` de `expo-file-system/legacy` (el `fetch + FormData`
  normal da "Network request failed" en standalone); rutas de entrada
  `app/index.tsx`, `app/auth.tsx`, `app/+not-found.tsx` para el esquema
  `atelier://`.

</details>

---

## 4. Variables de entorno y secretos

Los "secretos" son claves y contraseñas que la app necesita pero que **no** van
en el código. Viven en dos lugares:

- **En Vercel** (para producción): tablero del proyecto **atelier-2-0** →
  **Settings → Environment Variables**. Ahí están las claves reales que usa el
  backend en vivo.
- **En tu máquina** (para desarrollo): el archivo `apps/api/.env.local`. **Nunca
  se sube a git** (está en `.gitignore`).

> **Este manual no contiene ningún valor secreto**, a propósito. Solo dice qué
> claves existen y dónde están. Para ver un valor real, entrá a Vercel o abrí
> `.env.local`.

### Lección importante: cargar variables en Vercel

**En esta máquina Windows, `vercel env add` por stdin guarda la variable
VACÍA** aunque el CLI diga "OK". No es de fiar. Para cargar o cambiar una
variable en Vercel de forma segura hay que usar la **API REST** de Vercel y
**verificar después** con `vercel env pull`.

Pasos simples si necesitás cambiar un secreto en prod:

1. Cargarlo por la API REST de Vercel (no por `vercel env add`).
2. Verificar: `vercel env pull` a un archivo temporal `*.local` y comparar el
   valor exacto.
3. Borrar el archivo temporal.

### Qué claves existen (sin valores)

| Clave | Para qué sirve |
|---|---|
| `DATABASE_URL` | Conexión a la base Neon (prod = atelier-pilot) |
| `ANTHROPIC_API_KEY` | Clave de la IA (asistente, extracción de recetas) |
| `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_REPLY_TO` | Envío del correo de acceso (magic link) |
| `NEXTAUTH_SECRET` (y `AUTH_SECRET`) | Firma de sesiones |
| `MOBILE_JWT_SECRET` | Firma del token de la app móvil |
| `BLOB_READ_WRITE_TOKEN` | Almacenamiento de archivos (PDFs subidos) |
| `CRON_SECRET` | Protege el cron de recálculo |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | Login con Google (verificación del token) |
| `AI_DAILY_LIMIT` | Tope de llamadas de IA por chef/día (no secreto; default 120) |

<details>
<summary><b>Para técnicos</b></summary>

- **API REST de Vercel** para cargar variables: token en
  `C:\Users\Utente\AppData\Roaming\com.vercel.cli\Data\auth.json` (campo
  `token`). `POST https://api.vercel.com/v10/projects/{proj}/env?teamId={team}&upsert=true`
  con body JSON `{key, value, type:'encrypted', target:['production']}`. Proyecto
  `prj_knDXYv368VqkyzMvSpMz8tym5vwD`, team `team_XMsRKUY5w4hXbBSWFURMblxY`.
  Verificar SIEMPRE con `vercel env pull` a un `*.local` gitignoreado (confirmar
  con `git check-ignore -v`), comparar valor exacto, y borrarlo en un `finally`.
- **Google login** (arrancado 2026-06-15, commit `99fb4c8`): proyecto GCP
  reusado `ai-studio-applet-webapp-bc0c2` (ya en producción con usuarios
  externos → cualquier chef entra sin lista de invitados). Los 3 client IDs
  (web/Android/iOS) son **públicos**, no secretos, y están en la memoria
  `google-login-credenciales`. El único secreto de Google es
  `GOOGLE_WEB_CLIENT_SECRET`, que vive en `apps/api/.env.local` y hoy **no** se
  usa (el login por idToken no lo necesita).
- `AI_DAILY_LIMIT` es configurable por env **sin redeploy**; default 120.
- El `.gitignore` ya cubre backups de secretos: `.env*`, `*.pull`, `.env*.bak*`,
  `.env*.backup`. (Nota: en `main` hay archivos `.env.local.bak-…` y
  `.env.production.pull` sin trackear — son locales, no están commiteados, pero
  conviene no dejarlos rodando.)

</details>

---

## 5. Migraciones de base

Una "migración" es un cambio en la **estructura** de la base (una tabla nueva,
una columna nueva). Hay un flujo estricto para que prod nunca se rompa.

### La regla que nunca se rompe

> **JAMÁS aplicar una migración a mano contra producción (`atelier-pilot`).**
> Prod se migra **sola** en el próximo deploy a Vercel (ver sección 2). Tocar
> prod a mano puede dejar la base y el código desincronizados y tirar todo.

### El flujo (para quien programa el cambio)

1. Editar el esquema: `packages/db/prisma/schema.prisma`.
2. Generar el SQL de la migración **comparando contra git HEAD** (sin tocar
   ninguna base):

   ```powershell
   git show HEAD:packages/db/prisma/schema.prisma > $env:TEMP\base.prisma
   # Desde: packages\db
   npx prisma migrate diff --from-schema-datamodel $env:TEMP\base.prisma --to-schema-datamodel prisma\schema.prisma --script
   ```

3. Guardar ese SQL en
   `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_<nombre>/migration.sql`.
4. Aplicar **solo a DEV** (base de pruebas `ep-summer-heart`):

   ```powershell
   # Desde: packages\db  — usar el DATABASE_URL de apps/api/.env.local (ep-summer-heart)
   $env:DATABASE_URL="<url de la base de pruebas>"; npx prisma migrate deploy
   ```

5. Regenerar el cliente para que el código vea los campos nuevos:

   ```powershell
   pnpm db:generate
   ```

6. **Prod NO se toca.** Se aplica sola en el próximo `vercel --prod` (el build
   corre `pnpm db:migrate:deploy`).

Hoy hay **15 migraciones** aplicadas en prod. La última fue
`20260710000000_menu_soft_delete` (la papelera de menús).

<details>
<summary><b>Para técnicos</b></summary>

- Neon **no** necesita shadow DB para este flujo: el `migrate diff` compara
  esquemas, no bases; el pooled endpoint aguanta DDL.
- Al leer/escribir columnas `Json`: leer da `Prisma.JsonValue` (incluye null),
  escribir pide `InputJsonValue`. Castear:
  `contentJson: (source.contentJson ?? {}) as Prisma.InputJsonValue`.
- Verificar sync de prod: `/api/health` no lo dice, pero en el log del build de
  Vercel `migrate deploy` reporta "N migrations found / up to date". Prod estaba
  14/14 antes de menu_soft_delete → quedó 15/15.
- Patrón de features soft-delete (recetas/menús/productos): `deletedAt` en el
  modelo; el detalle 404ea si `deletedAt !== null` para no dejar editar un
  registro borrado. Al agregar un guard por campo, **se rompen los tests
  viejos** cuyos fixtures no tienen el campo → agregar `deletedAt: null` a esos
  fixtures y correr la suite completa (`npx vitest run`), no solo el test nuevo.

</details>

---

## 6. Recuperación y emergencias

### La app del teléfono no conecta / da errores

1. Abrí https://atelier-2-0-mu.vercel.app/api/health (y `?deep=1`).
   - Si dice **`ok`** → el backend está bien; el problema es del teléfono
     (revisar internet, cerrar y abrir la app, o el link del APK caducó → ver
     sección 3).
   - Si dice **`degraded`** o no carga → el backend tiene un problema.
2. Si el backend falla, entrá a Vercel → **atelier-2-0** → **Deployments** y
   mirá si el último deploy quedó en error. Revisá los **Logs**.
3. Si el último deploy rompió algo, hacé **rollback** (siguiente punto).

### Rollback de un deploy malo

Ver [sección 2 → rollback](#cómo-hacer-rollback-volver-a-un-deploy-anterior):
desde Vercel, promover a producción el último deploy que funcionaba. Recordá:
el rollback **no** revierte la base de datos.

### Restaurar una receta, menú o producto borrado

**La app ya tiene papelera.** Nada se borra de verdad al primer toque:

- **Recetas:** en Recetas hay un icono de papelera en el encabezado → abre la
  lista de borradas → **Restaurar**.
- **Menús:** igual, icono de papelera en el encabezado de Menús → **Restaurar**.
- **Productos:** igual, icono de papelera en el encabezado de Productos →
  **Restaurar**. *(En la app del teléfono a partir de la próxima horneada;
  el APK b5f3cee7 todavía no lo trae.)*

### Unir productos duplicados

Si el banco de productos quedó con duplicados (p.ej. "Ricciola" cinco veces),
hay un script que los une en uno solo. **Archiva los duplicados, no los borra.**

1. Identificá el id del producto "bueno" (canónico) y los ids de los duplicados.
2. Corré primero en **dry-run** (no escribe nada, solo muestra qué haría):

   ```powershell
   # Desde la raíz del proyecto. DATABASE_URL define contra qué base corre.
   node scripts/products-merge.mjs --canonical <id> --dups <id,id,...>
   ```

3. Revisá la salida. Si querés además limpiar el nombre:
   `--rename "Ricciola"`.
4. **Solo cuando estés seguro**, agregá `--apply` para ejecutarlo de verdad:

   ```powershell
   node scripts/products-merge.mjs --canonical <id> --dups <id,id,...> --rename "Ricciola" --apply
   ```

> **Contra PROD solo con decisión consciente.** El script corre contra la base
> que diga `DATABASE_URL`. Sin `--apply` no toca nada (dry-run). Exige que todos
> los productos sean del **mismo restaurante** (aborta si no). Ya se usó en prod
> una vez (con OK de Andy) para dejar 5 "ricciolas" en 1.

<details>
<summary><b>Para técnicos</b></summary>

- El merge, con `--apply`, corre en una transacción: re-enlaza
  `RecipeIngredient.productId` de los duplicados al canónico, suma nombre +
  aliases de los duplicados como aliases del canónico (sin repetir,
  case-insensitive), y pone los duplicados en `estado = "archivado"`. Con
  `--rename`, además renombra el canónico y guarda su nombre viejo como alias
  para no perderlo del matching.
- El matching de productos (`apps/api/lib/products/matching.ts`) ahora usa
  solapamiento de **tokens** además de Levenshtein: si overlap ≥ 0.6 marca
  `probable` y dispara el `ConfirmMatchSheet` (pregunta al chef, **nunca**
  enlaza solo). Al confirmar "Sí", el mobile guarda el nombre parseado como
  alias para match exacto futuro.
- Debug e2e contra prod: pedir magic link → leer el código del **cuerpo** del
  correo (el del href se come 1 char por quoted-printable) → `POST
  /api/mobile/auth/verify` → token de un solo uso → reproducir con `curl.exe`.
  Rate-limit del request: 60s por email.

</details>

---

## 7. Cuentas y accesos

Estas son las cuentas de las que depende Atelier. Todas están a nombre de Andy.

| Servicio | Para qué | Cuenta |
|---|---|---|
| **Vercel** | Backend (deploys, variables, logs) | proyecto `atelier-2-0` |
| **Neon** | Base de datos (prod + dev) | bases `atelier-pilot`, `ep-summer-heart` |
| **Expo / EAS** | Hornear los APKs | `andygome`, proyecto `@andygome/atelier` |
| **Google Cloud** | Login con Google | proyecto `ai-studio-applet-webapp-bc0c2` |
| **Resend** | Correos de acceso (magic link) | remitente `onboarding@resend.dev` (provisorio) |
| **Anthropic** | La IA (asistente, extracción) | clave `ANTHROPIC_API_KEY` en Vercel |

### Copias de seguridad (estado 2026-07-12)

- **✅ Keystore de EAS — RESPALDADO.** Copia local en
  `C:\Users\Utente\Desktop\ATELIER-BACKUPS\keystore-eas\` (el `.jks` + un
  `.txt` con sus contraseñas). **Tarea de Andy: copiar esa carpeta a 2 lugares
  más** (Google Drive + un USB). Si el keystore se pierde, no se pueden
  publicar actualizaciones de la app con la misma firma.
- **✅ Backup de la base — hay copia y hay herramienta.** Primer volcado
  completo hecho (19 tablas) en `C:\Users\Utente\Desktop\ATELIER-BACKUPS\db\`.
  Para sacar una copia nueva cuando quieras:

  ```powershell
  # Desde la raíz del proyecto, con la URL de PROD en DATABASE_URL
  node scripts/db-backup.mjs
  ```

  Solo LEE la base. Conviene sacar una copia antes de cada deploy grande y
  cada tanto copiar la carpeta a Drive.
- **⚠️ Retención en Neon — tarea de Andy (5 min).** En el tablero de Neon →
  proyecto → **Settings → History retention**: subirla al máximo del plan.
  Eso permite "volver la base atrás en el tiempo" si algo sale muy mal.
- **✅ Sentry / alertas de errores — ACTIVO (2026-07-13).** Organización
  **atelier-xm** (datos en la UE), proyecto **atelier-api**, cuenta de Andy
  (login con Google). El backend reporta los errores no manejados
  (`instrumentation.ts` + `sentry.server.config.ts`; `SENTRY_DSN` en Vercel) y
  Sentry manda un correo a Andy en cada error nuevo de prioridad alta. Panel:
  https://atelier-xm.sentry.io/issues/ — Para probar el circuito:
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://<host>/api/debug-sentry`
  lanza un error de prueba (el secreto va en el header, ya NO en `?secret=`, que
  quedaba en logs; verificado end-to-end el 2026-07-13). La app móvil todavía NO reporta a
  Sentry (opcional, requiere horneada).

<details>
<summary><b>Para técnicos</b></summary>

- Google: los 3 client IDs (web/Android/iOS) están en la memoria
  `google-login-credenciales`. SHA-1 del keystore EAS (perfil `pilot`):
  `34:B2:D5:A6:CB:25:65:CF:24:15:F8:F7:B2:F0:D9:03:0C:FE:63:25`.
- Resend: el remitente `onboarding@resend.dev` es provisorio hasta tener dominio
  propio; **decisión de marca: NO usar `ristorantemarche.it`**. El reply-to
  apunta al Gmail de Andy. El correo del magic link está **en italiano** a
  propósito para el piloto — no tocar.
- Restaurant del piloto: **"Kokoo"** (código `KOKOO-3ZUJ5V`), creado por Andy
  desde la app. **NO borrar.** User admin: `andygomezgc@gmail.com`.

</details>

---

## 8. Limitaciones conocidas

Cosas que hoy **no** están resueltas. Conviene tenerlas presentes para no
llevarse una sorpresa.

- **Tareas programadas nocturnas: no confiar.** Las tareas programadas locales
  **se traban en los prompts de permiso** — de madrugada no hay nadie que
  apruebe y la tarea muere a los segundos sin hacer nada (pasó el 2026-07-11 con
  la de las 04:35). No asumir que un trabajo nocturno se hizo: verificar. Para
  automatizar de verdad de noche haría falta una lista de permisos previa
  (allowlist). Mientras tanto, ese trabajo se hace en sesión interactiva.

- **Deploy manual, una sola persona (bus factor 1).** Hoy solo Andy (con la
  ayuda de Claude) despliega, a mano, desde su máquina. No hay CI/CD que lo haga
  solo. Si Andy no está, no se publica. (Automatizarlo sobre `main` es riesgoso
  hoy porque `main` tiene 242 archivos de borrador sin commitear.)

- **Sin entorno de staging.** No hay un "ensayo" separado con su propia base y
  sus propias variables. Los cambios grandes van directo de dev a producción. Un
  error se ve recién en prod.

- **Sin backups verificados** de la base ni copia del keystore (ver sección 7).

- **Monitoreo del backend: ACTIVO** (Sentry, ver sección 7). La app móvil aún
  no reporta crashes propios — se agrega en una horneada futura si hace falta.

- **Trabajo hecho pero sin hornear.** Papelera y duplicar de productos, y el
  export del recetario (PDF) y del banco (PDF/CSV) ya están en la rama con sus
  pruebas — llegan a los chefs con la próxima horneada + deploy.

- **iPhone fuera del piloto.** No hay cuenta Apple; el login con Google y el
  resto están cableados para iOS pero **no se pueden probar** hasta resolver la
  cuenta Apple. El piloto va 100% por APK Android.

---

*Fin del manual. Para el detalle histórico de decisiones y tropiezos, ver las
memorias del proyecto (`fase2-migracion-vercel-estado`, `auditoria-2026-07-plan`,
`atelier-dev-patrones-lecciones`, `vercel-env-add-stdin-roto`,
`google-login-credenciales`).*
