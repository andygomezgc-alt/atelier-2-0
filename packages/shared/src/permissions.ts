import type { Role } from "@atelier/db";

export type Permission =
  | "capture_idea"
  | "edit_recipe"
  | "advance_to_test"
  | "approve_recipe"
  | "create_menu"
  | "edit_menu"
  | "view_staff_recipe"
  | "export_pdf"
  | "view_invite_code"
  | "manage_members"
  | "change_role"
  | "edit_restaurant";

const MATRIX: Record<Permission, ReadonlyArray<Role>> = {
  capture_idea: ["admin", "chef_executive", "sous_chef"],
  edit_recipe: ["admin", "chef_executive", "sous_chef"],
  advance_to_test: ["admin", "chef_executive", "sous_chef"],
  approve_recipe: ["admin", "chef_executive"],
  create_menu: ["admin", "chef_executive", "sous_chef"],
  edit_menu: ["admin", "chef_executive", "sous_chef"],
  view_staff_recipe: ["admin", "chef_executive", "sous_chef"],
  export_pdf: ["admin", "chef_executive", "sous_chef", "viewer"],
  view_invite_code: ["admin"],
  manage_members: ["admin"],
  change_role: ["admin"],
  edit_restaurant: ["admin"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}
