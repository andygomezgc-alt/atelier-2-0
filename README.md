# Atelier Culinaire

Cuaderno creativo del chef con asistente IA integrado. App nativa móvil (iOS/Android) con backend serverless.

Stack: pnpm monorepo · Next.js 15 (API) · Expo 55 (mobile) · Postgres (Neon) · Auth.js v5 + Resend · Anthropic SDK · Puppeteer · Vercel Blob.

## Estructura

```
apps/api        Next.js App Router en Vercel (auth + REST + PDF)
apps/mobile     Expo / React Native (iOS + Android)
packages/db     Prisma schema + cliente compartido
packages/shared permissions + zod contracts + utils
packages/i18n   diccionarios ES / IT / EN
```

## Estado: brief v4 completo

Las 5 fases del plan están implementadas y commiteadas:

- **Fase 0 — Esqueleto:** monorepo, schema Prisma, seed, tab bar, ProfileSheet, tema, login mock.
- **Fase 1 — Auth real:** magic link por Resend, JWT firmado con `jose`, 4 pantallas de onboarding, `/api/me`, `/api/restaurant`.
- **Fase 2 — Núcleo:** Inicio con captura offline (AsyncStorage), Recetas con CRUD + estados, Asistente con Anthropic streaming (SSE) + prompt caching ephemeral.
- **Fase 3 — Composición:** Menús con CRUD, AddToMenuSheet, exportación PDF server-side con 3 plantillas (elegant/rustic/minimal).
- **Fase 4 — Equipo:** Casa con código copy/share/regen, StaffMemberSheet con cambio de rol y eliminación, `usePermissions` hook centralizado.
- **Fase 5 — Pulido:** NetworkError component, fotos de perfil/restaurante via Vercel Blob, i18n trilingüe completo.

Verificación automatizada: 5 paquetes typecheck verde, 62 tests pasando, `/api/health` 200, `/api/mobile/auth/request` envía correo real.

**Producción (piloto)**
- API: <https://atelier-2-0-mu.vercel.app> (Vercel, región `fra1`)
- DB: Neon Postgres (proyecto `atelier-prod`, región Frankfurt)
- Storage: Vercel Blob (`atelier-photos`)
- Mobile: Expo Go con `--tunnel` desde el portátil del autor (ver "Operación piloto" abajo)

## Configuración

Crea `.env.local` (raíz del repo) y `apps/api/.env.local` con los mismos valores:

```
DATABASE_URL=postgresql://...neon.tech/...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
AUTH_SECRET=<mismo que NEXTAUTH_SECRET>
RESEND_API_KEY=re_...
RESEND_FROM=Atelier <onboarding@resend.dev>
ANTHROPIC_API_KEY=sk-ant-...
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...    # opcional, fotos
EXPO_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Setup inicial:

1. **Postgres en Neon.** Crear proyecto + DB; copiar `DATABASE_URL` con `?sslmode=require`.
2. **Resend.** Cuenta + API key con permiso "Sending access". Sandbox `onboarding@resend.dev` solo envía a tu propio email; añade dominio propio para el resto.
3. **Anthropic.** API key con créditos.
4. **Vercel Blob (opcional).** Token `BLOB_READ_WRITE_TOKEN` solo si quieres habilitar fotos de perfil/restaurante.
5. **Apple Developer + EAS.** Necesarios para el build TestFlight.

## Arranque local

```bash
pnpm install
pnpm db:generate
pnpm --filter @atelier/db exec prisma migrate deploy
pnpm db:seed                   # carga restaurante demo Ristorante Marche
pnpm dev:api                   # http://localhost:3000
pnpm dev:mobile                # Metro + QR para Expo Go
```

Verificación:
- `curl http://localhost:3000/api/health` → `{"status":"ok",…}`
- `pnpm db:studio` → muestra Ristorante Marche, 4 usuarios, 8 recetas, 3 menús
- En iPhone con Expo Go: escanear QR de Metro, escribir email, recibir magic link, click → app loguea, llega a Inicio con datos reales

## Tests y typecheck

```bash
pnpm -r typecheck              # 5 paquetes
pnpm -r test                   # 62 tests entre @atelier/shared y @atelier/i18n
```

## Operación piloto (Expo Go + tunnel)

Durante la fase piloto (Andy solo, luego 4-6 chefs), la app móvil corre en **Expo Go**
contra el backend de Vercel. El bundle JS se sirve desde el portátil del autor via
**tunnel de Expo** (basado en ngrok), por lo que el portátil tiene que estar
**encendido** y con internet mientras alguien use la app desde el móvil. Las llamadas
a la API van directas a Vercel (no pasan por el tunnel), así que los datos viajan en
HTTPS sin saltos extra.

### Arrancar el tunnel cada mañana

1. Abrir terminal en la raíz del repo:
   ```
   C:\Users\Utente\Desktop\atelier-2-0
   ```
2. Ejecutar:
   ```bash
   pnpm dev:mobile:tunnel
   ```
3. Esperar ~20 s. Cuando el tunnel está listo verás en la consola:
   ```
   Tunnel ready.
   › Metro waiting on exp://xxxxxx-andy.anonymous.atelier.exp.direct:80
   › Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
   ```
4. **Si en lugar de "Tunnel ready" ves "Install @expo/ngrok globally?"**, responder `y` y darle 1-2 min a la primera instalación. Próximas veces ya no preguntará.
5. Escanear el QR con Expo Go (Android) o con la cámara nativa (iOS) y la app abre.

### Confirmación visual

- Línea `Logs for your project will appear below.` significa que el tunnel está
  vivo y escuchando.
- Si el tunnel se cae verás `Tunnel connection has been closed` o `ECONNRESET`.
- Para parar: `Ctrl+C` en la consola.

### Si el tunnel se cae mientras estás en cocina

- La app que ya tenías abierta en el iPhone **sigue funcionando** para llamadas a la
  API (van directo a Vercel, no dependen del tunnel).
- Lo que se rompe es **recargar el bundle**: si cerrás la app y la reabrís, Expo Go
  no podrá descargar el JS y verás la pantalla roja de Expo Go ("Could not connect
  to development server"). Solución: reiniciar el tunnel desde el portátil.
- Las llamadas a la API tienen **timeout de 30 s**: si Vercel o tu red móvil cuelgan
  más de 30 s, la app lanza `NetworkError` y el componente `<NetworkError />` con
  botón "Reintentar" aparece donde el flujo lo soporta (asistente IA por ahora).

### Path a EAS Build (sin dependencia del portátil)

Cuando termine la semana de uso solo y sirva para invitar a chefs piloto, hay que
pasar a un build standalone con **EAS Build** (Apple Developer Account requerido,
$99/año). Esto elimina Expo Go y el tunnel: la app se instala como `.ipa` real en el
iPhone via TestFlight o Internal Distribution. Documento de ejecución pendiente.

## API endpoints

| Método | Path | Descripción |
|--------|------|-------------|
| GET | /api/health | health check |
| POST | /api/mobile/auth/request | envía magic link |
| POST | /api/mobile/auth/verify | valida token y devuelve JWT |
| GET/PATCH | /api/me | usuario actual |
| GET | /api/restaurant | restaurante + staff |
| POST | /api/restaurant | crear restaurante |
| POST | /api/restaurant/join | unirse con código |
| POST | /api/restaurant/invite | regenerar código (admin) |
| PATCH/DELETE | /api/restaurant/staff/[userId] | gestión de roles (admin) |
| POST | /api/me/photo · /api/restaurant/photo | upload fotos via Vercel Blob |
| GET/POST | /api/ideas + PATCH/DELETE /api/ideas/[id] | bloc de ideas |
| GET/POST | /api/recipes + GET/PATCH/DELETE /api/recipes/[id] | recetas con estados |
| GET/POST | /api/conversations + GET/POST /api/conversations/[id]/messages (SSE) | chat con IA |
| GET/POST | /api/menus + GET/PATCH /api/menus/[id] | menús |
| POST/PATCH/DELETE | /api/menus/[id]/items[/itemId] | platos |
| GET | /api/menus/[id]/pdf?style= | exportar PDF |

## Plan de implementación (histórico)

`C:\Users\Utente\.claude\plans\atelier-culinaire-harmonic-bear.md` — el plan original con las 5 fases.

## Prototipo

`project/` contiene el prototipo HTML/CSS/JS del que partió la app. Conservado como referencia visual y de copy.
