// Mirrors project/app.jsx:301 generateCode().
// Format: <SLUG_OF_RESTAURANT_NAME>-<6_RANDOM_ALNUM>
// Example: "MARCHE-A7K2X9" for "Ristorante Marche".

import { randomBytes } from "node:crypto";

// Unambiguous alphabet: no 0/O, no 1/I/L. 31 chars → 31^6 ≈ 887M combos.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SUFFIX_LEN = 6;

// Rejection sampling: largest multiple of ALPHABET.length that fits in a byte (256).
const REJECT_THRESHOLD = 256 - (256 % ALPHABET.length);

function randomSuffix(): string {
  let out = "";
  while (out.length < SUFFIX_LEN) {
    const buf = randomBytes(SUFFIX_LEN * 2);
    for (let i = 0; i < buf.length && out.length < SUFFIX_LEN; i++) {
      const b = buf[i]!;
      if (b < REJECT_THRESHOLD) {
        out += ALPHABET.charAt(b % ALPHABET.length);
      }
    }
  }
  return out;
}

export function generateInviteCode(restaurantName: string | null | undefined): string {
  const normalized = (restaurantName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  const slug = normalized.slice(0, 6) || "ATELIER";

  return `${slug}-${randomSuffix()}`;
}
