import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getDeviceLanguage: vi.fn(),
}));
vi.mock("@/src/api/client", () => ({ apiFetch: h.apiFetch }));
vi.mock("@/src/lib/device-language", () => ({ getDeviceLanguage: h.getDeviceLanguage }));
vi.mock("@/src/lib/secure-storage", () => ({}));
vi.mock("expo-file-system/legacy", () => ({}));

import { loginWithApple, loginWithGoogle, verifyMagicLink } from "../auth";

describe("new-account language hints", () => {
  beforeEach(() => {
    h.apiFetch.mockReset();
    h.getDeviceLanguage.mockReset();
    h.getDeviceLanguage.mockReturnValue("it");
  });

  it("sends the device language with magic-link verification", () => {
    verifyMagicLink("token", "chef@example.test");
    expect(h.apiFetch).toHaveBeenCalledWith("/api/mobile/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token: "token", email: "chef@example.test", languagePref: "it" }),
    });
  });

  it("sends the device language with Google sign-in", () => {
    h.getDeviceLanguage.mockReturnValue("en");
    loginWithGoogle("id-token");
    expect(h.apiFetch).toHaveBeenCalledWith("/api/mobile/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: "id-token", languagePref: "en" }),
    });
  });

  it("sends the device language with Apple sign-in without changing credentials", () => {
    h.getDeviceLanguage.mockReturnValue("es");
    loginWithApple({ identityToken: "identity", authorizationCode: "code", nonce: "nonce", name: "Chef" });
    expect(h.apiFetch).toHaveBeenCalledWith("/api/mobile/auth/apple", {
      method: "POST",
      body: JSON.stringify({
        identityToken: "identity", authorizationCode: "code", nonce: "nonce", name: "Chef", languagePref: "es",
      }),
    });
  });
});
