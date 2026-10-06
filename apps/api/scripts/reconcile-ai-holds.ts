// A4 — closes AI budget holds that nobody settled (the process died mid-generation).
// Dry run by default: lists `reserved` generations older than the threshold.
// With --apply, expires each one in its own row-locked transaction, charging the
// highest settled cost of the same model in the last 30 days (capped by the hold),
// or the whole hold without history. No provider calls.
// From apps/api: ../../packages/db/node_modules/.bin/tsx scripts/reconcile-ai-holds.ts [--apply] [--older-than-minutes=30]
import { prisma } from "@atelier/db";
import { expireGeneration } from "../lib/ai/budget";
import { reconcileAiHolds } from "./reconcile-ai-holds-runner";

reconcileAiHolds(process.argv.slice(2), { prisma, expireGeneration, now: new Date(), log: console })
  .then(exitCode => { process.exitCode = exitCode; })
  .catch(error => { console.error(error instanceof Error ? error.message : "Reconciliation failed"); process.exitCode = 1; });
