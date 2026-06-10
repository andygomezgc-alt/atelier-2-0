# Asistente — restyle visual con animaciones (cuaderno editorial)

**Fecha:** 2026-06-10 · **Decisor:** Andy (chef, validación visual solo en Expo Go)
**Decisiones tomadas con maquetas en vivo** (visual companion, sesión `.superpowers/brainstorm/1715-1781110205`).

## Objetivo

Mejorar la pantalla del Asistente (`apps/mobile/app/(tabs)/asistente.tsx`) a nivel
visual: dirección "cuaderno editorial", animaciones con vida, texto enriquecido,
hápticas discretas. **Cero cambios de comportamiento.**

## Decisiones cerradas (elegidas por Andy entre opciones en vivo)

| Decisión | Elección |
|---|---|
| Dirección visual de mensajes | **B — Cuaderno editorial**: asistente SIN tarjeta, escribe directo sobre el papel; eyebrow + regla terracota (28×2px, radius) entre etiqueta y cuerpo; burbuja teal del usuario queda igual; más aire entre turnos (gap de lista spacing.md → spacing.lg como punto de partida; ajuste fino en el checkpoint) |
| Entrada de mensajes | **B — Con más vida**: spring ~380ms, fade + rise 14px + scale desde 0.97, curva con mini rebote (`cubic-bezier(0.34,1.56,0.64,1)` como referencia) |
| Botón enviar | **C — Despega + late**: al enviar, la flecha vuela (sube y desaparece, entra una nueva desde abajo, ~550ms); durante el streaming el botón late despacio (pulso suave) |
| Hápticas | **A — Discretas**: impacto light al enviar; selection (más suave) cuando llega el primer delta de la respuesta. Fallo silencioso si no hay vibrador |
| Construcción | **A — Piezas separadas**: componentes propios con tests; la pantalla solo los consume |

## Piezas a construir

1. **`src/lib/markdown.ts`** — parser markdown ligero propio (sin dependencia externa):
   títulos (`#`/`##`), negrita (`**`), cursiva (`*`), listas (`-`/`1.`). NO tablas, NO código.
   **Tolerante a streaming**: entrada parcial (negrita sin cerrar, lista a medias) nunca
   lanza error; renderiza el texto plano de lo incompleto. Tests de casos parciales.
2. **`src/components/MarkdownText.tsx`** — renderiza tokens del parser con el tema:
   títulos en serif italic teal (como `assistantTitle` actual), cuerpo serif, viñetas;
   integra `highlightQuantities` existente (cantidades/temperaturas en terracota bold)
   sobre los nodos de texto. Reemplaza a `HighlightedText` + lógica `isTitle` en la pantalla.
3. **`src/components/TypingDots.tsx`** — 3 puntos escalonados (reanimated v4: withRepeat/
   withSequence/withDelay; 320ms por fase, delays 0/150/300ms; opacity 0.35→1, translateY -3).
   Reemplaza el texto estático `chat_thinking •••` (A-05).
4. **Entrada animada de mensajes** — reanimated `entering` custom spring en cada item
   NUEVO de la FlatList. **Gate obligatorio:** al cargar historial (initial render de la
   conversación) NO se anima; solo mensajes appendeados en vivo. Mantener `Bubble` memoizada (A-03).
5. **`src/components/SendButton.tsx`** — flecha despega al enviar + pulso (anillo animado
   con scale/opacity — en RN no hay box-shadow animable) mientras `streaming=true`.
   Estado disabled visual igual a hoy (opacity 0.4).
6. **`src/lib/haptics.ts`** — wrappers `expo-haptics` (instalar con `expo install`):
   `tapLight()` al enviar, `selection()` al primer delta. Catch silencioso.
7. **Restyle en `asistente.tsx`** — estilos cuaderno editorial (sacar `assistantBubble`
   de tarjeta; sumar regla terracota; espaciado entre turnos +); cablear piezas 2-6.
8. **`src/theme`** — tokens de motion mínimos (duraciones/spring config) si C-01 no los cubre ya.

## Fuera de alcance (anti-inflado — frenar si aparece)

Comportamiento del chat (envío, streaming, guardar receta, historial, modelos, scroll),
header de la pantalla, navegación, paleta/tipografías del tema, micrófono, sonidos,
cambios de API o de datos.

## Casos borde

- Markdown incompleto durante streaming → render plano, sin crash.
- Conversación vieja al abrirse → historial SIN animación de entrada.
- Mensajes muy largos → mismo render, sin recortes nuevos.
- Sin vibrador (emulador/web) → hápticas en silencio.
- `hooks-order.test.ts` (detector anti-regresión) debe seguir verde.

## Testing y validación

- Unit: parser markdown (completo + parciales de streaming), componentes (render básico).
- Suite completa del monorepo en verde (hoy: 348).
- **Validación visual final: SOLO checkpoint de Andy en Expo Go** (regla del proyecto:
  no se aprueba lo visual por descripción).

## Referencia

Existe trabajo previo descartado (working tree del repo principal, 2026-06-10 01:42,
sin commitear): TypingDots/MarkdownText/haptics similares. Andy pidió rehacer de cero
mejorándolo; sirve solo como referencia de dirección, no se copia.
