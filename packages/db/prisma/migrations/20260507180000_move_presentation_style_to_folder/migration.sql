-- Move presentationStyle from MenuItem (per-item) to MenuFolder (per-menu).
-- The brief models the style as a menu-level concept (one PDF style per menu),
-- so the schema follows. Existing data: any custom per-item style is dropped;
-- folders pick up the default 'elegant'. Acceptable in dev — the seed only
-- uses elegant anyway.

ALTER TABLE "MenuFolder"
  ADD COLUMN "presentationStyle" "MenuStyle" NOT NULL DEFAULT 'elegant';

ALTER TABLE "MenuItem"
  DROP COLUMN "presentationStyle";
