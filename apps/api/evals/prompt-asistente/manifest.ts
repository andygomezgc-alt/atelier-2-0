// Manifiesto de la carpeta de una corrida: la huella de la configuración que comparten todas sus variantes
// (todo salvo el prompt). La primera variante que arranca lo crea y las demás tienen que coincidir con él,
// aunque arranquen a la vez y ninguna haya escrito filas todavía.
import { randomUUID } from "node:crypto";
import { linkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MANIFEST = "_manifest.json";

/** Crea <flowDir>/_manifest.json con la huella o comprueba que coincide con la que ya tiene; si no, lanza. */
export function ensureRunManifest(flowDir: string, fingerprint: string): void {
  const path = join(flowDir, MANIFEST);
  // Se escribe entero en un temporal propio y se enlaza con su nombre final: el manifiesto aparece completo
  // o no aparece, y si otra corrida ya lo creó, linkSync falla con EEXIST sin tocarlo.
  const temp = join(flowDir, `.${MANIFEST}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temp, JSON.stringify({ fingerprint, created_at: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
  try {
    linkSync(temp, path);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    try { rmSync(temp, { force: true }); } catch { /* Un temporal que sobra no cambia el manifiesto. */ }
  }
  let existing: unknown;
  try {
    existing = (JSON.parse(readFileSync(path, "utf8")) as { fingerprint?: unknown } | null)?.fingerprint;
  } catch {
    existing = undefined;
  }
  if (typeof existing !== "string") {
    throw new Error(`No se puede leer ${path}: muévelo junto con su carpeta a otro sitio (o usa otro EVAL_RUN) y vuelve a correr.`);
  }
  if (existing !== fingerprint) {
    throw new Error(`Esta variante no sería comparable con las demás de ${flowDir}: la carpeta se creó con otra configuración compartida `
      + `(casos, modelos, juez, esfuerzo del juez, simulación o comprobaciones; huella ${existing}, esta corrida ${fingerprint}). `
      + "Corre las variantes con la misma configuración, o usa otro EVAL_RUN.");
  }
}
