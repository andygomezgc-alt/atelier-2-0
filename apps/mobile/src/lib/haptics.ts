// apps/mobile/src/lib/haptics.ts
// Wrappers finos sobre expo-haptics. Fallo SILENCIOSO: emuladores y web no
// tienen vibrador y un feedback jamás debe tirar la app.

import * as Haptics from "expo-haptics";

// Al enviar un mensaje.
export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Cuando llega el primer delta de la respuesta (más suave que un impacto).
export function selection() {
  Haptics.selectionAsync().catch(() => {});
}
