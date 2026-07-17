// Sentry incluye código nativo y no está disponible dentro de Expo Go.
// El require guardado evita que cargar este módulo tumbe la aplicación.
type SentryModule = typeof import("@sentry/react-native");
let sentry: SentryModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require("@sentry/react-native") as SentryModule;
} catch {
  sentry = null;
}

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";
let initialized = false;

export function initSentry() {
  if (!sentry || !dsn || initialized) return;

  try {
    sentry.init({
      dsn,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
    });
    initialized = true;
  } catch {
    // Crash reporting nunca debe impedir que la app arranque.
  }
}

export function captureException(err: unknown) {
  if (!sentry || !dsn || !initialized) return;

  try {
    sentry.captureException(err);
  } catch {
    // Reportar una excepción nunca debe generar otra excepción.
  }
}
