// "Memoria" chip (E7): whether the restaurant's culinary memory is on, and its sheet.
// Real restaurant only; `enabled` stays null (chip hidden) while loading or on error.
import { useEffect, useState } from "react";
import { getCulinaryMemory } from "@/src/api/culinary-memory";

export function useMemoryChip(restaurantId: string | null) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setEnabled(null);
    setOpen(false);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    // Ignore responses that arrive after the restaurant changed or the screen unmounted.
    let current = true;
    getCulinaryMemory()
      .then((memory) => {
        if (current && memory.restaurantId === restaurantId) setEnabled(memory.enabled);
      })
      .catch(() => {
        if (current) setEnabled(null);
      });
    return () => {
      current = false;
    };
  }, [restaurantId, reload]);

  return {
    enabled,
    open,
    openSheet: () => setOpen(true),
    // Closing the sheet re-reads the state: it may have just been turned off or on.
    closeSheet: () => {
      setOpen(false);
      setReload((n) => n + 1);
    },
  };
}
