// P1-4 — bootstrap resiliente: un fallo de RED al arrancar (wifi de cocina,
// timeout, 500 de Vercel) NO debe destruir la sesión. Solo un 401 real
// (token vencido/revocado) borra el token y desloguea; el resto conserva el
// token y pasa a "offline" para que el chef reintente.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, TOKEN_KEY } from "@/src/api/client";

// vi.hoisted: las factories de vi.mock se izan por encima de los imports, así
// que los spies tienen que existir antes. (Patrón del repo.)
const h = vi.hoisted(() => ({
  getItemAsync: vi.fn(async (_k: string): Promise<string | null> => "test-token"),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  fetchMe: vi.fn(),
  devLogin: vi.fn(),
  loginWithGoogle: vi.fn(),
  requestMagicLink: vi.fn(),
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
  requestMagicLink: h.requestMagicLink,
}));

import { bootstrap, getAuthState } from "@/src/hooks/useAuth";

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
  customProvider: null,
  customModel: null,
  customApiKeySet: false,
};

describe("useAuth bootstrap (P1-4)", () => {
  beforeEach(() => {
    h.getItemAsync.mockResolvedValue("test-token");
    h.deleteItemAsync.mockClear();
    h.setItemAsync.mockClear();
    h.fetchMe.mockReset();
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
});
