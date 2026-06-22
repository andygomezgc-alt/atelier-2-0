# Asistente: dictado por voz + pulido visual del chat

Fecha: 2026-06-23 · Rama: claude/lucid-haslett-9cf85d · Aprobado por Andy (mockups).

## Objetivo
Dos mejoras al Asistente (pantalla `apps/mobile/app/(tabs)/asistente.tsx`):
1. **Dictado por voz** — botón de micrófono en el composer; el chef habla y se transcribe al input.
2. **Pulido visual fino** del chat (afinar el estilo "cuaderno editorial" existente, no rehacerlo).

Fuera de alcance: sugerencias rápidas (descartado por Andy), cambios de backend.

## 1 · Dictado por voz

**Enfoque elegido:** reconocimiento **en el dispositivo** (gratis, sin API, en el idioma del usuario, transcripción en vivo). Paquete: `expo-speech-recognition` (config plugin Expo, soporta new arch). Descarta enviar audio a una API (costo + latencia + backend).

- Idioma = `languagePref` del usuario → `it-IT` / `es-ES` / `en-US`.
- Permiso de micrófono + reconocimiento: pedir on-demand al primer uso; si se niega, toast claro.
- UI: botón circular a la izquierda del input (borde terracota, ícono `mic-outline`). Al grabar: estado activo (relleno terracota + ícono stop/pulso). Toca para empezar, toca para parar.
- Resultados parciales (interim) se van escribiendo en el `input` en vivo; al terminar queda el texto final, editable antes de enviar.
- Hook `src/hooks/useSpeechInput.ts` que encapsula start/stop, estado `listening`, texto parcial, permiso y errores. `asistente.tsx` lo usa para el botón.
- Errores (sin permiso, no disponible, sin habla) → toast con string i18n, nunca crash.

**Riesgo:** compatibilidad del paquete con Expo SDK 56 / RN 0.85. Mitigación: verificar `npx expo export --platform android` antes de dar por hecho; si rompe, reportar y dejar solo el pulido.

## 2 · Pulido visual del chat (faithful al mockup aprobado)
En `asistente.tsx` (+ `MarkdownText` si hace falta):
- **Más aire** entre mensajes (gap del contenedor de mensajes ↑).
- **Mejor ritmo de lectura** en la respuesta del Atelier (line-height ↑ leve).
- **Separador de día** ("hoy" / "ayer" / fecha) como chip discreto al tope de la conversación (ListFooterComponent de la FlatList invertida; etiqueta derivada de la fecha del mensaje más viejo).
- Hora discreta bajo la burbuja del chef: ya existe (`userTime`); se mantiene.
- Barra de escribir con el micrófono integrado (ver punto 1).

## i18n (es/it/en)
Nuevas claves: `chat_mic_start`, `chat_mic_listening`, `chat_placeholder_voice` ("Escribí o dictá…"), `error_mic_permission`, `error_mic_unavailable`, day labels `day_today`/`day_yesterday`.

## Verificación
- `tsc --noEmit` en mobile · vitest mobile (59) + i18n (paridad de claves) verdes.
- `npx expo export --platform android` sin romper (con el módulo nativo nuevo).
- Cambios commiteados, listos para la **próxima horneada** (no la que está en cola). No deploy de backend (no hay).
