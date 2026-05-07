import { useAuth } from "./useAuth";
import { can, type Permission, type Role } from "@atelier/shared";

export function usePermissions() {
  const { state } = useAuth();
  const role: Role =
    state.status === "signed-in" || state.status === "needs-restaurant"
      ? state.user.role
      : "viewer";

  return {
    role,
    can: (permission: Permission) => can(role, permission),
  };
}
