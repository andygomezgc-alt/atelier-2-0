// Closing AI generations against a REAL PostgreSQL. The mocked tests in
// budget-settle.test.ts cannot see the table's CHECK constraints, which once
// rejected every close except "settled" and left its hold in heldMicros forever.
//
// Not part of `pnpm test`. Needs a DISPOSABLE database with every migration
// applied (CI uses its service Postgres):
//
//   AI_BUDGET_IT=1 pnpm --filter api exec vitest run lib/ai/budget.integration.test.ts
//
// Only accepts a localhost DATABASE_URL; for a remote test database write its
// exact host in AI_BUDGET_IT_ALLOW_HOST. It only writes its own synthetic
// budget row and that row's generations, and deletes them afterwards.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { expireGeneration, releaseGeneration, reserveGeneration, settleInterruptedGeneration } from "./budget";
import { usageMicros } from "./budget-policy";

const enabled = process.env.AI_BUDGET_IT === "1";
const budgetId = `budget-it-${randomUUID()}`;
const config = { task: "extraction" as const, model: "claude-opus-5-5", maxTokens: 1000 };
const reserve = () => reserveGeneration(config, 1000, undefined, new Date(), budgetId);
const budget = () => prisma.aiBudget.findUniqueOrThrow({ where: { id: budgetId } });
const generation = (id: string) => prisma.aiGeneration.findUniqueOrThrow({ where: { id } });

describe.runIf(enabled)("closing AI generations on PostgreSQL", () => {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
  const errors = vi.spyOn(logger, "error");

  const host = new URL(process.env.DATABASE_URL ?? "postgresql://not-configured").hostname;
  const allowed = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || host === process.env.AI_BUDGET_IT_ALLOW_HOST;

  beforeAll(() => {
    if (!allowed) throw new Error(`Database not allowed for integration tests (${host}). Use a disposable database or set AI_BUDGET_IT_ALLOW_HOST to its exact host.`);
  });
  beforeEach(() => { errors.mockClear(); });
  afterAll(async () => {
    errors.mockRestore();
    if (!allowed) return; // afterAll still runs when beforeAll throws: never touch that database.
    await prisma.aiGeneration.deleteMany({ where: { budgetId } });
    await prisma.aiBudget.deleteMany({ where: { id: budgetId } });
    await prisma.$disconnect();
  });

  it("releases a generation the provider never billed: the whole hold returns and nothing is spent", async () => {
    const reservation = await reserve();
    const before = await budget();
    await releaseGeneration(reservation);
    expect(errors).not.toHaveBeenCalled();
    expect(await generation(reservation.id)).toMatchObject({ status: "released", chargedMicros: 0, finishedAt: expect.any(Date) });
    expect(await budget()).toMatchObject({ heldMicros: before.heldMicros - reservation.micros, spentMicros: before.spentMicros });
  });

  it("settles an interrupted stream: the hold returns and its exact input plus the full output ceiling is spent", async () => {
    const reservation = await reserve();
    const before = await budget();
    const known = { inputTokens: 500, outputTokens: 3, cachedTokens: 0, reasoningTokens: 0 };
    await settleInterruptedGeneration(reservation, known);
    const charged = usageMicros(reservation.rate, { ...known, outputTokens: config.maxTokens });
    expect(errors).not.toHaveBeenCalled();
    expect(await generation(reservation.id)).toMatchObject({ status: "interrupted", chargedMicros: charged, inputTokens: 500, outputTokens: config.maxTokens });
    expect(await budget()).toMatchObject({ heldMicros: before.heldMicros - reservation.micros, spentMicros: before.spentMicros + charged });
  });

  it("expires a hold nobody closed: the hold returns and the given charge is spent", async () => {
    const reservation = await reserve();
    const before = await budget();
    expect(await expireGeneration(budgetId, reservation.id, 1234)).toBe(true);
    expect(await generation(reservation.id)).toMatchObject({ status: "expired", chargedMicros: 1234, finishedAt: expect.any(Date) });
    expect(await budget()).toMatchObject({ heldMicros: before.heldMicros - reservation.micros, spentMicros: before.spentMicros + 1234 });
  });

  it("leaves no hold behind once every generation is closed", async () => {
    expect((await budget()).heldMicros).toBe(0);
    expect(await prisma.aiGeneration.count({ where: { budgetId, status: "reserved" } })).toBe(0);
  });
});
