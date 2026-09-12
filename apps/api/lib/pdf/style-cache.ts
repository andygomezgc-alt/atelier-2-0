import { createHash } from "node:crypto";
import { MenuCustomThemeSchema, MenuStyleSpecSchema } from "@atelier/shared";
import { sanitizeTheme } from "./theme-sanitize";
import { validateThemeStructure } from "./theme-render";

// Metadata del servidor dentro del JSON existente; no forma parte del contrato
// que recibe el modelo ni obliga a migrar estilos guardados con clientes viejos.
export function menuReferenceHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function cachedMenuStyle(
  restaurant: { menuStyleTheme?: unknown; menuStyleSpec?: unknown } | null,
  sha256: string,
  mimeType: string,
) {
  const stored = restaurant?.menuStyleTheme;
  if (!stored || typeof stored !== "object" || !("reference" in stored)) return null;
  const reference = stored.reference;
  if (!reference || typeof reference !== "object" ||
      !("sha256" in reference) || reference.sha256 !== sha256 ||
      !("mimeType" in reference) || reference.mimeType !== mimeType) return null;
  const theme = MenuCustomThemeSchema.safeParse(stored);
  const spec = MenuStyleSpecSchema.safeParse(restaurant?.menuStyleSpec);
  if (!theme.success || !spec.success) return null;
  try {
    validateThemeStructure(sanitizeTheme(theme.data));
  } catch {
    return null;
  }
  return { spec: spec.data, themeGenerated: true, reused: true };
}
