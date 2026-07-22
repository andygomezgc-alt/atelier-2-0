// Genera los tipos de rutas de expo-router (.expo/types/router.d.ts) SIN
// levantar el dev server. expo-router SDK 56 solo regenera estos tipos desde
// `expo start` (Metro) — no hay comando CLI offline (`expo export` tampoco los
// escribe). Esto vuelve el typecheck NO reproducible: en un clon limpio o en CI
// no existe .expo/types (gitignoreado) y las rutas tipadas (Href) caen a
// `string` (laxo); en la máquina de quien corrió `expo start`, son estrictas.
//
// Este script llama a la MISMA función que usa @expo/cli internamente
// (`regenerateDeclarations` de @expo/router-server/build/typed-routes), que
// según su propio comentario "puede correr sin Metro ni server". Así el
// `pnpm typecheck` regenera los tipos primero y valida las rutas de forma
// determinística en cualquier entorno.
//
// EXPO_ROUTER_APP_ROOT lo lee el módulo al cargar (arma el require.context del
// dir app/), por eso se setea ANTES del require. regenerateDeclarations está
// debounced ~1s; el setTimeout interno mantiene vivo el proceso hasta escribir.
const path = require("node:path");
const fs = require("node:fs");

const appRoot = path.resolve(__dirname, "..", "app");
process.env.EXPO_ROUTER_APP_ROOT = appRoot;

const outputDir = path.resolve(__dirname, "..", ".expo", "types");
fs.mkdirSync(outputDir, { recursive: true });

// @expo/router-server es dependencia transitiva (no directa de mobile), así que
// lo resolvemos desde el contexto de expo-router — igual que hace @expo/cli.
const expoRouterDir = path.dirname(require.resolve("expo-router/package.json"));
const typedRoutesPath = require.resolve(
  "@expo/router-server/build/typed-routes",
  { paths: [expoRouterDir] },
);
const { regenerateDeclarations } = require(typedRoutesPath);
regenerateDeclarations(outputDir);
