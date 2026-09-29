import { after, NextRequest, NextResponse } from "next/server";
import { PatchCulinaryMemorySchema, MemoryVersionSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { getCulinaryMemory, patchCulinaryMemory, MemoryConflict } from "@/lib/culinary-memory/service";
import { processMemory } from "@/lib/culinary-memory/worker";
import { generateMemory, memoryProviderConfig } from "@/lib/culinary-memory/provider";
import { MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
// La corrida de after() cuenta en este límite: el plazo de una fila
// (MINIMUM_ROW_TIME_MS, 60 s) más 30 s para la petición y las escrituras finales.
export const maxDuration = 90;
/**
 * Al encender la memoria aprende enseguida, sin esperar al cron. Pasa por los mismos
 * cierres que el cron (bloqueo, intento semanal, mínimo de recetas, presupuesto).
 * Si falla antes de reservar, nextCheckAt sigue en "ahora" y el cron la recoge.
 */
function learnNow(restaurantId: string, config: { model: string; provider: string }) {
  const signal = AbortSignal.timeout(MINIMUM_ROW_TIME_MS);
  after(async () => {
    try { logger.info("culinary_memory_enable_run", { restaurantId, result: await processMemory(restaurantId, generateMemory, config, new Date(), signal) }); }
    catch (error) { logger.error("culinary_memory_enable_run_failed", { restaurantId, error, message: error instanceof Error ? error.message : String(error) }); }
  });
}
export async function GET(req: NextRequest) {
  // Nuestra cocina la consultan quienes cocinan (el Lector no accede, como antes
  // de que "view_staff_recipe" incluyera a los Lectores).
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  return NextResponse.json(await getCulinaryMemory(ctx.restaurantId, can(ctx.role, "approve_recipe")));
}
async function mutate(req: NextRequest, erase: boolean) {
  const ctx = await requireAuth(req, "approve_recipe");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
    const origin = req.headers.get("origin");
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== process.env.NEXTAUTH_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const raw = await req.json().catch(() => null);
  const parsed = (erase ? MemoryVersionSchema.strict() : PatchCulinaryMemorySchema).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
  try {
    const { memory, turnedOn } = await patchCulinaryMemory(ctx.restaurantId, parsed.data, erase);
    const config = turnedOn ? memoryProviderConfig() : null;
    if (config) learnNow(ctx.restaurantId, config);
    return NextResponse.json(memory);
  } catch (error) {
    if (error instanceof MemoryConflict) return NextResponse.json({ error: "La memoria cambió. Vuelve a abrirla para revisar los cambios.", code: "memory_conflict" }, { status: 409 });
    throw error;
  }
}
export const PATCH = (req: NextRequest) => mutate(req, false);
export const DELETE = (req: NextRequest) => mutate(req, true);
