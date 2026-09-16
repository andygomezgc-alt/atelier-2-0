// Guardia de arranque en iOS.
//
// `await import("react-native")` y `import * as RN from "react-native"` copian
// TODAS las exportaciones del paquete. Al recorrerlas se evalúa el getter
// obsoleto `PushNotificationIOS`, que construye un NativeEventEmitter sin
// módulo nativo; React Native solo comprueba eso en iOS, así que la app se
// cerraba al abrirla en iPhone (builds 7, 8 y 9) y funcionaba en Android.
// Usar siempre imports nombrados: `import { Platform } from "react-native"`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const folders = ["src", "app"];
const prohibido = [
  { patron: /await\s+import\(\s*["']react-native["']\s*\)/, nombre: 'await import("react-native")' },
  { patron: /import\s*\(\s*["']react-native["']\s*\)/, nombre: 'import("react-native")' },
  { patron: /import\s+\*\s+as\s+\w+\s+from\s+["']react-native["']/, nombre: 'import * as … from "react-native"' },
  { patron: /require\(\s*["']react-native["']\s*\)/, nombre: 'require("react-native")' },
];

// Los comentarios pueden nombrar el patrón prohibido (como el de useAuth.ts).
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(entrada => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return entrada === "node_modules" ? [] : archivos(ruta);
    return /\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

describe("importaciones de react-native", () => {
  it("nadie importa el paquete entero ni de forma dinámica", () => {
    const encontrados = folders
      .flatMap(carpeta => archivos(join(root, carpeta)))
      .filter(ruta => !ruta.includes("__tests__"))
      .flatMap(ruta => {
        const codigo = sinComentarios(readFileSync(ruta, "utf8"));
        return prohibido.filter(p => p.patron.test(codigo)).map(p => `${relative(root, ruta)}: ${p.nombre}`);
      });
    expect(encontrados).toEqual([]);
  });
});
