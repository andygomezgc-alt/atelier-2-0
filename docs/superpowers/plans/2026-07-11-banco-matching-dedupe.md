# Banco de Productos — matching por palabras + limpieza de duplicados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al guardar una receta el sistema reconozca que "480 g ricciola frollata (lomo limpio, piel retirada)" habla del mismo producto que la "Ricciola" del banco, y le PREGUNTE al chef (ConfirmMatchSheet ya existente) en vez de crear un duplicado silencioso. Además: script guiado para unir los duplicados ya existentes (5 ricciolas reales en prod).

**Architecture:** El fix vive casi entero en `apps/api/lib/products/matching.ts` (`findMatch`): se agrega una señal de solapamiento de TOKENS (palabras normalizadas, sin stopwords es/it, con fuzzy por token) al lado de la distancia Levenshtein de frase entera que ya existe. El contrato `MatchResult` (shared) NO cambia; el mobile NO necesita cambios de flujo (probable → ConfirmMatchSheet ya cableado en `nueva.tsx`). Cambio menor en mobile: al confirmar "Sí", guardar como alias el nombre parseado (sin cantidad) en vez del rawText crudo. La limpieza es un script one-off con dry-run por defecto.

**Tech Stack:** Next.js App Router (apps/api), vitest 2 (tests en `apps/api/lib/__tests__/` o junto al módulo), Prisma/Neon, Expo (apps/mobile).

**Working dir:** `C:\Users\Utente\Desktop\atelier-2-0\.claude\worktrees\lucid-haslett-9cf85d` (worktree, rama `claude/lucid-haslett-9cf85d`). Todos los comandos desde ahí.

**Reglas de oro:**
- NO deployar ni hornear: los commits van a la rama y entran en la horneada única pendiente.
- NO tocar la base de PROD con escritura. El script de merge corre en dry-run; el `--apply` es SOLO de Andy, con su OK explícito, fuera de este plan.
- Autor git: `Andy Gomez <andygomezgc@gmail.com>`.
- Al agregar lógica nueva, correr la SUITE COMPLETA del api (no solo el test nuevo): agregar señales rompe fixtures viejos si asumen otro comportamiento.

**Caso real que motiva todo (datos de prod, 12/15-jun):** el banco acumuló 5 productos por la misma ricciola: "Lomo de Ricciola fresquísima", "lomo de ricciola limpio con piel — aprox. 600 g neto", "ricciola frollata (lomo limpio, piel retirada)", "ricciola frollada (lomo limpio, piel retirada post-frolladura)", "lomo de ricciola limpio, piel incluida — aprox. 600 g neto". Levenshtein de frase entera > 3 en todos los pares → `none` → borrador nuevo cada vez.

---

### Task 1: Matching por tokens en `findMatch` (TDD)

**Files:**
- Modify: `apps/api/lib/products/matching.ts`
- Test (create): `apps/api/lib/products/__tests__/matching.test.ts` (el directorio `__tests__` no existe aún dentro de `lib/products/`; crearlo. vitest lo levanta solo — el config del api no restringe paths)

**Diseño (decidido, no reabrir):**
- Se conservan los niveles actuales: `exact` (distancia 0 de frase entera), `probable`, `none`.
- `probable` ahora es: distancia de frase entera 1–3 (comportamiento actual, cubre typos) **O** solapamiento de tokens ≥ 0.6.
- Tokens: `normalizeForMatch` (lowercase, sin acentos) → split por no-alfanumérico → quitar plural por token (misma heurística `stripPluralEs` existente) → descartar tokens de longitud < 2, tokens puramente numéricos, y stopwords (artículos/preposiciones es+it y unidades: de, del, la, el, con, di, da, il, per, aprox, neto, kg, gr, ml…).
- Igualdad fuzzy entre tokens: idénticos, o Levenshtein ≤ 1 si ambos miden ≥ 5 chars ("frollata" ≈ "frollada"; "piel" NUNCA ≈ "miel").
- Solapamiento = coeficiente de overlap: tokens del conjunto CHICO que tienen pareja fuzzy en el grande / tamaño del conjunto chico. Ejemplos que fijan el umbral 0.6:
  - banco "Lomo de Ricciola fresquísima" {lomo, ricciola, fresquisima} vs query "ricciola frollata (lomo limpio, piel retirada)" → 2/3 = 0.67 → **probable** (pregunta) ✓
  - banco "Ricciola" vs "lomo de ricciola limpio con piel — aprox. 600 g neto" → 1/1 = 1.0 → **probable** ✓
  - "aceite de oliva" vs "aceite de girasol" → 1/2 = 0.5 → **none** (no molesta con preguntas tontas) ✓
- El solapamiento se calcula contra el nombre Y cada alias; gana el mayor.
- Selección entre candidatos: mejor nivel primero (exact > probable > none); dentro del mismo nivel, mayor overlap; empate → menor distancia de frase; empate → el que matcheó por nombre (no alias). `MatchResult.distance` sigue reportando la distancia de frase entera (contrato intacto).
- `parseIngredient` ya limpia la cantidad en la ruta `/api/products/match` antes de llamar a `findMatch` — los tests unitarios pasan el nombre ya parseado.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// apps/api/lib/products/__tests__/matching.test.ts
import { describe, expect, it } from "vitest";
import { findMatch, levenshtein, type MatchCandidate } from "../matching";

const cand = (id: string, name: string, aliases: string[] = []): MatchCandidate => ({
  id,
  name,
  aliases,
});

describe("levenshtein (regresión)", () => {
  it("distancias básicas", () => {
    expect(levenshtein("ricciola", "ricciola")).toBe(0);
    expect(levenshtein("riciola", "ricciola")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("findMatch — comportamiento existente (frase entera)", () => {
  it("exact: distancia 0 tras normalizar", () => {
    const r = findMatch("Trufa Negra", [cand("p1", "trufa negra")]);
    expect(r.level).toBe("exact");
    expect(r.productId).toBe("p1");
  });

  it("probable por typo (distancia 1)", () => {
    const r = findMatch("riciola", [cand("p1", "Ricciola")]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("none cuando no hay nada parecido", () => {
    const r = findMatch("azafran", [cand("p1", "chocolate 70%")]);
    expect(r.level).toBe("none");
    expect(r.productId).toBeNull();
  });

  it("query vacío o solo espacios → none", () => {
    expect(findMatch("   ", [cand("p1", "sal")]).level).toBe("none");
  });
});

describe("findMatch — tokens (caso ricciola real de prod)", () => {
  it("frase descriptiva larga matchea el producto corto del banco", () => {
    // El caso exacto que duplicó el banco de Andy (12-jun).
    const r = findMatch("lomo de ricciola limpio con piel — aprox. 600 g neto", [
      cand("p1", "Ricciola"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("dos frases descriptivas de la misma ricciola se reconocen entre sí", () => {
    // Banco sucio (nombre largo) vs línea nueva distinta — 2 de 3 tokens
    // significativos compartidos {lomo, ricciola} → 0.67 ≥ 0.6.
    const r = findMatch("ricciola frollata (lomo limpio, piel retirada)", [
      cand("p1", "Lomo de Ricciola fresquísima"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("fuzzy por token: frollata ≈ frollada (re-guardado del 15-jun)", () => {
    const r = findMatch("ricciola frollada (lomo limpio, piel retirada post-frolladura)", [
      cand("p1", "ricciola frollata (lomo limpio, piel retirada)"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("NO pregunta por productos distintos con palabra genérica compartida", () => {
    // 1/2 = 0.5 < 0.6 → none. El aceite de girasol NO es el de oliva.
    const r = findMatch("aceite de girasol", [cand("p1", "aceite de oliva")]);
    expect(r.level).toBe("none");
  });

  it("tokens cortos no hacen fuzzy: piel ≠ miel como token", () => {
    // "miel de piel de naranja" comparte "naranja" 1/2=0.5 y "piel"≠"miel"
    // (len 4 < 5 → sin fuzzy). Whole-string también lejos → none.
    const r = findMatch("piel de naranja confitada", [cand("p1", "miel de azahar")]);
    expect(r.level).toBe("none");
  });

  it("unidades y stopwords no cuentan como tokens", () => {
    // {ricciola} vs {ricciola} = 1.0 aunque la frase esté llena de ruido.
    const r = findMatch("Ricciola — aprox. 600 g neto", [cand("p1", "Ricciola")]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("matchea también contra aliases por tokens", () => {
    const r = findMatch("ricciola fresca", [
      cand("p1", "Pesce bianco", ["ricciola fresca del mediterraneo"]),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("plurales por token: trufas negras ≈ trufa negra", () => {
    const r = findMatch("trufas negras", [cand("p1", "trufa negra")]);
    // exact o probable según el camino, pero JAMÁS none ni producto nuevo.
    expect(r.level === "exact" || r.level === "probable").toBe(true);
    expect(r.productId).toBe("p1");
  });

  it("exact le gana a probable entre candidatos", () => {
    const r = findMatch("ricciola", [
      cand("p1", "Lomo de Ricciola fresquísima"),
      cand("p2", "Ricciola"),
    ]);
    expect(r.level).toBe("exact");
    expect(r.productId).toBe("p2");
  });

  it("entre dos probables gana el de mayor solapamiento", () => {
    const r = findMatch("ricciola frollata lomo", [
      cand("p1", "Lomo de Ricciola fresquísima"), // {lomo,ricciola,fresquisima}: 2/3
      cand("p2", "ricciola frollata"), // {ricciola,frollata}: 2/2 = 1.0
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p2");
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan los nuevos**

Run: `pnpm --filter api exec vitest run lib/products/__tests__/matching.test.ts`
Expected: FAIL — los tests de tokens fallan con level `"none"`; los de regresión (frase entera) DEBEN pasar ya.

- [ ] **Step 3: Implementación en matching.ts**

Reemplazar el contenido de `apps/api/lib/products/matching.ts` desde la línea de `const EXACT_DISTANCE = 0;` hasta el final del archivo por lo siguiente (todo lo anterior — header, `levenshtein`, `stripPluralEs`, `normalize`, tipos — queda igual; solo se agrega la sección de tokens y se reescribe `findMatch`):

```ts
const EXACT_DISTANCE = 0;
const PROBABLE_MAX_DISTANCE = 3;

// ───────── Matching por tokens (fix duplicados tipo "ricciola", jul 2026) ─────────
//
// La distancia de frase entera no ve que "lomo de ricciola limpio con piel"
// habla de la "Ricciola" del banco (distancia enorme → none → duplicado).
// Señal nueva: solapamiento de tokens significativos. Si ≥ 0.6, el match es
// "probable" y el chef confirma en ConfirmMatchSheet (jamás enlazamos solo).

// Artículos/preposiciones es+it + unidades/ruido de cantidades. Se comparan
// DESPUÉS de quitar plural por token ("las"→"la" ya cae como stopword).
const STOPWORDS = new Set([
  // castellano
  "de", "del", "la", "el", "lo", "un", "una", "uno", "y", "o", "u", "con",
  "sin", "al", "a", "en", "para", "por", "su", "sobre", "mas", "muy",
  // italiano
  "di", "da", "della", "dello", "dei", "degli", "delle", "il", "gli", "le",
  "i", "e", "ed", "ad", "in", "per", "senza", "sul", "sulla", "piu",
  // unidades / ruido de cantidad que sobrevive al parser dentro de paréntesis
  "aprox", "approx", "circa", "ca", "neto", "netto", "g", "gr", "kg", "ml",
  "cl", "l", "lt", "ud", "uds", "unidad", "unidades", "pz", "pezzo", "pezzi",
]);

const FUZZY_TOKEN_MIN_LEN = 5;
const TOKEN_OVERLAP_THRESHOLD = 0.6;

// Exportada para tests. Tokens únicos, normalizados, sin plural, sin
// stopwords, sin números puros, sin tokens de 1 char.
export function tokenizeForMatch(s: string): string[] {
  const out = new Set<string>();
  for (const raw of normalizeForMatch(s).split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || /^\d+$/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    const tok = stripPluralEs(raw);
    if (tok.length < 2 || STOPWORDS.has(tok)) continue;
    out.add(tok);
  }
  return [...out];
}

// Dos tokens "hablan de lo mismo": idénticos, o a 1 edición si ambos son
// largos (frollata≈frollada). Cortos exactos ("piel" jamás ≈ "miel").
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < FUZZY_TOKEN_MIN_LEN || b.length < FUZZY_TOKEN_MIN_LEN) return false;
  return levenshtein(a, b) <= 1;
}

// Coeficiente de overlap: qué fracción del conjunto CHICO encuentra pareja
// en el grande. Robusto cuando un lado es "Ricciola" y el otro una frase.
function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const [small, large] =
    aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  let matched = 0;
  for (const t of small) {
    if (large.some((u) => tokensMatch(t, u))) matched++;
  }
  return matched / small.length;
}

export function findMatch(
  query: string,
  candidates: ReadonlyArray<MatchCandidate>,
): MatchResult {
  const qNorm = normalize(query);
  if (!qNorm) {
    return { level: "none", productId: null, productName: null, distance: Infinity };
  }
  const qTokens = tokenizeForMatch(query);

  let best: {
    candidate: MatchCandidate;
    level: MatchLevel;
    distance: number;
    overlap: number;
    matchedOnName: boolean;
  } | null = null;

  const levelRank: Record<MatchLevel, number> = { exact: 2, probable: 1, none: 0 };

  for (const cand of candidates) {
    // Distancia de frase entera (comportamiento histórico) y overlap de
    // tokens, ambos contra nombre + aliases; nos quedamos con lo mejor.
    const nameNorm = normalize(cand.name);
    let candDist = levenshtein(qNorm, nameNorm);
    let candMatchedOnName = true;
    let candOverlap = tokenOverlap(qTokens, tokenizeForMatch(cand.name));

    for (const alias of cand.aliases) {
      const aliasDist = levenshtein(qNorm, normalize(alias));
      if (aliasDist < candDist) {
        candDist = aliasDist;
        candMatchedOnName = false;
      }
      const aliasOverlap = tokenOverlap(qTokens, tokenizeForMatch(alias));
      if (aliasOverlap > candOverlap) candOverlap = aliasOverlap;
    }

    let level: MatchLevel;
    if (candDist === EXACT_DISTANCE) {
      level = "exact";
    } else if (candDist <= PROBABLE_MAX_DISTANCE || candOverlap >= TOKEN_OVERLAP_THRESHOLD) {
      level = "probable";
    } else {
      level = "none";
    }

    // Mejor candidato: nivel > overlap > distancia > matcheó-por-nombre.
    if (
      !best ||
      levelRank[level] > levelRank[best.level] ||
      (levelRank[level] === levelRank[best.level] &&
        (candOverlap > best.overlap ||
          (candOverlap === best.overlap &&
            (candDist < best.distance ||
              (candDist === best.distance && candMatchedOnName && !best.matchedOnName)))))
    ) {
      best = { candidate: cand, level, distance: candDist, overlap: candOverlap, matchedOnName: candMatchedOnName };
    }
  }

  if (!best || best.level === "none") {
    return {
      level: "none",
      productId: null,
      productName: null,
      distance: best ? best.distance : Infinity,
    };
  }

  return {
    level: best.level,
    productId: best.candidate.id,
    productName: best.candidate.name,
    distance: best.distance,
  };
}
```

Nota: el bloque de comentario del header del archivo (líneas 1-15) debe actualizarse para mencionar la señal de tokens — reemplazar la línea "Tres niveles según distancia de Levenshtein…" por "Tres niveles según distancia de Levenshtein de frase entera + solapamiento de tokens…" y agregar una línea: "`probable` también cuando los tokens significativos se solapan ≥ 0.6 (fix duplicados ricciola, jul 2026).".

- [ ] **Step 4: Correr los tests del módulo y verificar que pasan**

Run: `pnpm --filter api exec vitest run lib/products/__tests__/matching.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Correr la SUITE COMPLETA del api (regla de oro: los guards nuevos rompen fixtures viejos)**

Run: `pnpm --filter api exec vitest run`
Expected: todo verde (141 existentes + 16 nuevos = 157). Si algún test viejo falla porque ahora devuelve `probable` donde esperaba `none`: revisar el fixture — si el caso es del tipo "ricciola" el comportamiento nuevo es el correcto y se actualiza el fixture, documentándolo en el commit.

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/lib/products/matching.ts apps/api/lib/products/__tests__/matching.test.ts
git commit -m "fix(productos): matching por tokens — pregunta al chef en vez de duplicar (caso ricciola)"
```

---

### Task 2: Alias limpio al confirmar "Sí" (mobile)

**Files:**
- Modify: `apps/mobile/app/recetas/nueva.tsx` (función `handleMatchYes`, ~línea 338)

Hoy, al confirmar el match, se guarda como alias el `rawText` CRUDO ("480 g ricciola frollata (…)"), cantidad incluida. Guardar el nombre parseado hace el alias reutilizable (la próxima receta con otra cantidad matchea exacto por alias). `parseIngredient` ya está importado en el archivo desde `@atelier/shared`.

- [ ] **Step 1: Editar `handleMatchYes`**

Reemplazar el bloque best-effort actual:

```tsx
    // Best-effort: agregar el rawText del chef como alias del producto.
    // No bloqueamos el flujo si esto falla — el linkeo ya quedó hecho.
    void (async () => {
      try {
        const prod = await getProduct(current.productId);
        const existing = new Set(prod.aliases.map((a) => a.toLowerCase()));
        if (!existing.has(current.rawText.toLowerCase())) {
          await patchProduct(current.productId, {
            aliases: [...prod.aliases, current.rawText],
          });
        }
      } catch {
        // silently ignore
      }
    })();
```

por:

```tsx
    // Best-effort: agregar el nombre del ingrediente (sin cantidad) como
    // alias del producto. No bloqueamos el flujo si esto falla — el linkeo
    // ya quedó hecho. Se parsea para que "480 g ricciola frollata" quede
    // como alias "ricciola frollata" y matchee exacto la próxima vez.
    void (async () => {
      try {
        const aliasName = parseIngredient(current.rawText).name || current.rawText;
        const prod = await getProduct(current.productId);
        const existing = new Set(prod.aliases.map((a) => a.toLowerCase()));
        if (!existing.has(aliasName.toLowerCase())) {
          await patchProduct(current.productId, {
            aliases: [...prod.aliases, aliasName],
          });
        }
      } catch {
        // silently ignore
      }
    })();
```

- [ ] **Step 2: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: SOLO el error preexistente `TS5101` de `baseUrl` (se ignora; es conocido). Ningún error nuevo.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/recetas/nueva.tsx"
git commit -m "fix(mobile): alias sin cantidad al confirmar match de ingrediente"
```

---

### Task 3: Script de merge de productos duplicados (dry-run por defecto)

**Files:**
- Create: `scripts/products-merge.mjs` (raíz del repo; no existe carpeta `scripts/` — crearla)

Herramienta one-off para unir duplicados existentes (las 5 ricciolas). NO corre sola: la invoca un operador con `DATABASE_URL` en el entorno. Sin `--apply` solo IMPRIME el plan. Reglas: re-enlaza `RecipeIngredient.productId` de cada duplicado al canónico, suma nombre+aliases del duplicado como aliases del canónico (dedupe case-insensitive), y ARCHIVA el duplicado (`estado: "archivado"` — no se borra: puede tener historial). Rechaza mezclar restaurantes o incluir el canónico entre los duplicados.

- [ ] **Step 1: Crear el script**

```js
// scripts/products-merge.mjs
//
// Une productos duplicados del banco en uno canónico.
//   node scripts/products-merge.mjs --canonical <id> --dups <id,id,...> [--apply]
//
// Sin --apply: DRY-RUN — imprime qué haría y no escribe nada.
// Con --apply: en una transacción: re-enlaza RecipeIngredient.productId,
// agrega nombre+aliases de los duplicados como aliases del canónico y
// archiva los duplicados (estado=archivado; NO se borran).
//
// DATABASE_URL viene del entorno (el operador decide contra qué base corre).
// PROD solo con el OK explícito de Andy.

import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const canonicalId = arg("canonical");
const dupIds = (arg("dups") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}
if (!canonicalId || dupIds.length === 0) {
  console.error("Uso: node scripts/products-merge.mjs --canonical <id> --dups <id,id,...> [--apply]");
  process.exit(1);
}
if (dupIds.includes(canonicalId)) {
  console.error("El canónico no puede estar en la lista de duplicados.");
  process.exit(1);
}

const prisma = new PrismaClient();

const canonical = await prisma.product.findUnique({ where: { id: canonicalId } });
if (!canonical) {
  console.error(`Canónico ${canonicalId} no existe.`);
  process.exit(1);
}
const dups = await prisma.product.findMany({ where: { id: { in: dupIds } } });
const missing = dupIds.filter((id) => !dups.some((d) => d.id === id));
if (missing.length > 0) {
  console.error(`Duplicados inexistentes: ${missing.join(", ")}`);
  process.exit(1);
}
const foreign = dups.filter((d) => d.restaurantId !== canonical.restaurantId);
if (foreign.length > 0) {
  console.error(`Duplicados de OTRO restaurante (abortando): ${foreign.map((d) => d.id).join(", ")}`);
  process.exit(1);
}

// Aliases nuevos: nombre + aliases de cada duplicado, sin repetir (case-insens)
// y sin duplicar el nombre del canónico.
const known = new Set([canonical.name.toLowerCase(), ...canonical.aliases.map((a) => a.toLowerCase())]);
const newAliases = [];
for (const d of dups) {
  for (const candidate of [d.name, ...d.aliases]) {
    if (!known.has(candidate.toLowerCase())) {
      known.add(candidate.toLowerCase());
      newAliases.push(candidate);
    }
  }
}

const ingCounts = await Promise.all(
  dups.map((d) => prisma.recipeIngredient.count({ where: { productId: d.id } })),
);

console.log(`\nCanónico: "${canonical.name}" (${canonical.id}) estado=${canonical.estado}`);
for (let i = 0; i < dups.length; i++) {
  console.log(`  ← "${dups[i].name}" (${dups[i].id}) — ${ingCounts[i]} ingrediente(s) a re-enlazar`);
}
console.log(`Aliases a agregar al canónico: ${JSON.stringify(newAliases)}`);

if (!apply) {
  console.log("\nDRY-RUN: no se escribió nada. Agregá --apply para ejecutar (solo con OK de Andy).");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  for (const d of dups) {
    await tx.recipeIngredient.updateMany({
      where: { productId: d.id },
      data: { productId: canonical.id },
    });
    await tx.product.update({
      where: { id: d.id },
      data: { estado: "archivado" },
    });
  }
  await tx.product.update({
    where: { id: canonical.id },
    data: { aliases: [...canonical.aliases, ...newAliases] },
  });
});

console.log("\nHECHO: ingredientes re-enlazados, duplicados archivados, aliases sumados.");
await prisma.$disconnect();
```

- [ ] **Step 2: Probar el dry-run contra la base de DEV (solo lectura, sin --apply)**

Con la `DATABASE_URL` de DEV (la de `apps/api/.env.local`, ep-summer-heart — NUNCA la de prod en este paso):

Run (Git Bash): `DATABASE_URL="<url de apps/api/.env.local>" node scripts/products-merge.mjs --canonical x --dups y`
Expected: `Canónico x no existe.` y exit 1 (valida que el script conecta y los guards funcionan). Si DEV tiene productos reales, probar con dos ids reales y verificar que el dry-run imprime el plan y dice "DRY-RUN: no se escribió nada".

- [ ] **Step 3: Commit**

```bash
git add scripts/products-merge.mjs
git commit -m "chore(productos): script de merge de duplicados con dry-run (limpieza ricciola)"
```

---

### Task 4: Verificación final + checkpoint con Andy (BLOQUEANTE)

- [ ] **Step 1: Suite completa + typechecks**

Run: `pnpm --filter api exec vitest run` → todo verde (157).
Run: `cd apps/api && npx tsc --noEmit` → exit 0.
Run: `cd apps/mobile && npx tsc --noEmit` → solo el TS5101 preexistente.
Run: `cd packages/shared && npx tsc --noEmit` → exit 0 (no se tocó, sanity).

- [ ] **Step 2: Bundle mobile compila**

Run: `cd apps/mobile && npx expo export --platform android`
Expected: termina con "android bundles (1)". Después: borrar `dist/`.

- [ ] **Step 3: Dry-run de la limpieza ricciola contra PROD (solo lectura) y presentárselo a Andy**

Los 5 ids reales (prefijos): canónico a decidir; duplicados `cmqbfy72…`, `cmqbggsq…`, `cmqbggss…`, `cmqfhgis…`, `cmqfhgit…` (ids completos: buscarlos con una consulta read-only `product.findMany({ where: { name: { contains: "icciola", mode: "insensitive" } } })` como la del diagnóstico).

Correr el script SIN `--apply` con la URL de prod (es solo lectura) y mostrarle a Andy el plan impreso.

**DECISIÓN DE ANDY (bloqueante, no asumir):**
1. ¿Una sola "Ricciola" canónica, o dos productos ("Ricciola" fresca y "Ricciola frollata")? Los 2 archivados (`cmqbggsq…`, `cmqfhgit…`) probablemente se unen igual.
2. ¿Qué nombre limpio quiere para el/los canónico(s)? (Hoy ninguno de los 5 tiene nombre limpio: habría que renombrar el elegido a "Ricciola" con un `patchProduct` desde la app o incluirlo a mano.)
3. Su OK explícito para correr `--apply` contra prod.

**Sin las 3 respuestas NO se corre `--apply`. Este plan termina acá; el apply es una acción manual supervisada.**

- [ ] **Step 4: Push de respaldo**

```bash
git push origin claude/lucid-haslett-9cf85d
```

---

## Self-review del plan (hecho)

- **Cobertura del pedido de Andy:** "que el sistema te pregunte si es el mismo del banco" → Task 1 (probable → ConfirmMatchSheet existente, cero UI nueva); "la ricciola se duplicó, ver qué pasó" → diagnóstico en el header con datos reales; "proponer solución" → Tasks 1-2 previenen, Tasks 3-4 limpian lo ya duplicado con Andy al mando.
- **Sin placeholders:** todo el código está completo en los steps (matching.ts reescrito desde `EXACT_DISTANCE`, test file entero, script entero, diff exacto de nueva.tsx).
- **Consistencia de tipos:** `tokenizeForMatch` exportada y usada en tests vía import de `../matching`; `MatchCandidate`/`MatchResult`/`MatchLevel` sin cambios de contrato → shared/i18n/mobile intactos (el flujo probable ya existe). `levelRank` usa `MatchLevel` existente.
- **Números verificados:** umbral 0.6 validado contra los 3 casos reales (0.67 pregunta, 1.0 pregunta, 0.5 no molesta); suite esperada 141+16=157.
- **Riesgos señalados:** Step 5 de Task 1 avisa que fixtures viejos pueden esperar `none` donde ahora hay `probable` (lección conocida del repo); el script de merge archiva (no borra) y exige mismo restaurante.
