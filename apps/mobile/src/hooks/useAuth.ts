import { useCallback, useRef, useSyncExternalStore } from "react";
import * as SecureStore from "@/src/lib/secure-storage";
import { TOKEN_KEY, setUnauthorizedHandler } from "@/src/api/client";
import { devLogin, fetchMe, loginWithGoogle, requestMagicLink, type MeUser } from "@/src/api/auth";
import { clearAll as clearApiCache } from "@/src/api/cache";
import { setLang } from "@/src/hooks/useI18n";

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
  // Apenas hay usuario, la app arranca en SU idioma (languagePref). Sin esto un
  // chef italiano veía la app en español (default del módulo i18n) aunque su
  // perfil dijera "it". Centralizado acá cubre todos los caminos de login.
  if (next.status === "signed-in" || next.status === "needs-restaurant") {
    setLang(next.user.languagePref);
  }
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

// signOut imperativo reutilizable: lo usa el hook y el handler global de 401
// (sesión inválida). Idempotente: llamarlo ya deslogueado no hace daño.
async function signOutImpl(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
  // Si otro usuario logea en el mismo device, no debe ver datos del anterior.
  clearApiCache();
  setState({ status: "signed-out" });
}

// Google Sign-In. Import perezoso del módulo nativo: así vitest (node) y la
// web no intentan cargar el binario al evaluar este archivo. Configure es
// idempotente (lo corremos una sola vez).
let _googleConfigured = false;
async function getGoogle() {
  const mod = await import("@react-native-google-signin/google-signin");
  if (!_googleConfigured) {
    mod.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    _googleConfigured = true;
  }
  return mod;
}

// Resuelve sin error si el usuario cancela; lanza en fallos reales (el caller
// muestra el toast). El idToken se valida en el server (/api/mobile/auth/google).
async function signInWithGoogleImpl(): Promise<void> {
  const { GoogleSignin, statusCodes, isErrorWithCode } = await getGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type === "cancelled") return;
    const idToken = res.data?.idToken;
    if (!idToken) throw new Error("google_no_id_token");
    const { accessToken, user } = await loginWithGoogle(idToken);
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    setState(
      user.restaurantId
        ? { status: "signed-in", user }
        : { status: "needs-restaurant", user },
    );
  } catch (err) {
    // Algunas versiones tiran la cancelación como error en vez de devolverla.
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return;
    throw err;
  }
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
  // Cualquier request autenticado que reciba 401 (token vencido a los 30d o
  // tokenVersion revocado) desloguea limpio en vez de dejar la sesión zombi.
  setUnauthorizedHandler(() => {
    void signOutImpl();
  });
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

  const signInWithGoogle = useCallback(signInWithGoogleImpl, []);

  const refreshMe = useCallback(refreshMeImpl, []);

  // Local-only merge into the signed-in user — útil tras un PATCH que ya
  // devuelve el shape canónico (ej. rename del restaurante). Evita el GET
  // a /api/me extra que dispararía `refreshMe`.
  const patchLocalUser = useCallback(patchLocalUserImpl, []);

  const signOut = useCallback(signOutImpl, []);

  return { state, sendMagicLink, signInWithGoogle, signInWithToken, refreshMe, patchLocalUser, signOut };
}
