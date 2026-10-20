import { useCallback, useRef, useState } from "react";
import { speech, type SpeechModule } from "./speech-module";

// Dictado por voz en el dispositivo (gratis, sin API). El reconocimiento corre
// nativo; acá envolvemos start/stop, el estado `listening` y los errores en una
// API simple. `onText` recibe el texto acumulado (base escrita + lo dictado)
// para que la pantalla lo vuelque en el input en vivo.

export const speechAvailable = speech !== null;

// La elección real/no-op es constante durante todo el runtime (se decide al
// cargar el módulo), así que el orden de hooks no varía entre renders.
const useSpeechEvent: SpeechModule["useSpeechRecognitionEvent"] = speech
  ? speech.useSpeechRecognitionEvent
  : () => {};

export type SpeechErrorCode = "permission" | "unavailable" | "generic";

// The device runs one dictation at a time, so the last screen to start the
// microphone takes it over: the screen that was listening stops listening and
// writing. This releases whichever hook owns the current dictation.
let releaseOwner: (() => void) | null = null;

// What was typed before tapping the microphone stays first; the dictation goes after it.
export function mergeDictation(base: string, transcript: string): string {
  const head = base.trim();
  return head ? `${head} ${transcript}` : transcript;
}

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
  // Every mounted hook hears the same native events (Inicio and the assistant stay
  // mounted in their tabs), so each one only acts on the dictation it started.
  const ownsRef = useRef(false);

  useSpeechEvent("result", (e) => {
    if (!ownsRef.current) return;
    onText(mergeDictation(baseRef.current, e.results[0]?.transcript ?? ""));
  });

  // Native sends "end" after every session, an error included.
  useSpeechEvent("end", () => {
    if (!ownsRef.current) return;
    ownsRef.current = false;
    setListening(false);
  });

  // iOS sends no "end" after an error from its native start, so let go here too.
  useSpeechEvent("error", (e) => {
    if (!ownsRef.current) return;
    ownsRef.current = false;
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
        releaseOwner?.();
        releaseOwner = () => {
          ownsRef.current = false;
          setListening(false);
        };
        ownsRef.current = true;
        setListening(true);
        speech.ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
        });
      } catch {
        ownsRef.current = false;
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
