// Caché TTL en memoria para listados read-mostly (recetas, menús).
// Diseño minimalista: Map + timestamp + dedupe de fetches concurrentes.
// No reemplaza un TanStack Query — solo evita refetchear lo mismo cada vez que
// el chef cambia de tab. TTL típico 30-60s.
//
// Patrón de uso:
//   listRecipes() llama cached("recipes:...", fetcher, 30_000)
//   createRecipe() llama invalidate("recipes:") para tirar todos los cachés de lista
//
// Limitaciones conocidas:
// - Sin persistencia: se vacía al cerrar la app.
// - Sin background refetch: si el TTL expira, el caller espera el fetch.
//   Es más simple que SWR y suficiente para los volúmenes actuales.
// - Sin scope por usuario: clearAll() debe llamarse al hacer signout.

type CacheEntry<T> = { data: T; ts: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && now - entry.ts < ttlMs) {
    return entry.data;
  }

  // Dedupe: si ya hay un fetch en curso para esta key, esperamos ese.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

// Invalida todas las entradas cuya clave empiece con el prefix dado.
// Útil para tirar caches de lista después de una mutación.
//
// También limpia `inflight`: un refresh forzado (pull-to-refresh) debe
// refetchear de verdad, no colgarse de una promesa vieja ya en curso. La
// promesa vieja sigue resolviendo con su resultado para quien ya la estaba
// esperando — solo dejamos de servirla a callers nuevos.
export function invalidate(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
  for (const k of inflight.keys()) {
    if (k.startsWith(prefix)) inflight.delete(k);
  }
}

// Para sobreescribir el cache después de una mutación, sin esperar refetch.
export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// Limpia todo el caché. Llamar en signout.
export function clearAll(): void {
  cache.clear();
  inflight.clear();
}
