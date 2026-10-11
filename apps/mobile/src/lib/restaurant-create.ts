type CreateRestaurantInput = { name: string; identityLine?: string; city?: string };

export function createRestaurantBody({ name, identityLine, city }: CreateRestaurantInput): CreateRestaurantInput {
  const trimmedIdentity = identityLine?.trim();
  const trimmedCity = city?.trim();
  return {
    name: name.trim(),
    ...(trimmedIdentity ? { identityLine: trimmedIdentity } : {}),
    ...(trimmedCity ? { city: trimmedCity } : {}),
  };
}
