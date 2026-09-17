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
  | "manage_products"
  | "use_creative_chat";

const MATRIX: Record<Permission, ReadonlyArray<Role>> = {
  capture_idea: ["admin", "chef_executive", "sous_chef"],
  edit_recipe: ["admin", "chef_executive", "sous_chef"],
  advance_to_test: ["admin", "chef_executive", "sous_chef"],
  approve_recipe: ["admin", "chef_executive"],
  // Los menús son del admin y del chef ejecutivo (decisión del 17-09-2026):
  // el sous-chef cocina, pero no arma ni retoca la carta.
  create_menu: ["admin", "chef_executive"],
  edit_menu: ["admin", "chef_executive"],
  delete_menu: ["admin"],
  // El Lector ve y abre recetas; editar sigue siendo de quien cocina.
  view_staff_recipe: ["admin", "chef_executive", "sous_chef", "viewer"],
  // Exportar saca información de la casa: solo admin y chef ejecutivo.
  export_pdf: ["admin", "chef_executive"],
  view_invite_code: ["admin"],
  manage_members: ["admin"],
  change_role: ["admin"],
  edit_restaurant: ["admin"],
  // Banco de Productos: mismo set que edit_recipe — quien cocina maneja
  // su inventario. Viewers no tocan productos pero los ven indirectamente
  // via recetas.
  manage_products: ["admin", "chef_executive", "sous_chef"],
  // Chat Creativo (el modelo caro): admin y chef ejecutivo. El sous-chef usa
  // el Diario. El Lector no tiene chat, porque tampoco tiene `capture_idea`.
  use_creative_chat: ["admin", "chef_executive"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}
