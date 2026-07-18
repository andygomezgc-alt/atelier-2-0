import type { Prisma } from "@atelier/db";

/**
 * Borra todas las filas de un restaurante en el orden exigido por sus FKs.
 * Debe ejecutarse dentro de la transacción serializable del caller.
 */
export async function deleteRestaurantRecords(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<void> {
  await tx.menuItem.deleteMany({ where: { menuFolder: { restaurantId } } });
  await tx.menuClientOverride.deleteMany({ where: { menuFolder: { restaurantId } } });
  await tx.menuSection.deleteMany({ where: { menuFolder: { restaurantId } } });
  await tx.menuFolder.deleteMany({ where: { restaurantId } });
  await tx.recipeIngredient.deleteMany({ where: { recipe: { restaurantId } } });
  await tx.recipe.deleteMany({ where: { restaurantId } });
  await tx.message.deleteMany({ where: { conversation: { restaurantId } } });
  await tx.conversation.deleteMany({ where: { restaurantId } });
  await tx.idea.deleteMany({ where: { restaurantId } });
  await tx.yieldTest.deleteMany({ where: { restaurantId } });
  await tx.productPriceHistory.deleteMany({ where: { product: { restaurantId } } });
  await tx.product.deleteMany({ where: { restaurantId } });
  await tx.auditLog.deleteMany({ where: { restaurantId } });
  await tx.user.updateMany({ where: { restaurantId }, data: { restaurantId: null } });
  await tx.restaurant.deleteMany({ where: { id: restaurantId } });
}
