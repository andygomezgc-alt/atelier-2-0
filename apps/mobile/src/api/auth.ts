import { apiFetch } from "./client";

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

// Login con Google: la app obtiene el idToken del SDK nativo y el server lo
// verifica contra las llaves públicas de Google. Devuelve el mismo
// {accessToken, user} que el magic link.
export function loginWithGoogle(
  idToken: string,
): Promise<{ accessToken: string; user: MeUser }> {
  return apiFetch("/api/mobile/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
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

// POST /api/restaurant/leave — el body lleva el caso que el usuario confirmó en
// el preflight; el server lo recomputa dentro de una tx serializable (P1-1). Si
// la situación cambió responde 409 `case_changed` (ApiError) y el caller
// re-pide el preflight sin ejecutar nada. En caso C `confirmName` debe ser el
// nombre exacto del restaurante (el server lo re-valida, no confía en la UI).
export function leaveRestaurant(body: {
  expectedCase: "A" | "C";
  confirmName?: string;
}): Promise<{ action: "left" | "deleted" }> {
  return apiFetch("/api/restaurant/leave", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Eliminar cuenta — preflight read-only (misma filosofía que el leave
// preflight): decide qué variante del sheet rendear sin disparar acciones.
// Contrato fijo con la API (se construye en paralelo); el móvil duplica los
// tipos acá, no importa de @atelier/shared.
export type DeletePreflight = {
  case: "A" | "B" | "C" | "none";
  restaurantName: string | null;
  // Solo en caso B — bloqueado: hay que pasar el rol de admin a uno de estos.
  otherMembers?: LeavePreflightMember[];
  authored: {
    recipes: number;
    ideas: number;
    conversations: number;
    yieldTests: number;
  };
};

export function deletePreflight(): Promise<DeletePreflight> {
  return apiFetch("/api/me/delete-preflight");
}

// DELETE /api/me — borra la cuenta. `confirmEmail` debe ser el email exacto
// del usuario; el server lo re-valida (400 confirm_mismatch) y re-computa el
// caso (409 last_admin / case_changed). Responde 204 sin body.
export function deleteAccount(confirmEmail: string): Promise<void> {
  return apiFetch("/api/me", {
    method: "DELETE",
    body: JSON.stringify({ confirmEmail }),
  });
}
