# Atelier Culinaire

Cuaderno creativo del chef con asistente IA integrado. App nativa móvil (iOS/Android) con backend serverless.

Stack: pnpm monorepo · Next.js (API) · Expo (mobile) · Postgres (Neon) · Auth.js + Resend · Anthropic API · Puppeteer.

## Estructura

```
apps/api        Next.js App Router en Vercel (auth + REST + PDF)
apps/mobile     Expo / React Native (iOS + Android)
packages/db     Prisma schema + cliente compartido
packages/shared permissions + zod contracts + utils
packages/i18n   diccionarios ES / IT / EN
```

## Arranque local

Pre-requisitos: Node 20+, pnpm 9+, una `DATABASE_URL` en `.env.local` (raíz).

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# en una terminal
pnpm dev:api

# en otra
pnpm dev:mobile
```

## Plan de implementación

`C:\Users\Utente\.claude\plans\atelier-culinaire-harmonic-bear.md`.

## Prototipo (histórico)

`project/` contiene el prototipo HTML/CSS/JS hecho con Claude Design del que partió la app. No se ejecuta en producción; se conserva como referencia visual y de copy.
