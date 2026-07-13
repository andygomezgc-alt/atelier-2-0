import { useCallback, useRef, useState } from "react";

// Dictado por voz en el dispositivo (gratis, sin API). El reconocimiento corre
// nativo; acá envolvemos start/stop, el estado `listening` y los errores en una
// API simple. `onText` recibe el texto acumulado (base escrita + lo dictado)
// para que la pantalla lo vuelque en el input en vivo.
//
// El módulo es NATIVO: existe en el APK/standalone pero NO dentro de Expo Go.
// Import estático = crash al cargar el bundle en Expo Go ("Cannot find native
// module 'ExpoSpeechRecognition'"). Por eso require guardado: si no está,
// `speechAvailable` queda false y la pantalla esconde el micrófono.
type SpeechModule = typeof import("expo-speech-recognition");
let speech: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require("expo-speech-recognition") as SpeechModule;
} catch {
  speech = null;
}

export const speechAvailable = speech !== null;

// La elección real/no-op es constante durante todo el runtime (se decide al
// cargar el módulo), así que el orden de hooks no varía entre renders.
const useSpeechEvent: SpeechModule["useSpeechRecognitionEvent"] = speech
  ? speech.useSpeechRecognitionEvent
  : () => {};

export type SpeechErrorCode = "permission" | "unavailable" | "generic";

type Params = {
  lang: string; // BCP-47, ej. "it-IT" / "es-ES"
  onText: (text: string) => void;
  onError?: (code: SpeechErrorCode) => void;
};

export function useSpeechInput({ lang, onText, onError }: Params) {
  const [listening, setListening] = useState(false);
  // Texto que ya había en el input cuando se tocó el micrófono: lo dictado se
  // agrega después de esto, sin pisarlo.
  const baseRef = useRef("");

  useSpeechEvent("result", (e) => {
    const transcript = e.results[0]?.transcript ?? "";
    const base = baseRef.current;
    onText(base ? `${base} ${transcript}` : transcript);
  });

  useSpeechEvent("end", () => setListening(false));

  useSpeechEvent("error", (e) => {
    setListening(false);
    const code = e.error;
    // Benignos: el usuario no habló o canceló — no es un error para mostrar.
    if (code === "aborted" || code === "no-speech") return;
    if (code === "not-allowed" || code === "service-not-allowed") {
      onError?.("permission");
      return;
    }
    onError?.("unavailable");
  });

  const start = useCallback(
    async (base: string) => {
      if (listening) return;
      if (!speech) {
        onError?.("unavailable");
        return;
      }
      try {
        const perm = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          onError?.("permission");
          return;
        }
        if (!speech.ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          onError?.("unavailable");
          return;
        }
        baseRef.current = base.trim();
        setListening(true);
        speech.ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
        });
      } catch {
        setListening(false);
        onError?.("generic");
      }
    },
    [lang, listening, onError],
  );

  const stop = useCallback(() => {
    speech?.ExpoSpeechRecognitionModule.stop();
  }, []);

  return { listening, start, stop };
}
