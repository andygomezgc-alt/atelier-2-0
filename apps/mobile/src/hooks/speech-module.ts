// The on-device speech module, or null where it is missing.
//
// The module is NATIVE: it exists in the APK/standalone build but NOT inside Expo Go.
// A static import crashes the bundle in Expo Go ("Cannot find native module
// 'ExpoSpeechRecognition'"), so it is loaded with a guarded require. When it is missing,
// `speechAvailable` is false and the screens hide the microphone.
export type SpeechModule = typeof import("expo-speech-recognition");

function loadSpeech(): SpeechModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition") as SpeechModule;
  } catch {
    return null;
  }
}

export const speech = loadSpeech();
