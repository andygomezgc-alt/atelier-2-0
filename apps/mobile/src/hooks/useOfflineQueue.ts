// Stores idea text drafts when the network call fails and replays them
// when the app comes back. Tiny FIFO in AsyncStorage; no NetInfo dep,
// we just retry on next mount and on every successful create.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "@/src/api/client";
import { createIdea, type Idea } from "@/src/api/ideas";
import { getCurrentIdentity } from "@/src/hooks/useAuth";

const LEGACY_KEY = "atelier.idea_queue.v1";
const KEY_PREFIX = "atelier.idea_queue.v2";

type QueuedIdea = { id: string; text: string; createdAt: number };

function currentQueueKey(): string | null {
  const identity = getCurrentIdentity();
  return identity
    ? `${KEY_PREFIX}.${identity.userId}.${identity.restaurantId}`
    : null;
}

async function readQueue(key: string | null): Promise<QueuedIdea[]> {
  // v1 no tenía dueño: nunca es seguro migrarla a la sesión actual.
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => undefined);
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as QueuedIdea[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(key: string, q: QueuedIdea[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(q));
}

export async function enqueueIdea(text: string, error: unknown): Promise<void> {
  if (error instanceof ApiError) throw error;

  const key = currentQueueKey();
  if (!key) throw error;

  const q = await readQueue(key);
  q.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: Date.now() });
  await writeQueue(key, q);
}

export async function flushQueue(): Promise<Idea[]> {
  const key = currentQueueKey();
  if (!key) {
    await readQueue(null);
    return [];
  }
  const q = await readQueue(key);
  if (q.length === 0) return [];

  const created: Idea[] = [];
  const remaining: QueuedIdea[] = [];

  for (const item of q) {
    try {
      const idea = await createIdea(item.text);
      created.push(idea);
    } catch (error) {
      // El server ya lo rechazó: reintentar indefinidamente no lo arregla.
      if (!(error instanceof ApiError)) remaining.push(item);
    }
  }

  await writeQueue(key, remaining);
  return created;
}

export function useOfflineQueueSize() {
  const [size, setSize] = useState(0);

  const refresh = useCallback(async () => {
    // La key se resuelve en cada refresh para seguir cambios de sesión.
    const q = await readQueue(currentQueueKey());
    setSize(q.length);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { size, refresh };
}
