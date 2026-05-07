import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!hasRestaurant) return;

    setRs({ status: "loading" });
    apiFetch<Restaurant>("/api/restaurant")
      .then((data) => setRs({ status: "ok", data }))
      .catch((err: Error) => setRs({ status: "error", message: err.message }));
  }, [hasRestaurant]);

  function reload() {
    if (!hasRestaurant) return;
    apiFetch<Restaurant>("/api/restaurant")
      .then((data) => setRs({ status: "ok", data }))
      .catch((err: Error) => setRs({ status: "error", message: err.message }));
  }

  return { rs, reload };
}
