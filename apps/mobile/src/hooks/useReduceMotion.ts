// The system "reduce motion" setting, kept current while the screen is open.
// null until the first read answers, so callers can wait before animating.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    // A change event is newer than the first read, so once one arrives the read's answer is stale.
    let changed = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (alive && !changed) setReduce(enabled); })
      .catch(() => { if (alive && !changed) setReduce(false); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      changed = true;
      setReduce(enabled);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
