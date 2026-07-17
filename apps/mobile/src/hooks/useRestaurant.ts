import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/src/api/client";
import { useAuth } from "./useAuth";

export type StaffMember = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: "admin" | "chef_executive" | "sous_chef" | "viewer";
};

export type Restaurant = {
  id: string;
  name: string;
  identityLine: string | null;
  photoUrl: string | null;
  inviteCode: string;
  staff: StaffMember[];
};

type RestaurantState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: Restaurant };

export function useRestaurant() {
  const { state } = useAuth();
  const [rs, setRs] = useState<RestaurantState>({ status: "loading" });

  const hasRestaurant =
    (state.status === "signed-in" || state.status === "needs-restaurant") &&
    state.user.restaurantId != null;

  // reload NO pisa a "loading" a propósito: el pull-to-refresh de Casa (P2-18)
  // mantiene visible el contenido actual mientras el RefreshControl gira. La
  // transición a "loading" (spinner de pantalla completa) la hace solo el
  // efecto inicial de abajo. Devuelve Promise para encajar con useRefresh.
  const load = useCallback(async (): Promise<void> => {
    if (!hasRestaurant) return;
    try {
      const data = await apiFetch<Restaurant>("/api/restaurant");
      setRs({ status: "ok", data });
    } catch (err) {
      setRs({
        status: "error",
        message: err instanceof Error ? err.message : "network_unreachable",
      });
    }
  }, [hasRestaurant]);

  useEffect(() => {
    if (!hasRestaurant) return;
    setRs({ status: "loading" });
    void load();
  }, [hasRestaurant, load]);

  return { rs, reload: load };
}
