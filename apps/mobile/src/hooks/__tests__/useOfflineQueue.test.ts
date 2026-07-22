import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/src/api/client";

const h = vi.hoisted(() => {
  const storage = new Map<string, string>();

  return {
    storage,
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => storage.delete(key));
    }),
    secureGetItem: vi.fn(async () => "test-token" as string | null),
    secureSetItem: vi.fn(async () => {}),
    secureDeleteItem: vi.fn(async () => {}),
    fetchMe: vi.fn(),
    devLogin: vi.fn(),
    loginWithGoogle: vi.fn(),
    requestMagicLink: vi.fn(),
    createIdea: vi.fn(),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: h.getItem,
    setItem: h.setItem,
    removeItem: h.removeItem,
    getAllKeys: h.getAllKeys,
    multiRemove: h.multiRemove,
  },
}));

vi.mock("@/src/lib/secure-storage", () => ({
  getItemAsync: h.secureGetItem,
  setItemAsync: h.secureSetItem,
  deleteItemAsync: h.secureDeleteItem,
}));

vi.mock("@/src/api/auth", () => ({
  fetchMe: h.fetchMe,
  devLogin: h.devLogin,
  loginWithGoogle: h.loginWithGoogle,
  requestMagicLink: h.requestMagicLink,
}));

vi.mock("@/src/api/ideas", () => ({
  createIdea: h.createIdea,
}));

import { bootstrap } from "@/src/hooks/useAuth";
import { enqueueIdea, flushQueue } from "@/src/hooks/useOfflineQueue";

const fakeUser = {
  id: "user-a",
  email: "chef@atelier.test",
  name: "Chef",
  photoUrl: null,
  bio: null,
  role: "admin",
  languagePref: "es",
  defaultModel: "sonnet",
  restaurantId: "restaurant-a" as string | null,
  restaurantName: "Atelier A" as string | null,
};

async function setIdentity(userId: string, restaurantId: string | null) {
  h.fetchMe.mockResolvedValueOnce({
    ...fakeUser,
    id: userId,
    restaurantId,
    restaurantName: restaurantId ? `Atelier ${restaurantId}` : null,
  });
  await bootstrap();
}

function storedQueue(userId: string, restaurantId: string) {
  const raw = h.storage.get(`atelier.idea_queue.v2.${userId}.${restaurantId}`);
  return raw ? (JSON.parse(raw) as Array<{ text: string }>) : [];
}

describe("offline idea queue", () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_DEV_AUTH_EMAIL;
    h.storage.clear();
    h.getItem.mockClear();
    h.setItem.mockClear();
    h.removeItem.mockClear();
    h.getAllKeys.mockClear();
    h.multiRemove.mockClear();
    h.fetchMe.mockReset();
    h.createIdea.mockReset();
  });

  it("no envía con la identidad B una idea encolada por la identidad A", async () => {
    await setIdentity("user-a", "restaurant-a");
    await enqueueIdea("idea de A", new TypeError("network down"));

    await setIdentity("user-b", "restaurant-b");
    expect(await flushQueue()).toEqual([]);

    expect(h.createIdea).not.toHaveBeenCalled();
    expect(storedQueue("user-a", "restaurant-a")).toMatchObject([
      { text: "idea de A" },
    ]);
  });

  it("ApiError no se encola y se relanza", async () => {
    await setIdentity("user-a", "restaurant-a");
    const error = new ApiError(500, "server rejected");

    await expect(enqueueIdea("no guardar", error)).rejects.toBe(error);

    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
    expect(h.setItem).not.toHaveBeenCalled();
  });

  it("un TypeError de red sí se encola", async () => {
    await setIdentity("user-a", "restaurant-a");

    await enqueueIdea("guardar offline", new TypeError("network down"));

    expect(storedQueue("user-a", "restaurant-a")).toMatchObject([
      { text: "guardar offline" },
    ]);
  });

  it("sin identidad no encola y relanza el error original", async () => {
    await setIdentity("user-a", null);
    const error = new TypeError("network down");

    await expect(enqueueIdea("sin restaurante", error)).rejects.toBe(error);
    expect([...h.storage.keys()].filter((key) => key.startsWith("atelier.idea_queue."))).toEqual([]);
  });

  it("flush descarta ApiError y conserva fallos de red", async () => {
    await setIdentity("user-a", "restaurant-a");
    await enqueueIdea("rechazada", new TypeError("offline"));
    await enqueueIdea("reintentar", new TypeError("offline"));
    h.createIdea
      .mockRejectedValueOnce(new ApiError(403, "forbidden"))
      .mockRejectedValueOnce(new TypeError("network down"));

    expect(await flushQueue()).toEqual([]);

    expect(storedQueue("user-a", "restaurant-a")).toMatchObject([
      { text: "reintentar" },
    ]);
  });

  it("descarta la cola legacy v1 al leer", async () => {
    h.storage.set("atelier.idea_queue.v1", JSON.stringify([{ text: "sin dueño" }]));
    await setIdentity("user-a", "restaurant-a");

    await flushQueue();

    expect(h.storage.has("atelier.idea_queue.v1")).toBe(false);
    expect(h.createIdea).not.toHaveBeenCalled();
  });
});
