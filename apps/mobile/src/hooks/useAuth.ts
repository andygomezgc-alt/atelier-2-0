import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SecureStore from "@/src/lib/secure-storage";
import { TOKEN_KEY } from "@/src/api/client";
import { devLogin, fetchMe, requestMagicLink, type MeUser } from "@/src/api/auth";
import { clearAll as clearApiCache } from "@/src/api/cache";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "needs-restaurant"; user: MeUser }
  | { status: "signed-in"; user: MeUser };

// Module-level store so any component can call `getAuthState()` synchronously
// for non-hook usage (e.g. the API client).
let _state: AuthState = { status: "loading" };
const _listeners = new Set<() => void>();

function setState(next: AuthState) {
  _state = next;
  _listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  _listeners.add(l);
  return () => _listeners.delete(l);
}

function getSnapshot(): AuthState {
  return _state;
}

export function getAuthState(): AuthState {
  return _state;
}

// A-12 — Acciones imperativas accesibles fuera de componentes (ej. el
// `LazyRestaurantHost` que vive global). Mismo comportamiento que las que
// expone el hook; las definimos a nivel módulo para que el host pueda
// patchLocalUser y refreshMe sin estar bajo el árbol de un componente.
async function refreshMeImpl(): Promise<void> {
  try {
    const user = await fetchMe();
    setState(
      user.restaurantId
        ? { status: "signed-in", user }
        : { status: "needs-restaurant", user },
    );
  } catch {
    // keep current state on network error
  }
}

function patchLocalUserImpl(updates: Partial<MeUser>): void {
  if (_state.status !== "signed-in" && _state.status !== "needs-restaurant") return;
  const next = { ..._state.user, ...updates };
  setState(
    next.restaurantId
      ? { status: "signed-in", user: next }
      : { status: "needs-restaurant", user: next },
  );
}

export function getAuthActions() {
  return { refreshMe: refreshMeImpl, patchLocalUser: patchLocalUserImpl };
}

// Re-exportamos MeUser para los consumidores no-hook (ej. LazyRestaurantHost).
export type { MeUser };

async function bootstrap() {
  // DEV: if the dev-auth env var is set, skip every login flow and sign in
  // with a fixed test user that auto-gets a Dev Kitchen restaurant. We do this
  // BEFORE checking any stored token so stale sessions from previous magic-link
  // attempts (e.g. a user that never finished onboarding) don't pin you to the
  // choose-flow screen. Backend 404s the endpoint outside dev.
  const devEmail = process.env.EXPO_PUBLIC_DEV_AUTH_EMAIL;
  if (devEmail) {
    try {
      const { accessToken, user } = await devLogin(devEmail);
      // Best-effort persistence — if SecureStore throws on this platform, the
      // in-memory state still advances so the UI doesn't get stuck on login.
      // Next cold start will just dev-login again.
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken).catch(() => null);
      console.log("[dev-auth] signed in as", user.email, "restaurant:", user.restaurantName);
      setState(
        user.restaurantId
          ? { status: "signed-in", user }
          : { status: "needs-restaurant", user },
      );
      return;
    } catch (err) {
      console.warn("[dev-auth] failed, falling back:", err);
    }
  }

  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) {
    setState({ status: "signed-out" });
    return;
  }
  try {
    const user = await fetchMe();
    setState(
      user.restaurantId
        ? { status: "signed-in", user }
        : { status: "needs-restaurant", user },
    );
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
    setState({ status: "signed-out" });
  }
}

let bootstrapped = false;
function ensureBootstrapped() {
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrap();
}

export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Bootstrap once on first use
  const didRun = useRef(false);
  if (!didRun.current) {
    didRun.current = true;
    ensureBootstrapped();
  }

  const sendMagicLink = useCallback(async (email: string): Promise<void> => {
    await requestMagicLink(email);
  }, []);

  const signInWithToken = useCallback(
    async (accessToken: string, user: MeUser): Promise<void> => {
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      setState(
        user.restaurantId
          ? { status: "signed-in", user }
          : { status: "needs-restaurant", user },
      );
    },
    [],
  );

  const refreshMe = useCallback(refreshMeImpl, []);

  // Local-only merge into the signed-in user — útil tras un PATCH que ya
  // devuelve el shape canónico (ej. rename del restaurante). Evita el GET
  // a /api/me extra que dispararía `refreshMe`.
  const patchLocalUser = useCallback(patchLocalUserImpl, []);

  const signOut = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
    // Si otro usuario logea en el mismo device, no debe ver datos del anterior.
    clearApiCache();
    setState({ status: "signed-out" });
  }, []);

  return { state, sendMagicLink, signInWithToken, refreshMe, patchLocalUser, signOut };
}
