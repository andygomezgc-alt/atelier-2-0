import type { Role } from "@atelier/db";

export type Permission =
  | "capture_idea"
  | "edit_recipe"
  | "advance_to_test"
  | "approve_recipe"
  | "create_menu"
  | "edit_menu"
  | "delete_menu"
  | "view_staff_recipe"
  | "export_pdf"
  | "view_invite_code"
  | "manage_members"
  | "change_role"
  | "edit_restaurant"
  | "manage_products";

const MATRIX: Record<Permission, ReadonlyArray<Role>> = {
  capture_idea: ["admin", "chef_executive", "sous_chef"],
  edit_recipe: ["admin", "chef_executive", "sous_chef"],
  advance_to_test: ["admin", "chef_executive", "sous_chef"],
  approve_recipe: ["admin", "chef_executive"],
  create_menu: ["admin", "chef_executive", "sous_chef"],
  edit_menu: ["admin", "chef_executive", "sous_chef"],
  delete_menu: ["admin"],
  view_staff_recipe: ["admin", "chef_executive", "sous_chef"],
  export_pdf: ["admin", "chef_executive", "sous_chef", "viewer"],
  view_invite_code: ["admin"],
  manage_members: ["admin"],
  change_role: ["admin"],
  edit_restaurant: ["admin"],
  // Banco de Productos: mismo set que edit_recipe — quien cocina maneja
  // su inventario. Viewers no tocan productos pero los ven indirectamente
  // via recetas.
  manage_products: ["admin", "chef_executive", "sous_chef"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}
