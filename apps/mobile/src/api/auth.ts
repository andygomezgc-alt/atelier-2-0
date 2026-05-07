import { apiFetch } from "./client";

export type MeUser = {
  id: string;
  email: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  role: "admin" | "chef_executive" | "sous_chef" | "viewer";
  languagePref: "es" | "it" | "en";
  defaultModel: "sonnet" | "opus";
  restaurantId: string | null;
  restaurantName: string | null;
};

export function requestMagicLink(email: string): Promise<{ ok: boolean }> {
  return apiFetch("/api/mobile/auth/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyMagicLink(
  token: string,
  email: string,
): Promise<{ accessToken: string; user: MeUser }> {
  return apiFetch("/api/mobile/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token, email }),
  });
}

export function fetchMe(): Promise<MeUser> {
  return apiFetch("/api/me");
}

export function patchMe(data: {
  name?: string;
  bio?: string;
  languagePref?: "es" | "it" | "en";
  defaultModel?: "sonnet" | "opus";
}): Promise<MeUser> {
  return apiFetch("/api/me", { method: "PATCH", body: JSON.stringify(data) });
}
