// Calls `tick` every few seconds while `active`, only while the screen is focused and the app
// is in the foreground; coming back to the foreground refreshes at once. Used while an
// invoice is being read.
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

export const POLL_MS = 4000;

export function usePolling(active: boolean, tick: () => void, intervalMs = POLL_MS): void {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      let foreground = AppState.currentState === "active";
      const subscription = AppState.addEventListener("change", (state) => {
        const returning = state === "active" && !foreground;
        foreground = state === "active";
        if (returning) tickRef.current();
      });
      const timer = setInterval(() => {
        if (foreground) tickRef.current();
      }, intervalMs);
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [active, intervalMs]),
  );
}
