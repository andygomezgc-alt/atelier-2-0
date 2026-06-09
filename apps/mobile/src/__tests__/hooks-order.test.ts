// A-12 — Regresión: "Rendered more hooks than during the previous render"
// en Casa al volver del lazy-create.
//
// Causa raíz (post-mortem): un `useCallback` quedó declarado DESPUÉS del
// early return del lobby (`if (needsRestaurant) return <lobby/>`). Cuando el
// state pasaba de needs-restaurant a signed-in, React veía un hook más en
// el segundo render que en el primero y tiraba la pantalla roja.
//
// Test estático: lee los archivos de pantalla y verifica la Rule of Hooks
// en el TOP-LEVEL del cuerpo del componente (depth 1 desde la apertura del
// `export default function …`). Ignora cualquier `if/return/useX` que esté
// dentro de funciones nested (handlers como `async function handleX()`),
// que no rompen la regla.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

const SCREENS = [
  "app/(tabs)/casa.tsx",
  "app/(tabs)/inicio.tsx",
  "app/(tabs)/asistente.tsx",
  "app/(tabs)/recetas.tsx",
  "app/(tabs)/menus.tsx",
];

const HOOK_RE =
  /^\s*(const|let)\s+[\w{}\[\],\s:]+\s*=\s*(useCallback|useMemo|useEffect|useState|useRef|useReducer|useContext|useSyncExternalStore|useImperativeHandle|useLayoutEffect|useFocusEffect)\b/;

function findHooksAfterEarlyReturn(
  source: string,
  file: string,
): string[] {
  const lines = source.split(/\r?\n/);
  const violations: string[] = [];

  let inComponent = false;
  // depthAtLineStart === 0 → afuera del componente
  // depthAtLineStart === 1 → top-level del cuerpo del componente
  // depthAtLineStart >= 2 → dentro de función nested / JSX / etc.
  let depthAtLineStart = 0;
  let firstTopLevelEarlyReturnLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (!inComponent) {
      if (/^export\s+default\s+function\s+\w+/.test(line)) {
        inComponent = true;
        // En esta misma línea se abre el `{` del cuerpo. Lo procesamos abajo.
      } else {
        continue;
      }
    }

    // depthAtLineStart ya está calculado; ahora detectamos sin actualizar
    // todavía.
    if (depthAtLineStart === 1) {
      // Early return del top-level: `if (...) {` con un `return` adentro,
      // o `if (...) return ...` en una línea.
      const trimmed = line.trim();
      if (
        firstTopLevelEarlyReturnLine < 0 &&
        /^if\s*\(.+\)\s*\{?\s*$/.test(trimmed) &&
        trimmed.endsWith("{")
      ) {
        // Mirar adelante 1-30 líneas hasta el `}` correspondiente.
        let inner = 1;
        for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
          const t = lines[j].trim();
          for (const ch of t) {
            if (ch === "{") inner++;
            else if (ch === "}") inner--;
          }
          if (t.startsWith("return")) {
            firstTopLevelEarlyReturnLine = lineNo;
            break;
          }
          if (inner === 0) break;
        }
      }
      if (
        firstTopLevelEarlyReturnLine < 0 &&
        /^if\s*\(.+\)\s+return\b/.test(trimmed)
      ) {
        firstTopLevelEarlyReturnLine = lineNo;
      }

      // Hook al top-level del componente.
      if (
        firstTopLevelEarlyReturnLine > 0 &&
        lineNo > firstTopLevelEarlyReturnLine &&
        HOOK_RE.test(line)
      ) {
        violations.push(
          `${file}:${lineNo} — hook en top-level del componente DESPUÉS del early return (línea ${firstTopLevelEarlyReturnLine}): ${line.trim()}`,
        );
      }
    }

    // Actualizar depth para la PRÓXIMA línea, comentarios/strings ignorados
    // a propósito (heurística simple, suficiente para nuestros archivos).
    let depthDelta = 0;
    let inString: '"' | "'" | "`" | null = null;
    let inLineComment = false;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      const prev = k > 0 ? line[k - 1] : "";
      if (inLineComment) break;
      if (inString) {
        if (ch === inString && prev !== "\\") inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch as '"' | "'" | "`";
        continue;
      }
      if (ch === "/" && line[k + 1] === "/") {
        inLineComment = true;
        break;
      }
      if (ch === "{") depthDelta++;
      else if (ch === "}") depthDelta--;
    }
    depthAtLineStart += depthDelta;
    if (depthAtLineStart < 0) depthAtLineStart = 0;
    if (depthAtLineStart === 0) {
      // Salimos del componente — no debería seguir habiendo más líneas
      // del cuerpo; salimos del análisis.
      inComponent = false;
    }
  }

  return violations;
}

describe("A-12 Rule of Hooks — no hooks after early return", () => {
  for (const screen of SCREENS) {
    it(`${screen} cumple la Rule of Hooks en el top-level del componente`, () => {
      const source = readFileSync(join(ROOT, screen), "utf-8");
      const violations = findHooksAfterEarlyReturn(source, screen);
      if (violations.length > 0) {
        console.error("Violaciones:\n" + violations.join("\n"));
      }
      expect(violations).toEqual([]);
    });
  }
});

// Test de sanidad — verifica que el detector ATRAPA la regresión original.
// Si alguien refactoriza el detector y rompe su capacidad de detectar el
// bug, este test falla.
describe("hooks-order detector — captura la regresión de A-12", () => {
  it("detecta useCallback declarado debajo de un early return top-level", () => {
    const code = `import { useCallback, useState } from "react";

export default function Demo() {
  const [n, setN] = useState(0);
  const needs = n === 0;

  if (needs) {
    return null;
  }

  const cb = useCallback(() => setN(0), []);
  return cb;
}
`;
    const v = findHooksAfterEarlyReturn(code, "synthetic.tsx");
    expect(v.length).toBe(1);
    expect(v[0]).toContain("useCallback");
  });

  it("NO marca el patrón corregido (hook ANTES del early return)", () => {
    const code = `import { useCallback, useState } from "react";

export default function Demo() {
  const [n, setN] = useState(0);
  const cb = useCallback(() => setN(0), []);
  const needs = n === 0;

  if (needs) {
    return null;
  }

  return cb;
}
`;
    expect(findHooksAfterEarlyReturn(code, "synthetic.tsx")).toEqual([]);
  });

  it("NO marca if-return dentro de funciones nested (handlers)", () => {
    const code = `import { useCallback, useState } from "react";

export default function Demo() {
  const [n, setN] = useState(0);

  async function handleDelete() {
    if (!n) return;
    setN(0);
  }

  const cb = useCallback(() => setN(0), []);
  return cb;
}
`;
    expect(findHooksAfterEarlyReturn(code, "synthetic.tsx")).toEqual([]);
  });
});
