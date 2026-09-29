import { can, ChefNoteTextSchema } from "@atelier/shared";

type Role = Parameters<typeof can>[0];

/** Mismo tope que valida la API (`ChefNoteTextSchema`), en unidades UTF-16. */
export const CHEF_NOTE_MAX_LENGTH = 160;

/** Texto inicial de "Recordar esto": una sola línea, sin espacios de sobra y dentro del tope. */
export function noteDraftFromMessage(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= CHEF_NOTE_MAX_LENGTH) return flat;
  let end = CHEF_NOTE_MAX_LENGTH;
  // No partir un par sustituto (emoji) en el borde del recorte.
  const last = flat.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return flat.slice(0, end).trimEnd();
}

export function isNoteTextValid(text: string): boolean {
  return ChefNoteTextSchema.safeParse(text).success;
}

/** Solo quien aprueba recetas guarda notas, y solo en un restaurante real (no en la vista previa). */
export function canRememberNote(role: Role | null, restaurantId: string | null | undefined): boolean {
  return role != null && Boolean(restaurantId) && can(role, "approve_recipe");
}
