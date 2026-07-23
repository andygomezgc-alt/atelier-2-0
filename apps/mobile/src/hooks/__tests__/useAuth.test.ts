// P1-4 — bootstrap resiliente: un fallo de RED al arrancar (wifi de cocina,
// timeout, 500 de Vercel) NO debe destruir la sesión. Solo un 401 real
// (token vencido/revocado) borra el token y desloguea; el resto conserva el
// token y pasa a "offline" para que el chef reintente.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, TOKEN_KEY } from "@/src/api/client";

// vi.hoisted: las factories de vi.mock se izan por encima de los imports, así
// que los spies tienen que existir antes. (Patrón del repo.)
const h = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  getItemAsync: vi.fn(
    async (key: string): Promise<string | null> =>
      key === "atelier.access_token.v1" ? "test-token" : null,
  ),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  getAllKeys: vi.fn(),
  multiRemove: vi.fn(),
  fetchMe: vi.fn(),
  devLogin: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithApple: vi.fn(),
  requestAppleSignInChallenge: vi.fn(),
  requestMagicLink: vi.fn(),
  getCredentialStateAsync: vi.fn(),
  addRevokeListener: vi.fn(() => ({ remove: vi.fn() })),
}));

h.getAllKeys.mockImplementation(async () => [...h.asyncStorage.keys()]);
h.multiRemove.mockImplementation(async (keys: string[]) => {
  keys.forEach((key) => h.asyncStorage.delete(key));
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: h.getAllKeys,
    multiRemove: h.multiRemove,
  },
}));

vi.mock("@/src/lib/secure-storage", () => ({
  getItemAsync: h.getItemAsync,
  setItemAsync: h.setItemAsync,
  deleteItemAsync: h.deleteItemAsync,
}));

vi.mock("@/src/api/auth", () => ({
  fetchMe: h.fetchMe,
  devLogin: h.devLogin,
  loginWithGoogle: h.loginWithGoogle,
  loginWithApple: h.loginWithApple,
  requestAppleSignInChallenge: h.requestAppleSignInChallenge,
  requestMagicLink: h.requestMagicLink,
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-apple-authentication", () => ({
  addRevokeListener: h.addRevokeListener,
  getCredentialStateAsync: h.getCredentialStateAsync,
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
}));

import {
  APPLE_USER_ID_KEY,
  bootstrap,
  getAuthActions,
  getAuthState,
} from "@/src/hooks/useAuth";

const fakeUser = {
  id: "u1",
  email: "chef@atelier.test",
  name: "Chef",
  photoUrl: null,
  bio: null,
  role: "admin",
  languagePref: "es",
  defaultModel: "sonnet",
  restaurantId: null as string | null,
  restaurantName: null as string | null,
};

describe("useAuth bootstrap (P1-4)", () => {
  beforeEach(() => {
    h.getItemAsync.mockImplementation(async (key: string) =>
      key === TOKEN_KEY ? "test-token" : null,
    );
    h.deleteItemAsync.mockClear();
    h.setItemAsync.mockClear();
    h.fetchMe.mockReset();
    h.getCredentialStateAsync.mockReset();
    h.asyncStorage.clear();
    h.getAllKeys.mockClear();
    h.multiRemove.mockClear();
    // Evita que el atajo dev-login se dispare antes de mirar el token.
    delete process.env.EXPO_PUBLIC_DEV_AUTH_EMAIL;
  });

  it("fetchMe rechaza NetworkError → conserva token y pasa a offline", async () => {
    h.fetchMe.mockRejectedValueOnce(new NetworkError());
    await bootstrap();
    expect(getAuthState()).toEqual({ status: "offline" });
    expect(h.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("fetchMe rechaza ApiError 401 → borra token y desloguea", async () => {
    h.fetchMe.mockRejectedValueOnce(new ApiError(401, "unauthorized"));
    await bootstrap();
    expect(getAuthState()).toEqual({ status: "signed-out" });
    expect(h.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
  });

  it("fetchMe rechaza ApiError 500 → offline, conserva token (no es sesión inválida)", async () => {
    h.fetchMe.mockRejectedValueOnce(new ApiError(500, "server_error"));
    await bootstrap();
    expect(getAuthState()).toEqual({ status: "offline" });
    expect(h.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("sin token guardado → signed-out sin llamar a fetchMe", async () => {
    h.getItemAsync.mockResolvedValueOnce(null);
    await bootstrap();
    expect(getAuthState()).toEqual({ status: "signed-out" });
    expect(h.fetchMe).not.toHaveBeenCalled();
  });

  it("fetchMe ok con restaurante → signed-in", async () => {
    h.fetchMe.mockResolvedValueOnce({ ...fakeUser, restaurantId: "r1", restaurantName: "Dev" });
    await bootstrap();
    expect(getAuthState()).toMatchObject({ status: "signed-in" });
    expect(h.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("fetchMe ok sin restaurante → needs-restaurant", async () => {
    h.fetchMe.mockResolvedValueOnce({ ...fakeUser, restaurantId: null });
    await bootstrap();
    expect(getAuthState()).toMatchObject({ status: "needs-restaurant" });
  });

  it("credencial Apple revocada → borra la sesión antes de llamar a la API", async () => {
    h.getItemAsync.mockImplementation(async (key: string) =>
      key === TOKEN_KEY ? "test-token" : "apple-user-123",
    );
    h.getCredentialStateAsync.mockResolvedValueOnce(0);

    await bootstrap();

    expect(h.getCredentialStateAsync).toHaveBeenCalledWith("apple-user-123");
    expect(h.fetchMe).not.toHaveBeenCalled();
    expect(h.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(h.deleteItemAsync).toHaveBeenCalledWith(APPLE_USER_ID_KEY);
    expect(getAuthState()).toEqual({ status: "signed-out" });
  });

  it("fallo temporal al consultar Apple no expulsa al usuario", async () => {
    h.getItemAsync.mockImplementation(async (key: string) =>
      key === TOKEN_KEY ? "test-token" : "apple-user-123",
    );
    h.getCredentialStateAsync.mockRejectedValueOnce(new Error("simulator unavailable"));
    h.fetchMe.mockResolvedValueOnce({ ...fakeUser, restaurantId: null });

    await bootstrap();

    expect(h.fetchMe).toHaveBeenCalledOnce();
    expect(getAuthState()).toMatchObject({ status: "needs-restaurant" });
  });

  it("signOut borra todas las colas offline y conserva otras claves", async () => {
    h.asyncStorage.set("atelier.idea_queue.v1", "legacy");
    h.asyncStorage.set("atelier.idea_queue.v2.user-a.restaurant-a", "a");
    h.asyncStorage.set("atelier.idea_queue.v2.user-b.restaurant-b", "b");
    h.asyncStorage.set("otro.modulo", "keep");

    await getAuthActions().signOut();

    expect(h.getAllKeys).toHaveBeenCalledOnce();
    expect(h.multiRemove).toHaveBeenCalledWith([
      "atelier.idea_queue.v1",
      "atelier.idea_queue.v2.user-a.restaurant-a",
      "atelier.idea_queue.v2.user-b.restaurant-b",
    ]);
    expect([...h.asyncStorage.entries()]).toEqual([["otro.modulo", "keep"]]);
    expect(getAuthState()).toEqual({ status: "signed-out" });
    expect(h.deleteItemAsync).toHaveBeenCalledWith(APPLE_USER_ID_KEY);
  });
});
