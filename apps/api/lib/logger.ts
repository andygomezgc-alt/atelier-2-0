// Structured JSON logger. One line per call. Vercel parses JSON automatically.
// info/debug -> stdout; warn/error -> stderr.

type Ctx = Record<string, unknown>;
type Level = "info" | "warn" | "error" | "debug";

function emit(level: Level, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(ctx ?? {}) });
  if (level === "warn" || level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
};
