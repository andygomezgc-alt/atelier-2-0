// Phase 0 mock auth: SecureStore-backed flag toggled by the login screen.
// The real Auth.js client lands in Phase 1 — when it does, this hook keeps
// the same surface (signIn / signOut / state) so screens don't change.

import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "atelier.session.v0";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string };

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((value) => {
        setState(value ? { status: "signed-in", email: value } : { status: "signed-out" });
      })
      .catch(() => setState({ status: "signed-out" }));
  }, []);

  const signIn = useCallback(async (email: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, email);
    setState({ status: "signed-in", email });
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setState({ status: "signed-out" });
  }, []);

  return { state, signIn, signOut };
}
