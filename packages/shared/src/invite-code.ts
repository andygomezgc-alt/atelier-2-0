// Mirrors project/app.jsx:301 generateCode().
// Format: <SLUG_OF_RESTAURANT_NAME>-<4_RANDOM_ALNUM>
// Example: "MARCHE-A7K2" for "Ristorante Marche".

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar(): string {
  const idx = Math.floor(Math.random() * ALPHABET.length);
  // ALPHABET is a 36-char constant, so the indexed access is always defined.
  return ALPHABET.charAt(idx);
}

export function generateInviteCode(restaurantName: string | null | undefined): string {
  const normalized = (restaurantName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  const slug = normalized.slice(0, 6) || "ATELIER";

  const suffix = Array.from({ length: 4 }, randomChar).join("");
  return `${slug}-${suffix}`;
}
