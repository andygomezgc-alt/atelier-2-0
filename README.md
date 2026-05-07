# Atelier Culinaire

Cuaderno creativo del chef con asistente IA integrado. App nativa móvil (iOS/Android) con backend serverless.

Stack: pnpm monorepo · Next.js 15 (API) · Expo 55 (mobile) · Postgres (Neon) · Auth.js + Resend · Anthropic API · Puppeteer.

## Estructura

```
apps/api        Next.js App Router en Vercel (auth + REST + PDF)
apps/mobile     Expo / React Native (iOS + Android)
packages/db     Prisma schema + cliente compartido
packages/shared permissions + zod contracts + utils
packages/i18n   diccionarios ES / IT / EN
```

## Estado: Fase 0 completada

Todo lo necesario para que la app arranque está commiteado. La Fase 0 entrega:

- Monorepo pnpm con 5 paquetes typados (typecheck verde en los 5).
- Esquema Prisma con la migración inicial pre-generada (`packages/db/prisma/migrations/`) y seed que replica el restaurante demo del prototipo.
- Permissions, invite-code y zod API contracts probados (58 tests pasando).
- API Next 15 con Auth.js v5 + Resend EmailProvider montado y un `/api/health` que responde 200 en local.
- App Expo 55 con tab bar (5 tabs), header con marca + avatar, ProfileSheet completo y datos mock visibles en Casa.

## Configuración inicial (lo que necesita el operador)

1. **Postgres en Neon.** Crear un proyecto, una rama `main`, copiar el `DATABASE_URL` (con `?sslmode=require`).
2. **Resend.** Crear una cuenta y un dominio; copiar `RESEND_API_KEY` y configurar `RESEND_FROM`.
3. **Anthropic.** API key con créditos. Solo se usa a partir de Fase 2.
4. **Apple Developer + EAS.** Necesarios para el build dev en TestFlight (Fase 0.10 / Fase 5).
5. Crear `.env.local` en la raíz copiando `.env.example` y rellenando los valores reales.

## Arranque local

```bash
pnpm install                     # instala todo el monorepo
pnpm db:generate                 # genera el cliente Prisma
pnpm --filter @atelier/db exec prisma migrate deploy   # aplica migración inicial
pnpm db:seed                     # carga el restaurante demo

pnpm dev:api                     # arranca http://localhost:3000
pnpm dev:mobile                  # arranca Metro y muestra QR para Expo Go / dev client
```

Verificación rápida:

- `curl http://localhost:3000/api/health` debe devolver `{"status":"ok",…}`.
- `pnpm db:studio` abre Prisma Studio con el restaurante demo y los 4 usuarios.
- En Expo Go o dev client, la app entra en `(auth)/login`, escribir cualquier email + tap deja al usuario en Inicio (los demás tabs renderizan placeholders).

## Tests y typecheck

```bash
pnpm -r typecheck                # 5 paquetes, todos verdes
pnpm -r test                     # 58 tests entre @atelier/shared y @atelier/i18n
```

## Plan de implementación

`C:\Users\Utente\.claude\plans\atelier-culinaire-harmonic-bear.md` — fases 1 a 5 ya escritas.

## Prototipo (histórico)

`project/` contiene el prototipo HTML/CSS/JS hecho con Claude Design del que partió la app. No se ejecuta en producción; se conserva como referencia visual y de copy.
