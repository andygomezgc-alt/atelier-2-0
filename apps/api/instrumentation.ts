// Hook de instrumentación de Next 15: carga Sentry en el runtime nodejs y
// reporta los errores no manejados de requests (App Router).

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
