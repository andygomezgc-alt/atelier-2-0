import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@atelier/db";
import { MemoryKeySchema } from "@atelier/shared";
import { ZodError } from "zod";
import { AiBudgetError } from "../ai/budget-policy";
import { loadEvidence, correctionsOf } from "./service";
import { evidenceHash, memoryContext, type StoredFact } from "./evidence";
import { generateMemory, memoryProviderConfig, type MemoryGenerator } from "./provider";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const STALE_RUN = 5 * 60 * 1000;
const HISTORY_RETENTION = 30 * DAY;

type Failure = { errorCode: string; retryable: boolean };
class MemoryRunSuperseded extends Error {}

function classifyFailure(error: unknown, providerResponded: boolean, usagePersisted: boolean): Failure {
  if (providerResponded && !usagePersisted) return { errorCode: "memory_telemetry_failed", retryable: false };
  const message = error instanceof Error ? error.message : "";
  if (providerResponded) {
    if (message === "memory_sources_changed") return { errorCode: message, retryable: false };
    if (/^(?:memory_sources_invalid|memory_input_limit|memory_response_incomplete|ai_response_incomplete|ai_response_invalid)$/.test(message) || error instanceof ZodError) {
      return { errorCode: "memory_output_invalid", retryable: false };
    }
    return { errorCode: "memory_post_response_failed", retryable: false };
  }
  if (error instanceof AiBudgetError || (error instanceof Error && /^ai_(?:budget|daily|creative)_/.test(error.message))) {
    return { errorCode: "memory_budget_blocked", retryable: false };
  }
  if (error instanceof ZodError) return { errorCode: "memory_output_invalid", retryable: false };

  if (/^(?:ai_provider_unconfigured|ai_model_configuration_invalid|memory_provider_unconfigured)$/.test(message)) {
    return { errorCode: "memory_configuration", retryable: false };
  }
  if (message === "memory_sources_changed") return { errorCode: message, retryable: false };
  if (/^(?:memory_sources_invalid|memory_input_limit|memory_response_incomplete|ai_response_incomplete|ai_response_invalid)$/.test(message)) {
    return { errorCode: "memory_output_invalid", retryable: false };
  }
  const httpStatus = /^ai_provider_http_(\d{3})$/.exec(message)?.[1];
  if (httpStatus) {
    const status = Number(httpStatus);
    return status === 408 || status === 425 || status === 429 || status >= 500
      ? { errorCode: "memory_provider_transient", retryable: true }
      : { errorCode: "memory_provider_rejected", retryable: false };
  }
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (error instanceof TypeError || error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError") ||
    /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)$/.test(code)) {
    return { errorCode: "memory_provider_transient", retryable: true };
  }
  return { errorCode: "memory_generation_failed", retryable: false };
}

const later = (a: Date | null, b: Date | null) => !a ? b : !b ? a : a > b ? a : b;

export async function processMemory(
  restaurantId: string,
  generator: MemoryGenerator = generateMemory,
  config = memoryProviderConfig(),
  now = new Date(),
  signal?: AbortSignal,
): Promise<string> {
  if (!config) return "unconfigured";
  signal?.throwIfAborted();
  const memory = await prisma.culinaryMemory.findUnique({
    where: { restaurantId },
    include: { restaurant: { select: { identityLine: true, languageDefault: true } } },
  });
  if (!memory?.enabled) return "skipped";
  if (memory.lockExpiresAt && memory.lockExpiresAt > now) return "skipped";

  const retryDue = !!memory.retryAt && memory.retryAt <= now;
  if (memory.retryAt && !retryDue) {
    await prisma.culinaryMemory.updateMany({ where: { restaurantId, version: memory.version, dirtyRevision: memory.dirtyRevision }, data: { nextCheckAt: memory.retryAt } });
    return "skipped";
  }
  const regularAnchor = later(memory.cycleStartedAt, memory.lastAttemptAt);
  if (!retryDue && regularAnchor && +now - +regularAnchor < WEEK) {
    await prisma.culinaryMemory.updateMany({
      where: { restaurantId, version: memory.version, dirtyRevision: memory.dirtyRevision },
      data: { nextCheckAt: new Date(+regularAnchor + WEEK) },
    });
    return "skipped";
  }
  if (memory.checkedRevision === memory.dirtyRevision) {
    await prisma.culinaryMemory.updateMany({
      where: { restaurantId, version: memory.version, dirtyRevision: memory.dirtyRevision },
      data: { retryAt: null, nextCheckAt: new Date(+now + DAY) },
    });
    return "unchanged";
  }

  const evidence = await loadEvidence(restaurantId);
  signal?.throwIfAborted();
  const corrections = correctionsOf(memory.corrections);
  const excludedKeys = memory.excludedKeys;
  const excluded = new Set([...excludedKeys, ...corrections.map(c => c.key)]);
  const hash = evidenceHash(evidence, memory.restaurant.identityLine, corrections, excludedKeys);
  const snapshot = { restaurantId, enabled: true, version: memory.version, dirtyRevision: memory.dirtyRevision };
  if (evidence.length < 3 || hash === memory.inputHash || MemoryKeySchema.options.every(key => excluded.has(key))) {
    await prisma.culinaryMemory.updateMany({
      where: snapshot,
      data: { checkedRevision: memory.dirtyRevision, retryAt: null, nextCheckAt: new Date(+now + DAY) },
    });
    return "unchanged";
  }

  const token = randomUUID();
  const cycleStartedAt = retryDue ? memory.cycleStartedAt ?? memory.lastAttemptAt ?? now : now;
  // A retry is additional to the cycle; the following regular attempt remains
  // seven days after the latest real attempt rather than waking a day early.
  const regularNextAt = new Date(+now + WEEK);
  const oldestRegularAttempt = new Date(+now - WEEK);
  const claimed = await prisma.$transaction(async tx => {
    const attemptGate = retryDue
      ? { retryAt: { lte: now } }
      : {
          retryAt: null,
          AND: [
            { OR: [{ cycleStartedAt: null }, { cycleStartedAt: { lte: oldestRegularAttempt } }] },
            { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: oldestRegularAttempt } }] },
          ],
        };
    const result = await tx.culinaryMemory.updateMany({
      where: {
        ...snapshot,
        AND: [attemptGate, { OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lte: now } }] }],
      },
      data: {
        lockToken: token,
        lockExpiresAt: new Date(+now + 120_000),
        lastAttemptAt: now,
        cycleStartedAt,
        retryAt: null,
        nextCheckAt: regularNextAt,
      },
    });
    if (!result.count) return false;
    await tx.culinaryMemoryRun.create({
      data: { id: token, restaurantId, provider: config.provider, model: config.model, status: "running", cycleStartedAt, isRetry: retryDue },
    });
    return true;
  });
  if (!claimed) return "busy";

  let providerResponded = false;
  let usagePersisted = false;
  try {
    signal?.throwIfAborted();
    const result = await generator({
      evidence,
      identity: memory.restaurant.identityLine,
      corrections,
      excluded: excludedKeys,
      language: memory.restaurant.languageDefault,
      signal,
    }, async usage => {
      providerResponded = true;
      const updated = await prisma.culinaryMemoryRun.updateMany({ where: { id: token, status: "running" }, data: usage });
      if (!updated.count) throw new Error("memory_run_superseded");
      usagePersisted = true;
    });
    signal?.throwIfAborted();

    const keys = new Set<string>();
    const learned: StoredFact[] = [];
    for (const trend of result.trends) {
      if (excluded.has(trend.key) || keys.has(trend.key)) continue;
      const refs = [...new Set(trend.sources)];
      if (refs.length < 3 || refs.some(ref => !evidence[ref - 1])) throw new Error("memory_sources_invalid");
      keys.add(trend.key);
      learned.push({
        key: trend.key,
        text: trend.text,
        sources: refs.map(ref => ({ id: evidence[ref - 1]!.id, hash: evidence[ref - 1]!.hash, version: 2 })),
      });
    }

    // A trigger changes dirtyRevision immediately after culinary source edits.
    // Re-reading also protects deployments where an older trigger is still live.
    const latest = await loadEvidence(restaurantId);
    if (evidenceHash(latest, memory.restaurant.identityLine, corrections, excludedKeys) !== hash) throw new Error("memory_sources_changed");
    signal?.throwIfAborted();

    const preparedContext = memoryContext(corrections, learned, excludedKeys);
    const status = await prisma.$transaction(async tx => {
      const saved = await tx.culinaryMemory.updateMany({
        where: { ...snapshot, lockToken: token },
        data: {
          learned,
          inputHash: hash,
          checkedRevision: memory.dirtyRevision,
          preparedContext,
          preparedRevision: memory.dirtyRevision,
          preparedVersion: memory.version + 1,
          updatedAt: now,
          version: { increment: 1 },
          lockToken: null,
          lockExpiresAt: null,
        },
      });
      if (!saved.count) {
        await tx.culinaryMemoryRun.updateMany({
          where: { id: token, status: "running" },
          data: { status: "superseded", finishedAt: new Date(), publishedTrends: Prisma.DbNull },
        });
        return "superseded";
      }
      const active = await tx.culinaryMemoryRun.updateMany({
        where: { id: token, status: "running" },
        data: {
          status: "completed",
          finishedAt: new Date(),
          publishedTrends: learned.map(({ key, text }) => ({ key, text })),
        },
      });
      if (!active.count) throw new MemoryRunSuperseded();
      return "completed";
    });
    return status;
  } catch (error) {
    if (error instanceof MemoryRunSuperseded) return "superseded";
    const failure = classifyFailure(error, providerResponded, usagePersisted);
    const status = await prisma.$transaction(async tx => {
      const retryAt = !retryDue && failure.retryable ? new Date(+now + DAY) : null;
      const owned = await tx.culinaryMemory.updateMany({
        where: { restaurantId, lockToken: token },
        data: {
          lockToken: null,
          lockExpiresAt: null,
          retryAt,
          nextCheckAt: retryAt ?? regularNextAt,
        },
      });
      if (!owned.count) {
        await tx.culinaryMemoryRun.updateMany({
          where: { id: token, status: "running" },
          data: { status: "superseded", finishedAt: new Date(), errorCode: failure.errorCode },
        });
        return "superseded";
      }
      const failed = await tx.culinaryMemoryRun.updateMany({
        where: { id: token, status: "running" },
        data: { status: "failed", finishedAt: new Date(), errorCode: failure.errorCode },
      });
      if (!failed.count) throw new MemoryRunSuperseded();
      return "failed";
    });
    return status;
  } finally {
    await prisma.culinaryMemory.updateMany({
      where: { restaurantId, lockToken: token },
      data: { lockToken: null, lockExpiresAt: null },
    });
  }
}

/** Local, bounded maintenance: no provider or budget call. */
export async function maintainMemoryRuns(now = new Date(), deadline = Number.POSITIVE_INFINITY): Promise<void> {
  await prisma.culinaryMemoryRun.updateMany({
    where: { createdAt: { lt: new Date(+now - HISTORY_RETENTION) }, publishedTrends: { not: Prisma.DbNull } },
    data: { publishedTrends: Prisma.DbNull },
  });
  const abandoned = await prisma.culinaryMemoryRun.findMany({
    where: { status: "running", createdAt: { lt: new Date(+now - STALE_RUN) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true, restaurantId: true, createdAt: true, cycleStartedAt: true, isRetry: true,
      inputTokens: true, outputTokens: true, reasoningTokens: true,
    },
  });
  for (const run of abandoned) {
    if (Date.now() >= deadline) break;
    await prisma.$transaction(async tx => {
      const paidResponse = run.inputTokens > 0 || run.outputTokens > 0 || run.reasoningTokens > 0;
      const retryAt = !run.isRetry && !paidResponse ? new Date(+run.createdAt + DAY) : null;
      const recovered = await tx.culinaryMemory.updateMany({
        where: { restaurantId: run.restaurantId, lockToken: run.id },
        data: {
          lockToken: null,
          lockExpiresAt: null,
          retryAt,
          nextCheckAt: retryAt ?? new Date(+run.createdAt + WEEK),
        },
      });
      const failed = await tx.culinaryMemoryRun.updateMany({
        where: { id: run.id, status: "running" },
        data: {
          status: "failed",
          finishedAt: now,
          errorCode: paidResponse ? "memory_worker_interrupted_after_response" : "memory_worker_interrupted",
        },
      });
      if (recovered.count && !failed.count) throw new MemoryRunSuperseded();
    }, { maxWait: 1_000, timeout: 5_000 });
  }
}
