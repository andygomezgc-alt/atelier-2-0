// Stores idea text drafts when the network call fails and replays them
// when the app comes back. Tiny FIFO in AsyncStorage; no NetInfo dep,
// we just retry on next mount and on every successful create.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createIdea, type Idea } from "@/src/api/ideas";

const KEY = "atelier.idea_queue.v1";

type QueuedIdea = { id: string; text: string; createdAt: number };

async function readQueue(): Promise<QueuedIdea[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedIdea[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(q: QueuedIdea[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
}

export async function enqueueIdea(text: string): Promise<void> {
  const q = await readQueue();
  q.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: Date.now() });
  await writeQueue(q);
}

export async function flushQueue(): Promise<Idea[]> {
  const q = await readQueue();
  if (q.length === 0) return [];

  const created: Idea[] = [];
  const remaining: QueuedIdea[] = [];

  for (const item of q) {
    try {
      const idea = await createIdea(item.text);
      created.push(idea);
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
  return created;
}

export function useOfflineQueueSize() {
  const [size, setSize] = useState(0);

  const refresh = useCallback(async () => {
    const q = await readQueue();
    setSize(q.length);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { size, refresh };
}
