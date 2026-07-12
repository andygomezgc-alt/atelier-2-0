// Sentry — crash-tracking del backend (bloque 4 de la auditoría, jul 2026).
// Solo se activa si SENTRY_DSN está seteada (en Vercel prod); en dev sin la
// env queda apagado y no molesta. Errores solamente: tracing apagado para
// no sumar latencia ni cuota.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  // Los 4xx esperables (validación, auth) no son crashes; solo unhandled.
  environment: process.env.VERCEL_ENV ?? "development",
});
