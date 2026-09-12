import { prisma, type Prisma } from "@atelier/db";
import { MenuCustomThemeSchema, MenuStyleSpecSchema } from "@atelier/shared";
import { sanitizeTheme } from "./pdf/theme-sanitize";
import { validateThemeStructure } from "./pdf/theme-render";

export class MenuStyleError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

async function lock(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`menu-style:${restaurantId}`}))`;
}

export async function activateMenuStyle(restaurantId: string, versionId: string, expectedId: string | null, menuId?: string) {
  return prisma.$transaction(async tx => {
    await lock(tx, restaurantId);
    const [restaurant, version] = await Promise.all([
      tx.restaurant.findUnique({ where: { id: restaurantId } }),
      tx.menuStyleVersion.findFirst({ where: { id: versionId, restaurantId, discardedAt: null } }),
    ]);
    if (!restaurant || !version) throw new MenuStyleError("menu_style_not_found", 404);
    if (restaurant.menuStyleVersionId !== expectedId && restaurant.menuStyleVersionId !== versionId) {
      throw new MenuStyleError("menu_style_changed");
    }
    if (menuId && !(await tx.menuFolder.count({ where: { id: menuId, restaurantId, deletedAt: null } }))) {
      throw new MenuStyleError("menu_style_not_found", 404);
    }
    const parsedSpec = MenuStyleSpecSchema.safeParse(version.spec);
    if (!parsedSpec.success) throw new MenuStyleError("menu_style_invalid", 422);
    const spec = parsedSpec.data;
    if (version.theme != null) {
      try { validateThemeStructure(sanitizeTheme(MenuCustomThemeSchema.parse(version.theme))); }
      catch { throw new MenuStyleError("menu_style_invalid", 422); }
    }

    // Conservar también el estilo anterior a la introducción del historial.
    if (!restaurant.menuStyleVersionId && MenuStyleSpecSchema.safeParse(restaurant.menuStyleSpec).success) {
      await tx.menuStyleVersion.create({ data: {
        restaurantId, name: "Original", spec: restaurant.menuStyleSpec as Prisma.InputJsonValue,
        ...(restaurant.menuStyleTheme == null ? {} : { theme: restaurant.menuStyleTheme }),
        refUrl: restaurant.menuStyleRefUrl,
        activatedAt: new Date(),
      } });
    }
    await tx.restaurant.update({ where: { id: restaurantId }, data: {
      menuStyleVersionId: version.id, menuStyleSpec: spec,
      // Conservar metadata de la versión: el renderer vuelve a validar al usarla.
      ...(version.theme == null ? {} : { menuStyleTheme: version.theme }), menuStyleRefUrl: version.refUrl,
    } });
    // SQL NULL explícito: evita serializar un sentinel DbNull como {} cuando
    // el servidor de desarrollo carga dos instancias del runtime de Prisma.
    if (version.theme == null) {
      await tx.$executeRaw`UPDATE "Restaurant" SET "menuStyleTheme" = NULL WHERE "id" = ${restaurantId}`;
    }
    await tx.menuStyleVersion.update({ where: { id: version.id }, data: { activatedAt: new Date() } });
    if (menuId) await tx.menuFolder.update({ where: { id: menuId }, data: { presentationStyle: "custom" } });
    return { activeVersionId: version.id };
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function discardMenuStyle(restaurantId: string, versionId: string) {
  return prisma.$transaction(async tx => {
    await lock(tx, restaurantId);
    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { menuStyleVersionId: true } });
    if (!restaurant) throw new MenuStyleError("menu_style_not_found", 404);
    if (restaurant.menuStyleVersionId === versionId) throw new MenuStyleError("menu_style_active");
    const result = await tx.menuStyleVersion.updateMany({
      where: { id: versionId, restaurantId, activatedAt: null, discardedAt: null },
      data: { discardedAt: new Date() },
    });
    if (!result.count) throw new MenuStyleError("menu_style_not_found", 404);
    // Conserva blobs: un estilo histórico puede compartir la referencia.
    return { ok: true };
  });
}
