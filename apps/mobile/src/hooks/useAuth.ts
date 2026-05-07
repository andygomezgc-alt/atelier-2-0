import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { TOKEN_KEY } from "@/src/api/client";
import { fetchMe, requestMagicLink, type MeUser } from "@/src/api/auth";

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

async function bootstrap() {
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

  const refreshMe = useCallback(async (): Promise<void> => {
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
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
    setState({ status: "signed-out" });
  }, []);

  return { state, sendMagicLink, signInWithToken, refreshMe, signOut };
}
