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
import { enqueueIdea, flushQueue, saveIdea } from "@/src/hooks/useOfflineQueue";

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
  return raw ? (JSON.parse(raw) as Array<{ id: string; text: string }>) : [];
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

  it("a validation error is not queued", async () => {
    await setIdentity("user-a", "restaurant-a");
    const error = new ApiError(400, "server rejected");

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

  it("flush discards validation errors and preserves network failures", async () => {
    await setIdentity("user-a", "restaurant-a");
    await enqueueIdea("rechazada", new TypeError("offline"));
    await enqueueIdea("reintentar", new TypeError("offline"));
    h.createIdea
      .mockRejectedValueOnce(new ApiError(400, "invalid"))
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

  it.each([401, 403, 408, 429, 500, 503])("preserves ideas after temporary HTTP %s errors", async (status) => {
    await setIdentity("user-a", "restaurant-a");
    await enqueueIdea("guardar", new ApiError(status, "temporary"));
    h.createIdea.mockRejectedValueOnce(new ApiError(status, "temporary"));
    expect(await flushQueue()).toEqual([]);
    expect(storedQueue("user-a", "restaurant-a")).toMatchObject([{ text: "guardar" }]);
  });

  it("serialises simultaneous enqueues and flushes without losing or sending an idea twice", async () => {
    await setIdentity("user-a", "restaurant-a");
    await Promise.all([enqueueIdea("one", new TypeError()), enqueueIdea("two", new TypeError())]);
    h.createIdea.mockImplementation(async (text: string) => ({ id: text, text }));
    await Promise.all([flushQueue(), enqueueIdea("three", new TypeError()), flushQueue()]);
    expect(h.createIdea.mock.calls.map(([text]) => text)).toEqual(["one", "two", "three"]);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });

  it("does not overwrite a queue when storage cannot be read", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.getItem.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(enqueueIdea("keep", new TypeError())).rejects.toThrow("storage unavailable");
    expect(h.setItem).not.toHaveBeenCalled();
  });

  it("does not create a second idea when the server saved it but its response was lost", async () => {
    await setIdentity("user-a", "restaurant-a");
    await enqueueIdea("idea con respuesta perdida", new TypeError("offline"));
    const server = new Map<string, { id: string; text: string }>();
    let loseResponse = true;
    h.createIdea.mockImplementation(async (text: string, request?: { clientRequestId: string }) => {
      const key = request?.clientRequestId ?? `unidentified-${server.size}`;
      const idea = server.get(key) ?? { id: `server-${server.size}`, text };
      server.set(key, idea);
      if (loseResponse) { loseResponse = false; throw new TypeError("response lost after commit"); }
      return idea;
    });
    expect(await flushQueue()).toEqual([]);
    expect(storedQueue("user-a", "restaurant-a")).toHaveLength(1);
    expect(await flushQueue()).toHaveLength(1);
    expect(server.size).toBe(1);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });

  it("persists the submission before its first send and keeps the ID after a lost response", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.createIdea.mockImplementationOnce(async (text, request) => {
      expect(storedQueue("user-a", "restaurant-a")).toMatchObject([{ id: request.clientRequestId, text }]);
      throw new TypeError("response lost after commit");
    });
    expect(await saveIdea("primera idea")).toEqual({ status: "queued" });
    const firstRequest = h.createIdea.mock.calls[0]![1];
    expect(firstRequest).toMatchObject({ expectedAuthorId: "user-a", expectedRestaurantId: "restaurant-a" });
    h.createIdea.mockResolvedValue({ id: "server-1", text: "primera idea" });
    await flushQueue();
    expect(h.createIdea.mock.calls[1]![1]).toEqual(firstRequest);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });

  it("resumes a request from disk without needing any in-memory ID", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.storage.set("atelier.idea_queue.v2.user-a.restaurant-a", JSON.stringify([
      { id: "local-before-restart", text: "Pendiente antes de cerrar", createdAt: 123 },
    ]));
    h.createIdea.mockResolvedValue({ id: "idea-1" });
    await Promise.all([flushQueue(), flushQueue()]);
    expect(h.createIdea).toHaveBeenCalledOnce();
    expect(h.createIdea).toHaveBeenCalledWith("Pendiente antes de cerrar", {
      clientRequestId: "local-before-restart", expectedAuthorId: "user-a", expectedRestaurantId: "restaurant-a",
    });
  });

  it("never contacts the server if the durable write fails", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveIdea("keep in form")).rejects.toThrow("disk full");
    expect(h.createIdea).not.toHaveBeenCalled();
  });

  it("does not overwrite existing ideas if reading storage fails", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.getItem.mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(saveIdea("keep in form")).rejects.toThrow("disk unavailable");
    expect(h.setItem).not.toHaveBeenCalled();
    expect(h.createIdea).not.toHaveBeenCalled();
  });

  it("keeps an acknowledged save successful even if local cleanup fails", async () => {
    await setIdentity("user-a", "restaurant-a");
    const idea = { id: "idea-1", text: "saved" };
    h.createIdea.mockImplementationOnce(async () => {
      h.setItem.mockRejectedValueOnce(new Error("cleanup failed"));
      return idea;
    }).mockResolvedValue(idea);
    expect(await saveIdea("saved")).toEqual({ status: "saved", idea });
    expect(storedQueue("user-a", "restaurant-a")).toHaveLength(1);
    await flushQueue();
    expect(h.createIdea.mock.calls[0]![1]).toEqual(h.createIdea.mock.calls[1]![1]);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });

  it("rejects invalid input back to the form and removes it from the retry queue", async () => {
    await setIdentity("user-a", "restaurant-a");
    const error = new ApiError(400, "invalid");
    h.createIdea.mockRejectedValueOnce(error);
    await expect(saveIdea("invalid")).rejects.toBe(error);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });

  it("preserves the original owner when authentication changes during the request", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.createIdea.mockImplementationOnce(async (_, request) => {
      await setIdentity("user-b", "restaurant-b");
      expect(request).toMatchObject({ expectedAuthorId: "user-a", expectedRestaurantId: "restaurant-a" });
      throw new ApiError(409, "idea_owner_changed", "idea_owner_changed");
    });
    expect(await saveIdea("team A")).toEqual({ status: "queued" });
    expect(storedQueue("user-a", "restaurant-a")).toHaveLength(1);
    expect(await flushQueue()).toEqual([]);
    expect(h.createIdea).toHaveBeenCalledOnce();
    await setIdentity("user-a", "restaurant-a");
    h.createIdea.mockResolvedValue({ id: "idea-a" });
    await flushQueue();
    expect(h.createIdea.mock.calls[1]![1]).toEqual(h.createIdea.mock.calls[0]![1]);
  });

  it("stops retrying an idea already deleted on the server", async () => {
    await setIdentity("user-a", "restaurant-a");
    h.createIdea.mockRejectedValueOnce(new TypeError("response lost"));
    await saveIdea("deleted later");
    h.createIdea.mockRejectedValueOnce(new ApiError(410, "idea_already_deleted", "idea_already_deleted"));
    expect(await flushQueue()).toEqual([]);
    expect(storedQueue("user-a", "restaurant-a")).toEqual([]);
  });
});
