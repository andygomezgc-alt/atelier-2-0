// Helper puro de pull-to-refresh. Invalida los prefijos de caché ANTES de
// recargar para garantizar que el reload traiga datos frescos del server
// (ver invalidate() en @/src/api/cache — también limpia inflight, así que
// un fetch en curso no nos devuelve una respuesta vieja).

import { invalidate } from "@/src/api/cache";

export async function forceRefresh<T>(
  prefixes: readonly string[],
  reload: () => Promise<T>,
): Promise<T> {
  const unique = new Set(prefixes);
  for (const prefix of unique) {
    invalidate(prefix);
  }
  return reload();
}
