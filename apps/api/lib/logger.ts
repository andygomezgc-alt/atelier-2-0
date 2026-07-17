// Structured JSON logger. One line per call. Vercel parses JSON automatically.
// info/debug -> stdout; warn/error -> stderr.

import * as Sentry from "@sentry/nextjs";

type Ctx = Record<string, unknown>;
type Level = "info" | "warn" | "error" | "debug";

function emit(level: Level, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(ctx ?? {}) });
  if (level === "warn" || level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");

  if (level === "error") {
    try {
      const meta: Ctx = ctx ?? {};
      const { error, ...extra } = meta;
      Sentry.captureException(error instanceof Error ? error : new Error(msg), { extra });
    } catch {
      // Sentry nunca debe romper el logger ni la respuesta del request.
    }
  }
}

export const logger = {
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
};

// Recorta el correo para no guardarlo en claro en los logs: "andy@gmail.com"
// -> "a***@gmail.com". Mantiene el dominio (útil para depurar) y la inicial.
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
