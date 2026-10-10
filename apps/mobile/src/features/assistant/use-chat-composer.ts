// Composer of the assistant (A12): the text being written and voice dictation into it.
import { useState } from "react";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { useSpeechInput } from "@/src/hooks/useSpeechInput";
import { tapLight } from "@/src/lib/haptics";
import { SPEECH_LANG } from "./chat-helpers";

export function useChatComposer(langPref: "es" | "it" | "en") {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  // Dictation writes the recognized text into the input live.
  const { listening, start, stop } = useSpeechInput({
    lang: SPEECH_LANG[langPref] ?? "es-ES",
    onText: setInput,
    onError: (code) =>
      showToast(t(code === "permission" ? "error_mic_permission" : "error_mic_unavailable"), "error"),
  });

  function toggleMic(blocked: boolean) {
    if (blocked) return;
    if (listening) {
      stop();
      return;
    }
    tapLight();
    start(input);
  }

  return { input, setInput, listening, toggleMic };
}
