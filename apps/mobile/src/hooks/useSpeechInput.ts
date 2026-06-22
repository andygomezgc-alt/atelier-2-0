import { useCallback, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

// Dictado por voz en el dispositivo (gratis, sin API). El reconocimiento corre
// nativo; acá envolvemos start/stop, el estado `listening` y los errores en una
// API simple. `onText` recibe el texto acumulado (base escrita + lo dictado)
// para que la pantalla lo vuelque en el input en vivo.

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

  useSpeechRecognitionEvent("result", (e) => {
    const transcript = e.results[0]?.transcript ?? "";
    const base = baseRef.current;
    onText(base ? `${base} ${transcript}` : transcript);
  });

  useSpeechRecognitionEvent("end", () => setListening(false));

  useSpeechRecognitionEvent("error", (e) => {
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
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          onError?.("permission");
          return;
        }
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          onError?.("unavailable");
          return;
        }
        baseRef.current = base.trim();
        setListening(true);
        ExpoSpeechRecognitionModule.start({
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
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { listening, start, stop };
}
