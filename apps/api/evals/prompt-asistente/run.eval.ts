// Prueba del prompt del asistente: baseline (prompt congelado) frente a v1 (lib/anthropic-system.md).
// Cada caso pasa por streamChat, la entrada real del chat (modelos, razonamiento y manejo de errores
// de producción); solo se simula el presupuesto. Las respuestas se califican con checks.ts y el juez,
// y quedan en <worktree>/.claude/hillclimb/<carpeta>/<variante>/ para build-report-lite.
//
//   EVAL_VARIANT=baseline|v1 (obligatoria) pnpm -C apps/api eval:prompt
//   Alcance, obligatorio sin EVAL_DRY_RUN: EVAL_CASES=id,id para unos casos o EVAL_ALL=1 para todos.
//   EVAL_RUN=<nombre>: carpeta propia, prompt-asistente-<nombre>, para que el piloto y la corrida completa
//     nunca compartan filas.
//   EVAL_MODES=creative,daily  EVAL_REPS=1  EVAL_CONCURRENCY=4
//     haiku (solo en la prueba): el Diario respondido por claude-haiku-5-5 en vez de Gemini, por la misma rama de
//     Anthropic de streamChat, para comparar calidad y precio. Solo necesita ANTHROPIC_API_KEY.
//     EVAL_HAIKU_EFFORT=low|medium|high|xhigh|max fija su esfuerzo (sin ella, medium, el de producción).
//   EVAL_TIMEOUT_S=300: límite real de cada intento (llega a streamChat como deadlineAt).
//   EVAL_ENV_FILE=<ruta>: carga de ese archivo solo ANTHROPIC_API_KEY y GEMINI_API_KEY.
//   EVAL_JUDGE_MODEL (por defecto claude-sonnet-5-5) y EVAL_JUDGE_EFFORT=low|medium|high|xhigh|max (sin ella,
//     el esfuerzo por defecto del modelo). El juez va en streaming; EVAL_JUDGE_TIMEOUT_S=900 es su techo por intento.
//   EVAL_JUDGE_SANITY=1: solo comprueba el juez con tres respuestas malas por caso (vacía, «No lo sé.» y la
//     respuesta a otra pregunta); respeta EVAL_CASES/EVAL_ALL, no escribe nada e imprime el uso del juez.
//   EVAL_DRY_RUN=oracle|null: sin red, en prompt-asistente-dryrun-<modo>; respuestas fijas y un juez simulado
//     que aprueba o suspende todo.
// Sin EVAL_DRY_RUN cada corrida hace llamadas pagadas a Anthropic y a Gemini; antes de empezar dice cuántas.
// Reanudar: las filas calificadas se saltan y una generación guardada en generations/ se vuelve a juzgar sin
// regenerarla. Si cambia el prompt, un caso, el juez o las comprobaciones, la huella de las filas deja de
// coincidir y la corrida se niega a seguir en esa carpeta. Un .lock impide dos corridas de la misma variante, y
// _manifest.json (manifest.ts) impide que dos variantes con distinta configuración compartan carpeta, aunque arranquen a la vez.
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { MemoryPreferenceSchema } from "@atelier/shared";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Solo se simula el presupuesto, para que nada toque la base de datos.
vi.mock("../../lib/ai/budget", () => ({
  settleGeneration: async () => undefined,
  settleInterruptedGeneration: async () => undefined,
  releaseGeneration: async () => undefined,
}));

// «haiku» no es un modo de producto: en producción normalizeChatMode lo convierte en daily (Gemini). Aquí es el
// Diario con Claude Haiku 5.5, con los mismos tokens máximos y plazo que el Diario y el razonamiento de la rama de
// Anthropic de streamChat. Solo esta prueba ve el cambio; el resto de selecciones llegan intactas. Con
// EVAL_HAIKU_EFFORT el config lleva ese esfuerzo (y entra en la huella); sin ella no lleva ninguno y rige medium.
vi.mock("../../lib/ai/config", async importOriginal => {
  const actual = await importOriginal<typeof import("../../lib/ai/config")>();
  return {
    ...actual,
    chatConfig: (selection?: Parameters<typeof actual.chatConfig>[0]) => {
      if (selection !== "haiku") return actual.chatConfig(selection);
      const effort = haikuEffort();
      return { ...actual.aiConfig("daily"), provider: "anthropic" as const, model: "claude-haiku-5-5", ...(effort && { effort }) };
    },
  };
});

import type { Reservation } from "../../lib/ai/budget";
import { ChatError, streamChat } from "../../lib/ai/chat";
import { chatConfig, type AiEffort } from "../../lib/ai/config";
import { emptyUsage, type AiUsage } from "../../lib/ai/types";
import { buildSystemBlocks } from "../../lib/anthropic";
import { memoryContext } from "../../lib/culinary-memory/evidence";
import { deterministicGrades, wordCount, type Lang } from "./checks";
import { ensureRunManifest } from "./manifest";
import {
  JUDGE_SYSTEM, JudgeError, judge, judgeEffort, judgeModel, judgeRequest,
  type CriterionResult, type JudgeEffort, type JudgeInput, type JudgeResult, type JudgeUsage,
} from "./judge";

type Variant = "baseline" | "v1";
type Mode = "creative" | "daily" | "haiku";
type DryRun = "oracle" | "null";
type Status = "ok" | "refused" | "truncated";
type System = ReturnType<typeof buildSystemBlocks>;

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const PROMPTS: Record<Variant, string> = { baseline: join(HERE, "baseline-prompt.md"), v1: resolve(HERE, "../../lib/anthropic-system.md") };

const Turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) });
const Restaurant = z.object({
  name: z.string().min(1), city: z.string().nullable(), identityLine: z.string().nullable(), chefNotes: z.array(z.string()),
  memory: z.object({
    // Lo que el chef declaró en «Cómo cocinamos»: llega como indicadasPorElChef. Opcional y sin valor por
    // defecto, para que los restaurantes sin correcciones se rendericen igual que antes.
    corrections: z.array(MemoryPreferenceSchema).optional(),
    tendencias: z.array(MemoryPreferenceSchema),
    frecuentes: z.array(z.object({ name: z.string().min(1), recipes: z.number().int().positive() })),
  }).nullable(),
  recentRecipes: z.array(z.string()), speakerName: z.string().nullable(),
});
const Case = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), restaurant: z.string(), tags: z.array(z.string()), lang: z.enum(["es", "it", "en"]),
  recipe: z.boolean(), pinnedIdea: z.string().nullable(), messages: z.array(Turn).min(1), criteria: z.array(z.string().min(1)).min(1),
});
const CasesFile = z.object({
  currentMonth: z.string().datetime(), globalCriteria: z.array(z.string().min(1)),
  restaurants: z.record(Restaurant), cases: z.array(Case),
}).superRefine((data, ctx) => {
  const ids = new Set<string>();
  for (const kase of data.cases) {
    if (ids.has(kase.id)) ctx.addIssue({ code: "custom", message: `caso repetido: ${kase.id}` });
    ids.add(kase.id);
    if (!data.restaurants[kase.restaurant]) ctx.addIssue({ code: "custom", message: `${kase.id}: restaurante desconocido ${kase.restaurant}` });
    if (kase.messages.at(-1)?.role !== "user") ctx.addIssue({ code: "custom", message: `${kase.id}: el último mensaje tiene que ser del chef` });
  }
});
type EvalData = z.infer<typeof CasesFile>;
type EvalCase = z.infer<typeof Case>;
type EvalTurn = z.infer<typeof Turn>;

const Usage = z.object({ inputTokens: z.number(), outputTokens: z.number(), cachedTokens: z.number(), reasoningTokens: z.number(), cacheWriteTokens: z.number().optional() });
const SavedGeneration = z.object({
  fingerprint: z.string(), text: z.string(), status: z.enum(["ok", "refused", "truncated"]), stopReason: z.string(),
  usage: Usage.optional(), latencyS: z.number(), attempts: z.number().int().positive(), failedUsage: Usage.optional(),
});
type Generation = Omit<z.infer<typeof SavedGeneration>, "fingerprint">;

const list = (raw: string) => [...new Set(raw.split(",").map(item => item.trim()).filter(Boolean))];

function positive(name: string, fallback: number, integer: boolean): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) throw new Error(`${name} tiene que ser un número ${integer ? "entero " : ""}positivo`);
  return value;
}

const oneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T => values.some(item => item === value);

/** EVAL_HAIKU_EFFORT, o undefined para el esfuerzo de producción (medium). */
function haikuEffort(): AiEffort | undefined {
  const raw = process.env.EVAL_HAIKU_EFFORT?.trim() || undefined;
  if (raw !== undefined && !oneOf<AiEffort>(["low", "medium", "high", "xhigh", "max"], raw)) throw new Error("EVAL_HAIKU_EFFORT admite low, medium, high, xhigh o max");
  return raw;
}

function settings() {
  const sanity = process.env.EVAL_JUDGE_SANITY?.trim() === "1";
  // La comprobación del juez no depende de la variante: sin EVAL_VARIANT usa baseline, que no llega a leer.
  const variant = process.env.EVAL_VARIANT?.trim() || (sanity ? "baseline" : undefined);
  if (!oneOf<Variant>(["baseline", "v1"], variant)) throw new Error("Falta EVAL_VARIANT: baseline (prompt congelado) o v1 (lib/anthropic-system.md)");
  const dryRun = process.env.EVAL_DRY_RUN?.trim() || undefined;
  if (dryRun !== undefined && !oneOf<DryRun>(["oracle", "null"], dryRun)) throw new Error("EVAL_DRY_RUN admite oracle o null");
  const caseIds = process.env.EVAL_CASES?.trim() ? list(process.env.EVAL_CASES) : undefined;
  // Una corrida real sin alcance explícito podría gastar la prueba entera por un descuido.
  if (!dryRun && !caseIds && process.env.EVAL_ALL?.trim() !== "1") {
    throw new Error("Falta el alcance de una corrida pagada: EVAL_CASES=id,id para unos casos o EVAL_ALL=1 para todos");
  }
  const run = process.env.EVAL_RUN?.trim() || undefined;
  if (run !== undefined && !/^[a-z0-9][a-z0-9-]*$/i.test(run)) throw new Error("EVAL_RUN solo admite letras, números y guiones");
  // Los modos de producto y haiku: normalizeChatMode convertiría cualquier otro valor en daily sin avisar.
  const modes = list(process.env.EVAL_MODES ?? "creative,daily").map(mode => {
    if (!oneOf<Mode>(ALL_MODES, mode)) throw new Error(`EVAL_MODES: modo desconocido «${mode}» (creative, daily o haiku)`);
    return mode;
  });
  if (!modes.length) throw new Error("EVAL_MODES está vacía");
  haikuEffort(); // Falla aquí, antes de cualquier trabajo, si el valor no es válido.
  const timeoutS = positive("EVAL_TIMEOUT_S", 300, false);
  const judgeTimeoutS = positive("EVAL_JUDGE_TIMEOUT_S", 900, false);
  if (Math.max(timeoutS, judgeTimeoutS) * 1000 > 2_147_483_647) throw new Error("EVAL_TIMEOUT_S o EVAL_JUDGE_TIMEOUT_S es demasiado grande");
  return {
    variant, dryRun, run, modes, caseIds, reps: positive("EVAL_REPS", 1, true), concurrency: positive("EVAL_CONCURRENCY", 4, true), timeoutS,
    judgeTimeoutS, judgeEffort: judgeEffort(), sanity,
  };
}

const KEY_NAMES: readonly string[] = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"];

/** Lee del archivo solo las dos claves y nunca las muestra. Lo que dice el archivo manda sobre el entorno. */
function loadKeys(path: string): void {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const [, name, rest = ""] = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line) ?? [];
    if (!name || !KEY_NAMES.includes(name)) continue;
    const raw = rest.trim();
    const quoted = /^(["'])(.*)\1\s*(?:#.*)?$/.exec(raw);
    const value = quoted ? quoted[2] ?? "" : raw.replace(/\s+#.*$/, "");
    if (value) process.env[name] = value;
  }
}

function requireKeys(modes: Mode[]): void {
  // El juez usa Anthropic siempre; Gemini solo hace falta para el modo Diario.
  const missing = ["ANTHROPIC_API_KEY", ...(modes.includes("daily") ? ["GEMINI_API_KEY"] : [])].filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Falta${missing.length > 1 ? "n" : ""} ${missing.join(" y ")}: defínela${missing.length > 1 ? "s" : ""} en el entorno o en el archivo de EVAL_ENV_FILE`);
}

/** El sistema de producción para el caso, con los principios cambiados por los de la variante. */
function systemFor(data: EvalData, kase: EvalCase, prompt: string): System {
  const r = data.restaurants[kase.restaurant];
  if (!r) throw new Error(`restaurante desconocido ${kase.restaurant}`);
  const memory = r.memory ? memoryContext(r.memory.corrections ?? [], r.memory.tendencias.map(fact => ({ ...fact, sources: [] })), [], r.memory.frecuentes) : "";
  const [principles, ...rest] = buildSystemBlocks(
    { name: r.name, identityLine: r.identityLine, chefNotes: r.chefNotes, city: r.city },
    r.recentRecipes.map(title => ({ title })), kase.pinnedIdea, memory || null,
    { speakerName: r.speakerName, now: new Date(data.currentMonth) },
  );
  if (!principles) throw new Error("buildSystemBlocks no devolvió los principios");
  return [{ ...principles, text: prompt }, ...rest];
}

/** El mes simulado tal como lo escribe buildSystemBlocks en el bloque vivo del sistema («octubre de 2026»). */
function currentMonthText(data: EvalData): string {
  const live = buildSystemBlocks({ name: "-", identityLine: null }, [], null, null, { now: new Date(data.currentMonth) }).at(-1)?.text ?? "";
  const json = /\n```json\n(.+)\n```$/.exec(live)?.[1];
  const month: unknown = json ? (JSON.parse(json) as { currentMonth?: unknown }).currentMonth : undefined;
  if (typeof month !== "string") throw new Error("buildSystemBlocks no escribió currentMonth en el bloque vivo");
  return month;
}

/** Lo que el juez sabe del restaurante: los datos del caso y el mes simulado, nunca el prompt de la variante. */
function judgeContext(data: EvalData, kase: EvalCase): Record<string, unknown> {
  const r = data.restaurants[kase.restaurant];
  return {
    nombre: r?.name, ciudad: r?.city, mesActual: currentMonthText(data), identidad: r?.identityLine, notasDelChef: r?.chefNotes,
    memoria: r?.memory, recetasRecientes: r?.recentRecipes, quienEscribe: r?.speakerName, ideaAnclada: kase.pinnedIdea,
  };
}

// Simulación oracle: una respuesta por idioma que pasa todas las comprobaciones deterministas.
const ORACLE: Record<Lang, string> = {
  es: [
    "Para 10 raciones, con el punto de siempre.", "", "**Ingredientes**",
    "- 1 kg judiones de La Granja", "- 200 g chorizo", "- 150 g panceta", "- 2 dientes de ajo", "- 8 g pimentón de la Vera", "",
    "**Método**", "1. Pon los judiones en remojo 12 horas en agua fría.", "2. Cuécelos a fuego muy suave hasta que estén tiernos pero enteros.",
    "3. Añade el sofrito y deja reposar 10 minutos antes de servir.", "",
    "Mejora: asusta la cocción con agua fría dos veces para que la piel no se rompa.",
  ].join("\n"),
  it: [
    "Per 6 persone, nella versione di casa.", "", "**Ingredienti**",
    "- 1,5 kg pesce di scoglio misto", "- 400 g pomodori pelati", "- 100 ml aceto di vino bianco", "- 80 ml olio extravergine di oliva", "- 2 spicchi di aglio", "",
    "**Procedimento**", "1. Pulisci il pesce e taglialo in pezzi della stessa misura.", "2. Soffriggi l'aglio nell'olio, poi sfuma con l'aceto.",
    "3. Aggiungi il pomodoro e il pesce, dal più sodo al più tenero, e cuoci 20 minuti senza mescolare.", "",
    "Miglioramento: servi il brodetto con pane tostato strofinato con l'aglio.",
  ].join("\n"),
  en: [
    "Serves 8, finished just before service.", "", "**Ingredients**",
    "- 1.2 kg celeriac, peeled and diced", "- 150 g unsalted butter", "- 1.5 l chicken stock", "- 200 ml double cream", "- 8 g fine salt", "",
    "**Method**", "1. Brown the butter until it smells of hazelnut and the solids turn golden.", "2. Add the celeriac and cook it for 10 minutes without colour.",
    "3. Pour in the stock, simmer for 25 minutes until tender, then blend with the cream.", "",
    "Improvement: keep some brown butter back to spoon over each bowl at the pass.",
  ].join("\n"),
};

// streamChat cierra la reserva al terminar; con budget simulado esta no llega a ninguna base de datos.
const RESERVATION: Reservation = { id: "eval", budgetId: "eval", micros: 0, rate: { input: 0, output: 0, cached: 0, cacheWrite: 0 } };
const RETRYABLE = new Set(["ai_rate_limited", "ai_provider_failed"]);
const TIMEOUTS = new Set(["ai_timeout", "eval_timeout"]);
const MAX_ATTEMPTS = 3;
const JUDGE_ATTEMPTS = 3;

type Attempt = { text: string; usage?: AiUsage; error?: { cause: unknown } };

class CeilingError extends Error {}

/** Generación que no se pudo completar: va a errors.jsonl, sin fila en results.jsonl, y la reanudación la repite. */
class AttemptFailure extends Error {
  constructor(readonly code: string, readonly attempts: number, readonly usage: AiUsage | undefined, options: { cause: unknown }) {
    super(code, options);
  }
}

/** El juez falló después de sus reintentos; la causa dice por qué. */
class JudgeFailure extends Error {
  constructor(readonly attempts: number, options: { cause: unknown }) {
    super("judge_failed", options);
  }
}

function codeOf(error: unknown): string {
  if (error instanceof JudgeFailure) return codeOf(error.cause);
  if (error instanceof ChatError || error instanceof JudgeError || error instanceof AttemptFailure) return error.code;
  if (error instanceof CeilingError) return "eval_timeout";
  if (error instanceof APIError) return `api_error_${error.status ?? "connection"}`;
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

function failureClass(code: string): string {
  if (code === "ai_rate_limited") return "rate_limited";
  if (code === "ai_provider_failed") return "provider_error";
  if (TIMEOUTS.has(code)) return "timeout";
  return "harness_error";
}

function addUsage(total: AiUsage | undefined, usage: AiUsage | undefined): AiUsage | undefined {
  if (!usage) return total;
  const sum = total ?? emptyUsage();
  return {
    inputTokens: sum.inputTokens + usage.inputTokens, outputTokens: sum.outputTokens + usage.outputTokens,
    cachedTokens: sum.cachedTokens + usage.cachedTokens, reasoningTokens: sum.reasoningTokens + usage.reasoningTokens,
    cacheWriteTokens: (sum.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
  };
}

/** Uso con los nombres que lee el reporte; input_tokens es la entrada sin caché. */
function rowUsage(usage: AiUsage | undefined) {
  const u = usage ?? emptyUsage();
  const written = u.cacheWriteTokens ?? 0;
  return { input_tokens: Math.max(0, u.inputTokens - u.cachedTokens - written), output_tokens: u.outputTokens, cache_read_input_tokens: u.cachedTokens, cache_creation_input_tokens: written };
}

const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
const backoff = (attempts: number) => Math.min(30_000, 1000 * 2 ** (attempts - 1)) * (0.5 + Math.random());

/**
 * Un intento con el plazo de un turno gestionado de producción: deadlineAt llega a streamChat y la señal
 * se aborta al vencer, aunque el stream siga vivo.
 */
async function attempt(mode: Mode, system: System, messages: EvalTurn[], timeoutS: number): Promise<Attempt> {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutS * 1000;
  const seen: Attempt = { text: "" };
  const run = (async () => {
    for await (const event of streamChat({ model: mode, system, messages, signal: controller.signal, reservation: RESERVATION, deadlineAt })) {
      if (event.type === "delta") seen.text += event.text;
      else seen.usage = event.usage;
    }
  })();
  run.catch(() => undefined); // Si vence el plazo, el stream abortado no deja un rechazo sin atender.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new CeilingError("eval_timeout")); }, Math.max(0, deadlineAt - Date.now()));
  });
  try {
    await Promise.race([run, ceiling]);
    return { ...seen };
  } catch (cause) {
    return { ...seen, error: { cause } };
  } finally {
    clearTimeout(timer);
  }
}

async function generate(mode: Mode, system: System, messages: EvalTurn[], timeoutS: number): Promise<Generation> {
  const provider = chatConfig(mode).provider;
  const okStop = provider === "anthropic" ? "end_turn" : "STOP";
  let failedUsage: AiUsage | undefined;
  let timeouts = 0;
  for (let attempts = 1; ; attempts++) {
    const started = Date.now();
    const result = await attempt(mode, system, messages, timeoutS);
    const base = { text: result.text, usage: result.usage, latencyS: (Date.now() - started) / 1000, attempts, failedUsage };
    if (!result.error) return { ...base, status: "ok", stopReason: okStop };
    const code = codeOf(result.error.cause);
    // Un rechazo o una respuesta incompleta son resultados de la variante, no fallos del arnés.
    if (code === "chat_refused" || code === "ai_response_blocked") return { ...base, status: "refused", stopReason: code };
    if (code === "chat_response_incomplete") return { ...base, status: "truncated", stopReason: code };
    failedUsage = addUsage(failedUsage, result.usage);
    const cause = result.error.cause;
    // Anthropic: un 4xx que no es 429 es un fallo de la petición o de la cuenta y reintentarlo no lo arregla.
    // Gemini no expone el estado sin tocar el código de producción, así que sigue la regla general.
    const status = provider === "anthropic" && cause instanceof ChatError && cause.cause instanceof APIError ? cause.cause.status : undefined;
    if (status !== undefined && status >= 400 && status < 500 && status !== 429) throw new AttemptFailure(`api_error_${status}`, attempts, failedUsage, { cause });
    if (TIMEOUTS.has(code)) timeouts++;
    // Un plazo vencido se reintenta una sola vez: otro igual saldría tan caro como el primero.
    const retryable = RETRYABLE.has(code) || (TIMEOUTS.has(code) && timeouts < 2);
    if (!retryable || attempts >= MAX_ATTEMPTS) throw new AttemptFailure(code, attempts, failedUsage, { cause });
    const retryAfterMs = cause instanceof ChatError && cause.retryAfter ? cause.retryAfter * 1000 : 0;
    await sleep(Math.max(retryAfterMs, backoff(attempts)));
  }
}

/** Solo lo pasajero se reintenta (429, 529, 5xx, conexión); un rechazo, un corte o una salida inválida fallan ya. */
function transientJudgeError(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  return error instanceof APIError && error.status !== undefined && (error.status === 429 || error.status >= 500);
}

type JudgeOptions = { client: Anthropic; model: string; effort?: JudgeEffort; timeoutS: number };

async function judgeWithRetry(input: JudgeInput, options: JudgeOptions): Promise<{ verdict: JudgeResult; attempts: number }> {
  for (let attempts = 1; ; attempts++) {
    try {
      // Techo de reloj por intento: con esfuerzo alto el juez puede razonar varios minutos.
      const signal = AbortSignal.timeout(options.timeoutS * 1000);
      return { verdict: await judge(input, { client: options.client, model: options.model, effort: options.effort, signal }), attempts };
    } catch (cause) {
      if (!transientJudgeError(cause) || attempts >= JUDGE_ATTEMPTS) throw new JudgeFailure(attempts, { cause });
      // Si un 429 o un 529 piden esperar más que el backoff (Retry-After, en segundos), se espera eso.
      const retryAfter = cause instanceof APIError && (cause.status === 429 || cause.status === 529) ? Number(cause.headers?.get("retry-after")) : Number.NaN;
      await sleep(Math.max(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0, backoff(attempts)));
    }
  }
}

function readJsonl(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").flatMap(line => {
    if (!line.trim()) return [];
    try {
      const value: unknown = JSON.parse(line);
      return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
    } catch { return []; }
  });
}

const slotKey = (promptId: string, rep: unknown) => `${promptId}\u0000${String(rep)}`;
const slotOf = (row: Record<string, unknown>) => slotKey(String(row.prompt_id), row.rep);
const fingerprintOf = (row: Record<string, unknown>) => (row.meta as { fingerprint?: unknown } | undefined)?.fingerprint;

/** Si un corte dejó la última línea a medias, la siguiente fila empieza en una línea nueva. */
function sealTornLine(path: string): void {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (text && !text.endsWith("\n")) appendFileSync(path, "\n");
}

const append = (path: string, record: unknown) => appendFileSync(path, JSON.stringify(record) + "\n");
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const fixed = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(3));

/** Media sobre casos (cada caso, media de sus reps) e intervalo de Wald al 95 %, recortado a [0, 1]. */
function interval(values: number[]): { mean?: number; lo?: number; hi?: number } {
  if (!values.length) return {};
  const m = mean(values);
  if (values.length < 2) return { mean: m };
  const half = 1.96 * Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length);
  return { mean: m, lo: Math.max(0, m - half), hi: Math.min(1, m + half) };
}

function summarize(dir: string, label: string, fingerprints: Map<string, string>, modes: Mode[], reps: number): void {
  const rows = readJsonl(join(dir, "results.jsonl"));
  const scored = new Set(rows.map(slotOf));
  const errors = readJsonl(join(dir, "errors.jsonl")).filter(row => fingerprintOf(row) === fingerprints.get(String(row.prompt_id)));
  console.log(`\n${label}`);
  for (const mode of modes) {
    const ids = new Set([...fingerprints.keys()].filter(id => id.endsWith(`__${mode}`)));
    const mine = rows.filter(row => ids.has(String(row.prompt_id)) && Number(row.rep) < reps);
    // Las rechazadas cuentan (rechazo = 1) con las capacidades en null; las truncadas quedan fuera, como en el reporte.
    const counted = mine.filter(row => row.status === "ok");
    const unscored = new Set(errors.filter(row => ids.has(String(row.prompt_id)) && Number(row.rep) < reps && !scored.has(slotOf(row))).map(slotOf)).size;
    const perCase = (metric: string) => {
      const byCase = new Map<string, number[]>();
      for (const row of counted) {
        const value = (row.grade as Record<string, unknown> | undefined)?.[metric];
        if (typeof value === "number") byCase.set(String(row.prompt_id), [...(byCase.get(String(row.prompt_id)) ?? []), value]);
      }
      return [...byCase.values()].map(mean);
    };
    const rate = (metric: string) => {
      const values = perCase(metric);
      return values.length ? `${Math.round(mean(values) * 100)}% (${values.length})` : "—";
    };
    const criterios = perCase("criterios");
    const ci = interval(criterios);
    const refused = counted.filter(row => (row.grade as Record<string, unknown> | undefined)?.rechazo === 1).length;
    const truncated = mine.filter(row => row.status === "truncated").length;
    console.log(`  ${mode}: ${counted.length} filas contadas (rechazos ${refused}; fuera: truncadas ${truncated}, sin calificar ${unscored})`);
    console.log(`    criterios ${fixed(ci.mean)} IC95% [${fixed(ci.lo)}, ${fixed(ci.hi)}] (${criterios.length} casos) · idioma ${rate("idioma")} · titulos ${rate("titulos")} · cantidad ${rate("cantidad")} · sin_json ${rate("sin_json")} · rechazo ${rate("rechazo")}`);
  }
}

// Cabecera del reporte. build-report-lite toma como titular la primera métrica "binary" y, si no
// hay ninguna, la primera: por eso ninguna se declara binary y criterios va primera.
const STATE = {
  metrics: [
    { id: "criterios", kind: "judge", scale: 1 },
    { id: "idioma", kind: "float", scale: 1 },
    { id: "titulos", kind: "float", scale: 1 },
    { id: "cantidad", kind: "float", scale: 1 },
    { id: "sin_json", kind: "float", scale: 1 },
    { id: "rechazo", kind: "float", scale: 1, better: "lower" },
  ],
  perf_fields: [{ id: "cost_usd", unit: "$" }, { id: "in_tokens" }, { id: "out_tokens" }, { id: "latency_s", unit: "s" }, { id: "words" }],
  // USD por millón de tokens: los del chat, de apps/api/lib/ai/budget-policy.ts; el del juez, de la tabla de modelos de la API de Claude.
  prices: {
    "claude-opus-5-5": { in: 4, out: 20 }, "gemini-3.8-flash": { in: 0.75, out: 3.75 }, "claude-haiku-5-5": { in: 0.1, out: 0.5 },
    "claude-sonnet-5-5": { in: 2, out: 10 },
  },
};

type Task = { kase: EvalCase; mode: Mode; rep: number; promptId: string; fingerprint: string; sharedFingerprint: string };
type Prints = { fingerprint: string; shared: string };
const ALL_MODES: readonly Mode[] = ["creative", "daily", "haiku"];
const VARIANT_DIR = /^(?:baseline|v\d+)$/;
const sharedFingerprintOf = (row: Record<string, unknown>) => (row.meta as { shared_fingerprint?: unknown } | undefined)?.shared_fingerprint;

const SANITY_KINDS = ["vacía", "«No lo sé.»", "respuesta a otra pregunta"] as const;
// Un criterio condicional («Si propone…») se cumple cuando su condición no aparece: se cuenta aparte.
const isConditional = (criterion: string) => /^\s*Si\s/i.test(criterion);

/**
 * EVAL_JUDGE_SANITY=1: manda al juez tres respuestas malas por caso y dice qué parte de los criterios aprueba
 * (debe ser casi 0). No escribe nada en las carpetas de resultados. Con EVAL_DRY_RUN usa el juez simulado.
 */
async function judgeSanity(data: EvalData, cases: EvalCase[], config: ReturnType<typeof settings>, options: JudgeOptions | undefined): Promise<number> {
  // Una respuesta segura de sí a otra pregunta: la receta del brodetto, salvo en el caso del brodetto.
  const answers = (kase: EvalCase): Record<(typeof SANITY_KINDS)[number], string> => ({
    "vacía": "", "«No lo sé.»": "No lo sé.", "respuesta a otra pregunta": kase.id === "receta-brodetto-it" ? ORACLE.es : ORACLE.it,
  });
  const jobs = cases.flatMap(kase => SANITY_KINDS.map(kind => ({ kase, kind, answer: answers(kase)[kind] })));
  const model = config.dryRun ? `stub-${config.dryRun}` : (options?.model ?? judgeModel());
  console.log(`[comprobación del juez] ${cases.length} casos × ${SANITY_KINDS.length} respuestas malas = ${jobs.length} llamadas al juez ${model}`
    + `${config.judgeEffort ? ` (esfuerzo ${config.judgeEffort})` : ""}, sin contar reintentos; no se escribe nada en las carpetas de resultados.`);
  const tally = new Map(SANITY_KINDS.map(kind => [kind, { passed: 0, total: 0, conditionalPassed: 0, conditionalTotal: 0, failures: 0, passes: [] as string[] }]));
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const addJudgeUsage = (more: JudgeUsage | undefined) => { for (const key of Object.keys(usage) as (keyof typeof usage)[]) usage[key] += more?.[key] ?? 0; };
  let failures = 0;
  let next = 0;
  await Promise.allSettled(Array.from({ length: Math.min(config.concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (!job) continue;
      const counts = tally.get(job.kind);
      const criteria = [...data.globalCriteria, ...job.kase.criteria];
      let results: CriterionResult[];
      try {
        if (config.dryRun) results = criteria.map(criterion => ({ criterion, pass: config.dryRun === "oracle", reason: "juez simulado" }));
        else {
          if (!options) throw new Error("falta el cliente del juez");
          const { verdict } = await judgeWithRetry({ context: judgeContext(data, job.kase), messages: job.kase.messages, answer: job.answer, criteria }, options);
          addJudgeUsage(verdict.usage);
          results = verdict.results;
        }
      } catch (error) {
        const cause = error instanceof JudgeFailure ? error.cause : error;
        if (cause instanceof JudgeError) addJudgeUsage(cause.usage);
        failures++;
        if (counts) counts.failures++;
        console.warn(`[comprobación del juez] ${job.kase.id} / ${job.kind}: el juez falló (${codeOf(error)})`);
        continue;
      }
      for (const result of results) {
        if (!counts) break;
        if (isConditional(result.criterion)) {
          counts.conditionalTotal++;
          if (result.pass) counts.conditionalPassed++;
        } else {
          counts.total++;
          if (result.pass) { counts.passed++; counts.passes.push(`${job.kase.id}: ${result.criterion}`); }
        }
      }
    }
  }));
  for (const [kind, counts] of tally) {
    const share = counts.total ? Math.round((counts.passed / counts.total) * 100) : 0;
    console.log(`  ${kind}: ${counts.passed}/${counts.total} criterios aprobados (${share}%) · condicionales aprobados ${counts.conditionalPassed}/${counts.conditionalTotal} · fallos del juez ${counts.failures}`);
    for (const pass of counts.passes) console.log(`    ✓ ${pass}`);
  }
  const price = (STATE.prices as Record<string, { in: number; out: number } | undefined>)[model];
  const cost = price ? ` ≈ US$${((usage.input_tokens * price.in + usage.output_tokens * price.out) / 1e6).toFixed(4)} (tarifa de _state.json, sin caché)` : "";
  console.log(`  uso del juez ${model}: ${JSON.stringify(usage)}${cost}`);
  return failures;
}

describe("prueba del prompt del asistente", () => {
  it("corre los casos, los califica y deja el resultado para el reporte", async () => {
    const config = settings();
    const data = CasesFile.parse(JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")));
    const wanted = config.caseIds;
    const unknown = wanted?.filter(id => !data.cases.some(kase => kase.id === id)) ?? [];
    if (unknown.length) throw new Error(`EVAL_CASES: casos desconocidos ${unknown.join(", ")}`);
    const cases = wanted ? data.cases.filter(kase => wanted.includes(kase.id)) : data.cases;
    let judgeOptions: JudgeOptions | undefined;
    if (!config.dryRun) {
      if (process.env.EVAL_ENV_FILE?.trim()) loadKeys(process.env.EVAL_ENV_FILE.trim());
      // La comprobación del juez no genera respuestas: solo necesita la clave de Anthropic.
      requireKeys(config.sanity ? [] : config.modes);
      // Sin reintentos del SDK: judgeWithRetry los acota y los cuenta.
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: config.timeoutS * 1000, maxRetries: 0 });
      judgeOptions = { client, model: judgeModel(), effort: config.judgeEffort, timeoutS: config.judgeTimeoutS };
    }
    const request = judgeRequest({ context: {}, messages: [], answer: "", criteria: ["-"] }, { model: judgeModel(), effort: config.judgeEffort });
    console.log(`Petición del juez real${config.dryRun ? " (esta simulación usa uno simulado)" : ""}: ${JSON.stringify({
      model: request.model, max_tokens: request.max_tokens, thinking: request.thinking,
      output_config: { ...request.output_config, format: { type: request.output_config.format.type } },
    })}, techo ${config.judgeTimeoutS} s por intento`);
    if (config.sanity) {
      const failures = await judgeSanity(data, cases, config, judgeOptions);
      expect(failures, `${failures} llamadas al juez fallaron en la comprobación`).toBe(0);
      return;
    }

    const prompt = readFileSync(PROMPTS[config.variant], "utf8");
    const judgeName = config.dryRun ? `stub-${config.dryRun}` : judgeModel();
    // manifest.ts no entra: solo decide qué corridas comparten carpeta, no cómo se genera ni se califica una fila.
    const harness = ["run.eval.ts", "judge.ts", "checks.ts"].map(file => readFileSync(join(HERE, file), "utf8"));
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
    // Huella de todo lo que decide una fila: si cambia, sus calificaciones ya no son comparables. La
    // compartida deja fuera solo el prompt de la variante (bloque 0 del sistema), para comparar baseline con v1.
    const printsFor = (kase: EvalCase, mode: Mode): Prints => {
      const [principles, ...context] = systemFor(data, kase, prompt).map(block => block.text);
      const shared = hash([
        context, kase, data.restaurants[kase.restaurant], judgeContext(data, kase), data.globalCriteria, data.currentMonth,
        chatConfig(mode), config.dryRun ?? null, judgeName, config.judgeEffort ?? null, JUDGE_SYSTEM, ...harness,
      ]);
      return { shared, fingerprint: hash([principles, shared]) };
    };
    // Todos los casos y modos, no solo los elegidos: una corrida parcial también debe ver filas de otra versión.
    const allPrints = new Map<string, Prints>(data.cases.flatMap(kase => ALL_MODES.map(mode => [`${kase.id}__${mode}`, printsFor(kase, mode)] as const)));
    const selected = cases.flatMap(kase => config.modes.map(mode => `${kase.id}__${mode}`));
    const fingerprints = new Map<string, string>(selected.map(id => [id, allPrints.get(id)?.fingerprint ?? ""]));

    const flowName = `${config.dryRun ? `prompt-asistente-dryrun-${config.dryRun}` : "prompt-asistente"}${config.run ? `-${config.run}` : ""}`;
    const flow = join(ROOT, ".claude", "hillclimb", flowName);
    const dir = join(flow, config.variant);
    mkdirSync(join(dir, "traces"), { recursive: true });
    mkdirSync(join(dir, "generations"), { recursive: true });
    // Resultados locales: la carpeta entera queda fuera de git.
    if (!existsSync(join(flow, ".gitignore"))) writeFileSync(join(flow, ".gitignore"), "*\n");
    if (!existsSync(join(flow, "_state.json"))) writeFileSync(join(flow, "_state.json"), JSON.stringify(STATE, null, 2) + "\n");

    const lockPath = join(dir, ".lock");
    let lock: number;
    try {
      lock = openSync(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Ya hay una corrida de ${config.variant} en ${dir} (existe .lock). Si no queda ninguna en marcha, borra ese .lock.`);
      throw error;
    }
    try {
      const resultsPath = join(dir, "results.jsonl");
      const errorsPath = join(dir, "errors.jsonl");
      sealTornLine(resultsPath);
      sealTornLine(errorsPath);
      const generationPath = (promptId: string, rep: number) => join(dir, "generations", `${promptId}_rep${rep}.json`);

      // Antes de cualquier llamada: una fila o una generación de otra versión de la prueba haría que el
      // resumen y build-report-lite promediaran calificaciones viejas con nuevas, así que no se filtran.
      // Se revisan todas las filas y generaciones de la carpeta, no solo las de los casos elegidos.
      const rows = readJsonl(resultsPath);
      const stale = rows.filter(row => fingerprintOf(row) !== allPrints.get(String(row.prompt_id))?.fingerprint).map(slotOf);
      const done = new Set(rows.map(slotOf));
      const tasks: Task[] = cases.flatMap(kase => config.modes.flatMap(mode => Array.from({ length: config.reps }, (_, rep) => {
        const promptId = `${kase.id}__${mode}`;
        const prints = allPrints.get(promptId);
        return { kase, mode, rep, promptId, fingerprint: prints?.fingerprint ?? "", sharedFingerprint: prints?.shared ?? "" };
      }))).filter(task => !done.has(slotKey(task.promptId, task.rep)));
      const pending = new Set(tasks.map(task => slotKey(task.promptId, task.rep)));
      const saved = new Map<string, Generation>();
      for (const file of readdirSync(join(dir, "generations"))) {
        const [, promptId = "", rep = ""] = /^(.+)_rep(\d+)\.json$/.exec(file) ?? [];
        let parsed: ReturnType<typeof SavedGeneration.safeParse> | undefined;
        try { parsed = SavedGeneration.safeParse(JSON.parse(readFileSync(join(dir, "generations", file), "utf8"))); } catch { parsed = undefined; }
        if (!parsed?.success || parsed.data.fingerprint !== allPrints.get(promptId)?.fingerprint) { stale.push(`generations/${file}`); continue; }
        const { fingerprint: _, ...generation } = parsed.data;
        if (pending.has(slotKey(promptId, rep))) saved.set(slotKey(promptId, rep), generation);
      }
      if (stale.length) {
        const examples = [...new Set(stale)].slice(0, 3).map(item => item.replace("\u0000", " rep")).join(", ");
        throw new Error(`${flow} tiene ${stale.length} filas o generaciones de otra versión de la prueba (prompt, casos, modelos, juez o comprobaciones distintos), por ejemplo ${examples}. `
          + "No se mezclan: mueve esa carpeta a otro sitio (o usa otro EVAL_RUN) y vuelve a correr.");
      }
      // Las variantes solo se comparan si todo salvo el prompt coincide: casos, modelos, juez y comprobaciones.
      const incomparable: string[] = [];
      for (const sibling of readdirSync(flow, { withFileTypes: true })) {
        if (!sibling.isDirectory() || sibling.name === config.variant || !VARIANT_DIR.test(sibling.name)) continue;
        for (const row of readJsonl(join(flow, sibling.name, "results.jsonl"))) {
          const expected = allPrints.get(String(row.prompt_id))?.shared;
          if (expected !== undefined && sharedFingerprintOf(row) !== expected) incomparable.push(`${sibling.name}/${String(row.prompt_id)} rep${String(row.rep)}`);
        }
      }
      if (incomparable.length) {
        throw new Error(`${config.variant} no sería comparable con lo que ya hay en ${flow}: ${incomparable.length} filas de otra variante se calificaron con otros casos, modelos, juez o comprobaciones `
          + `(por ejemplo ${incomparable.slice(0, 3).join(", ")}). Corre las variantes con la misma configuración, o usa otro EVAL_RUN.`);
      }
      // Las filas de las hermanas no bastan si dos variantes arrancan a la vez: el manifiesto de la carpeta fija
      // la configuración compartida de todos los casos y modos, y la variante que lo crea primero manda. Va después
      // de las comprobaciones de filas para que una corrida rechazada no deje su huella en una carpeta sin manifiesto.
      ensureRunManifest(flow, hash([...allPrints].map(([id, prints]) => `${id}:${prints.shared}`).sort()));

      // Intentos del juez que ya fallaron con esta misma huella, para meta.judge_attempts.
      const priorJudgeAttempts = new Map<string, number>();
      for (const row of readJsonl(errorsPath)) {
        if (row.failure_class !== "judge_error" || fingerprintOf(row) !== fingerprints.get(String(row.prompt_id))) continue;
        priorJudgeAttempts.set(slotOf(row), (priorJudgeAttempts.get(slotOf(row)) ?? 0) + (Number(row.judge_attempts) || 0));
      }

      const tag = `[${flowName}/${config.variant}]`;
      const toGenerate = tasks.filter(task => !saved.has(slotKey(task.promptId, task.rep)));
      const judgeCalls = toGenerate.length + [...saved.values()].filter(generation => generation.status === "ok").length;
      const byMode = config.modes.map(mode => `${mode} ${toGenerate.filter(task => task.mode === mode).length}`).join(", ");
      console.log(`${tag} ${tasks.length} de ${fingerprints.size * config.reps} (caso, modo, rep) por calificar: ${toGenerate.length} generaciones${config.dryRun ? " simuladas" : ""} (${byMode}) `
        + `y hasta ${judgeCalls} llamadas al juez ${judgeName}, sin contar reintentos; ${saved.size} generaciones guardadas se vuelven a juzgar.`);

      let finished = 0;
      let failures = 0;
      const metaOf = (task: Task) => ({
        variant: config.variant, case: task.kase.id, mode: task.mode, fingerprint: task.fingerprint, shared_fingerprint: task.sharedFingerprint,
      });
      const fail = (task: Task, record: Record<string, unknown>) => {
        failures++;
        append(errorsPath, { prompt_id: task.promptId, rep: task.rep, ...record, model: chatConfig(task.mode).model, meta: metaOf(task) });
        console.warn(`${tag} ${++finished}/${tasks.length} ${task.promptId} rep${task.rep}: SIN CALIFICAR (${String(record.failure_class)}: ${String(record.code)})`);
      };
      const gradeTask = async (task: Task) => {
        const { kase, mode, rep, promptId, fingerprint } = task;
        const key = slotKey(promptId, rep);
        const model = chatConfig(mode).model;
        const criteria = [...data.globalCriteria, ...kase.criteria];
        const meta = metaOf(task);
        const system = systemFor(data, kase, prompt);

        const produce = async (): Promise<Generation | null> => {
          try {
            return config.dryRun
              ? { text: config.dryRun === "oracle" ? ORACLE[kase.lang] : "", status: "ok", stopReason: chatConfig(mode).provider === "anthropic" ? "end_turn" : "STOP", latencyS: 0, attempts: 1 }
              : await generate(mode, system, kase.messages, config.timeoutS);
          } catch (error) {
            const code = codeOf(error);
            const failure = error instanceof AttemptFailure ? error : undefined;
            fail(task, { failure_class: failureClass(code), code, attempts: failure?.attempts ?? 1, ...(failure?.usage ? { usage: rowUsage(failure.usage) } : {}) });
            return null;
          }
        };
        const stored = saved.get(key);
        const reused = stored !== undefined;
        const generation = stored ?? (await produce());
        if (!generation) return;
        // Una generación pagada no se pierde si falla el juez: la reanudación la vuelve a juzgar.
        if (!reused) writeFileSync(generationPath(promptId, rep), JSON.stringify({ fingerprint, ...generation }, null, 2));

        // null: rechazo del proveedor, no hay respuesta que juzgar ni capacidades que medir.
        let results: CriterionResult[] | null = null;
        let judged: { model: string | null; usage: JudgeUsage | null; attempts: number } = { model: null, usage: null, attempts: 0 };
        if (generation.status === "truncated") {
          // Sin respuesta entregada no hay nada que juzgar: el chef habría visto un aviso de error.
          results = criteria.map(criterion => ({ criterion, pass: false, reason: `sin respuesta que calificar (${generation.stopReason})` }));
        } else if (generation.status === "ok" && config.dryRun) {
          results = criteria.map(criterion => ({ criterion, pass: config.dryRun === "oracle", reason: `juez simulado (${config.dryRun})` }));
          judged = { model: judgeName, usage: null, attempts: 1 };
        } else if (generation.status === "ok") {
          try {
            if (!judgeOptions) throw new Error("falta el cliente del juez");
            const { verdict, attempts } = await judgeWithRetry({ context: judgeContext(data, kase), messages: kase.messages, answer: generation.text, criteria }, judgeOptions);
            results = verdict.results;
            judged = { model: verdict.model, usage: verdict.usage, attempts };
          } catch (error) {
            const cause = error instanceof JudgeFailure ? error.cause : error;
            // El uso de la generación queda en generations/ y en la fila final: aquí solo va el del juez.
            fail(task, {
              failure_class: "judge_error", code: codeOf(error), judge_attempts: error instanceof JudgeFailure ? error.attempts : 1,
              judge_model: cause instanceof JudgeError ? cause.model ?? judgeName : judgeName,
              ...(cause instanceof JudgeError && cause.usage ? { judge_usage: cause.usage } : {}),
              generation: `${config.variant}/generations/${promptId}_rep${rep}.json`,
            });
            return;
          }
        }

        const answer = generation.text;
        const refused = generation.status === "refused";
        const passed = results?.filter(result => result.pass).length ?? 0;
        const trace = [{ role: "system", content: system.map(block => block.text).join("\n\n") }, ...kase.messages, { role: "assistant", content: answer }];
        // La traza va antes que la fila: una fila en results.jsonl siempre tiene su traza.
        writeFileSync(join(dir, "traces", `${promptId}_rep${rep}.json`), JSON.stringify(trace, null, 2));
        append(resultsPath, {
          prompt_id: promptId, rep, prompt: kase.messages.filter(m => m.role === "user").at(-1)?.content ?? "",
          tags: [mode, ...kase.tags, kase.lang],
          // Un rechazo cuenta como fila (rechazo = 1) pero sus capacidades quedan en null, fuera de las medias.
          status: generation.status === "truncated" ? "truncated" : "ok", stop_reason: generation.stopReason,
          grade: refused || !results
            ? { criterios: null, idioma: null, titulos: null, cantidad: null, sin_json: null, rechazo: 1 }
            : { criterios: passed / results.length, ...deterministicGrades(answer, kase), rechazo: 0 },
          explanation: {
            criterios: results ? results.map(result => `${result.pass ? "✓" : "✗"} ${result.criterion} — ${result.reason}`).join("\n") : `rechazo del proveedor (${generation.stopReason}): no se califica`,
          },
          model, usage: rowUsage(generation.usage), latency_s: Number(generation.latencyS.toFixed(3)), words: wordCount(answer),
          judge_model: judged.model, judge_usage: judged.usage,
          meta: {
            ...meta, attempts: generation.attempts, judge_attempts: (priorJudgeAttempts.get(key) ?? 0) + judged.attempts,
            criteria_pass: results?.map(result => result.pass) ?? null,
            ...(reused ? { reused_generation: true } : {}),
            ...(generation.failedUsage ? { failed_attempts_usage: rowUsage(generation.failedUsage) } : {}),
          },
        });
        if (!config.dryRun && generation.status === "ok" && !generation.usage) console.warn(`${tag} ${promptId} rep${rep}: el proveedor no informó el uso de tokens`);
        console.log(`${tag} ${++finished}/${tasks.length} ${promptId} rep${rep}: ${refused ? "rechazo" : generation.status}, criterios ${results ? `${passed}/${results.length}` : "—"}${reused ? " (generación guardada)" : ""}`);
      };

      // Un error imprevisto queda en errors.jsonl y no corta a los demás trabajadores.
      const runTask = async (task: Task) => {
        try {
          await gradeTask(task);
        } catch (error) {
          fail(task, { failure_class: "harness_error", code: codeOf(error) });
        }
      };
      let next = 0;
      // allSettled: el .lock se libera solo cuando ya no queda ningún trabajador haciendo llamadas.
      const workers = await Promise.allSettled(Array.from({ length: Math.min(config.concurrency, tasks.length) }, async () => {
        while (next < tasks.length) {
          const task = tasks[next++];
          if (task) await runTask(task);
        }
      }));
      const crashed = workers.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      if (crashed) throw crashed.reason;

      summarize(dir, `${tag} resumen por modo (medias por caso)`, fingerprints, config.modes, config.reps);
      expect(failures, `${failures} intentos quedaron sin calificar (ver errors.jsonl); vuelve a correr para reanudarlos`).toBe(0);
    } finally {
      closeSync(lock);
      rmSync(lockPath, { force: true });
    }
  });
});
