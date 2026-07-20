// "Tu estilo" fiel — sanitizado defensivo del theme que emite el modelo. Es
// defensa en profundidad: render.ts ya bloquea toda la red y le apaga JS a la
// página, pero igual limpiamos el HTML/CSS antes de renderizar (un theme corrupto
// o adversarial nunca debe inyectar scripts, cargar recursos externos ni romper
// el <style> del documento).

import type { MenuCustomTheme } from "@atelier/shared";

// Tags que no tienen ningún sentido dentro de un fragmento de menú y sí son
// vectores (ejecución, carga externa, breakout del <head>).
const FORBIDDEN_TAGS = "script|iframe|object|embed|link|meta|style|base";

/**
 * Limpia el CSS libre del theme.
 * - `<` → throw: previene cerrar el <style> del documento (`</style><script>`).
 * - `@import` / `expression(` → throw: cargas externas / IE-legacy JS en CSS.
 * - `url(...)` cuyo valor no empiece por `data:` se elimina (webfont/imagen
 *   remota bloqueada por render.ts igual, pero la sacamos de raíz).
 */
export function sanitizeCss(css: string): string {
  if (css.includes("<"))
    throw new Error("CSS del theme contiene '<' (posible breakout de <style>)");
  if (/@import/i.test(css)) throw new Error("CSS del theme contiene @import");
  if (/expression\s*\(/i.test(css))
    throw new Error("CSS del theme contiene expression(");

  // url( 'valor' ) | url("valor") | url(valor) — conserva solo data:.
  return css.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (match, _q, value) => {
    return /^\s*data:/i.test(value) ? match : "";
  });
}

/**
 * Limpia un fragmento HTML del theme (header/section/dish/frame/footer).
 * Conserva clases y `style=` inline (el theme necesita estilarse) pero elimina:
 * - tags peligrosos (script/iframe/object/embed/link/meta/style/base),
 * - handlers `on*=` (onclick, onload, …),
 * - `href`/`src` con `javascript:` o apuntando a http(s)/protocol-relative.
 */
export function sanitizeFragment(html: string): string {
  let out = html;

  // 1. script/style con su contenido (el contenido también es peligroso).
  out = out.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  // 2. Cualquier tag prohibido restante (apertura/cierre/void), sin contenido.
  out = out.replace(new RegExp(`</?(?:${FORBIDDEN_TAGS})\\b[^>]*>`, "gi"), "");
  // 3. Handlers on*= (comillas dobles, simples o sin comillas).
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 4. href/src peligrosos: javascript:, http(s):, //host. data: y relativos se
  //    conservan (relativos no resuelven nada — la interception aborta lo no-data).
  out = out.replace(
    /\s(href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, _attr, rawValue) => {
      const value = String(rawValue).replace(/^['"]|['"]$/g, "").trim();
      return /^(javascript:|https?:|\/\/)/i.test(value) ? "" : match;
    },
  );

  return out;
}

// Sanitiza TODOS los campos del theme (ya validado por Zod). sanitizeCss puede
// tirar (breakout) — se propaga y el caller descarta el theme.
export function sanitizeTheme(theme: MenuCustomTheme): MenuCustomTheme {
  return {
    ...theme,
    css: sanitizeCss(theme.css),
    frameHtml: theme.frameHtml == null ? null : sanitizeFragment(theme.frameHtml),
    headerHtml: sanitizeFragment(theme.headerHtml),
    sectionHeaderHtml: sanitizeFragment(theme.sectionHeaderHtml),
    dishHtml: sanitizeFragment(theme.dishHtml),
    footerHtml: theme.footerHtml == null ? null : sanitizeFragment(theme.footerHtml),
  };
}
