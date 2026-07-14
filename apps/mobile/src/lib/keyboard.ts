import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Altura del teclado en px de ventana (0 si está cerrado). En Android
// edge-to-edge (SDK 53+) la ventana NO se redimensiona, así que cada pantalla
// compensa con esto. En iOS el evento equivalente es keyboardWillShow.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);
  return height;
}
