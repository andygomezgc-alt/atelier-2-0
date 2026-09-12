// Persist before sending, then replay with the SAME request ID. A missing
// response or an app restart must never become another server-side creation.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "@/src/api/client";
import { createIdea, type Idea } from "@/src/api/ideas";
import { getCurrentIdentity } from "@/src/hooks/useAuth";

const LEGACY_KEY = "atelier.idea_queue.v1";
const KEY_PREFIX = "atelier.idea_queue.v2";

type QueuedIdea = { id: string; text: string; createdAt: number };
type Owner = NonNullable<ReturnType<typeof getCurrentIdentity>>;
export type IdeaSaveResult = { status: "saved"; idea: Idea } | { status: "queued" };

const pending = new Map<string, Promise<unknown>>();
function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
  pending.set(key, next);
  void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => undefined);
  return next;
}

function retryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.code === "idea_owner_changed" || [401, 403, 408, 429].includes(error.status) || error.status >= 500;
}

function queueKey(owner: Owner): string {
  return `${KEY_PREFIX}.${owner.userId}.${owner.restaurantId}`;
}

function currentQueueKey(): string | null {
  const owner = getCurrentIdentity();
  return owner ? queueKey(owner) : null;
}

function newItem(text: string): QueuedIdea {
  return { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, text, createdAt: Date.now() };
}

function send(item: QueuedIdea, owner: Owner): Promise<Idea> {
  return createIdea(item.text, {
    clientRequestId: item.id,
    expectedAuthorId: owner.userId,
    expectedRestaurantId: owner.restaurantId,
  });
}

async function readQueue(key: string | null): Promise<QueuedIdea[]> {
  // v1 no tenía dueño: nunca es seguro migrarla a la sesión actual.
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => undefined);
  if (!key) return [];
  // A read failure is not an empty queue: overwriting it would lose ideas.
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as QueuedIdea[]) : [];
}

async function writeQueue(key: string, q: QueuedIdea[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(q));
}

export async function enqueueIdea(text: string, error: unknown): Promise<void> {
  if (!retryable(error)) throw error;

  const key = currentQueueKey();
  if (!key) throw error;

  await serial(key, async () => {
    const q = await readQueue(key);
    q.push(newItem(text));
    await writeQueue(key, q);
  });
}

/** One durable submission from the form. Storage failures leave its text in the form. */
export async function saveIdea(text: string): Promise<IdeaSaveResult> {
  const owner = getCurrentIdentity();
  if (!owner) throw new ApiError(409, "idea_owner_changed", "idea_owner_changed");
  const key = queueKey(owner);
  const item = newItem(text);
  return serial(key, async () => {
    const queue = await readQueue(key);
    queue.push(item);
    // Do not contact the server until the request ID is safely on disk.
    await writeQueue(key, queue);
    if (currentQueueKey() !== key) return { status: "queued" };
    let idea: Idea;
    try {
      idea = await send(item, owner);
    } catch (error) {
      if (retryable(error)) return { status: "queued" };
      // A permanent rejection stays visible in the form, not in the retry queue.
      await writeQueue(key, queue.filter((entry) => entry.id !== item.id)).catch(() => undefined);
      throw error;
    }
    // A cleanup failure must not turn an acknowledged save into another submission.
    // The durable item can safely replay later, since its ID stays unchanged.
    await writeQueue(key, queue.filter((entry) => entry.id !== item.id)).catch(() => undefined);
    return { status: "saved", idea };
  });
}

export async function flushQueue(): Promise<Idea[]> {
  const owner = getCurrentIdentity();
  if (!owner) {
    await readQueue(null);
    return [];
  }
  const key = queueKey(owner);
  return serial(key, async () => {
    const q = await readQueue(key);
    if (q.length === 0) return [];

    const created: Idea[] = [];
    while (q.length > 0 && currentQueueKey() === key) {
      const item = q[0]!;
      try {
        const idea = await send(item, owner);
        created.push(idea);
      } catch (error) {
        // Keep authentication, rate-limit and server failures for a later retry.
        if (retryable(error)) break;
      }
      q.shift();
      await writeQueue(key, q);
    }
    return created;
  });
}

export function useOfflineQueueSize() {
  const [size, setSize] = useState(0);

  const refresh = useCallback(async () => {
    // La key se resuelve en cada refresh para seguir cambios de sesión.
    try {
      const q = await readQueue(currentQueueKey());
      setSize(q.length);
    } catch { /* Preserve the last known count if storage is unavailable. */ }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { size, refresh };
}
