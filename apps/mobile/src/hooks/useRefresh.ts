// Pull-to-refresh genérico: invalida los prefijos de caché de la pantalla y
// vuelve a llamar su `reload`. El useRef evita que un segundo gesto (o el
// RefreshControl reentrando) dispare un refetch superpuesto mientras el
// primero sigue en curso.

import { useCallback, useRef, useState } from "react";
import { forceRefresh } from "@/src/lib/refresh";

export function useRefresh(prefixes: readonly string[], reload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const inProgress = useRef(false);

  const onRefresh = useCallback(async () => {
    if (inProgress.current) return;
    inProgress.current = true;
    setRefreshing(true);
    try {
      await forceRefresh(prefixes, reload);
    } finally {
      inProgress.current = false;
      setRefreshing(false);
    }
  }, [prefixes, reload]);

  return { refreshing, onRefresh };
}
