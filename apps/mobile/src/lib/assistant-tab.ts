import { can } from "@atelier/shared";
import type { MeUser } from "@/src/api/auth";

export function canShowAssistantTab(user: Pick<MeUser, "role" | "restaurantId"> | null): boolean {
  return !user?.restaurantId || can(user.role, "capture_idea");
}
