import { apiFetch } from "./client";

export type CustomProvider = "anthropic" | "openai" | "google";

export type MeUser = {
  id: string;
  email: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  role: "admin" | "chef_executive" | "sous_chef" | "viewer";
  languagePref: "es" | "it" | "en";
  defaultModel: "haiku" | "sonnet" | "opus";
  restaurantId: string | null;
  restaurantName: string | null;
  customProvider: CustomProvider | null;
  customModel: string | null;
  customApiKeySet: boolean;
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

// DEV-ONLY. Backed by a route that 404s in production.
export function devLogin(email: string): Promise<{ accessToken: string; user: MeUser }> {
  return apiFetch("/api/mobile/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function patchMe(data: {
  name?: string;
  bio?: string;
  languagePref?: "es" | "it" | "en";
  defaultModel?: "haiku" | "sonnet" | "opus";
  // BYOK. Pass null to clear, omit to leave unchanged.
  customProvider?: CustomProvider | null;
  customModel?: string | null;
  customApiKey?: string | null;
}): Promise<MeUser> {
  return apiFetch("/api/me", { method: "PATCH", body: JSON.stringify(data) });
}

// Admin-only: rename the restaurant. Used from the export preview so the chef
// can adjust how the restaurant is branded on a printed menu card.
export function patchRestaurant(data: {
  name?: string;
  identityLine?: string | null;
}): Promise<{ id: string; name: string }> {
  return apiFetch("/api/restaurant", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Gestión de equipo F3 — leave preflight (read-only, decide qué variante del
// sheet rendear sin disparar acciones).
export type LeavePreflightMember = {
  id: string;
  name: string;
  role: "admin" | "chef_executive" | "sous_chef" | "viewer";
};

export type LeavePreflight = {
  case: "A" | "B" | "C";
  otherMembers?: LeavePreflightMember[];
  // Solo en caso C — el sheet lo usa para el typing-confirm.
  restaurantName?: string;
};

export function getLeavePreflight(): Promise<LeavePreflight> {
  return apiFetch("/api/restaurant/leave/preflight");
}

// POST /api/restaurant/leave — la respuesta exitosa es solo {action} para
// caso A; los casos B y C llegan como ApiError con el `code` correspondiente
// y el caller decide qué rendear.
export function leaveRestaurant(): Promise<{ action: "left" | "deleted" }> {
  return apiFetch("/api/restaurant/leave", { method: "POST" });
}
