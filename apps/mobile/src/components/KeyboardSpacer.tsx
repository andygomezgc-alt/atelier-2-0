import { useEffect, useRef, useState } from "react";
import { Dimensions, View } from "react-native";
import { useKeyboardHeight } from "@/src/lib/keyboard";

// Espaciador auto-adaptativo para pantallas cuyo contenido NO llega al fondo de
// la ventana (p.ej. tabs con tab bar debajo). Al abrir el teclado se mide a sí
// mismo y crece exactamente lo necesario para empujar el contenido por encima:
//   height = max(0, teclado − lo que ya queda debajo del contenido).
// Descuenta solo (tab bar / gestos) midiéndose — sin números mágicos.
export function KeyboardSpacer() {
  const kb = useKeyboardHeight();
  const ref = useRef<View>(null);
  const heightRef = useRef(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (kb === 0) {
      heightRef.current = 0;
      setHeight(0);
      return;
    }
    ref.current?.measureInWindow((_x, y) => {
      const windowH = Dimensions.get("window").height;
      // y = tope del spacer con su altura ACTUAL ya aplicada.
      const below = windowH - y; // debajo del TOPE del spacer
      const belowContent = below - heightRef.current; // debajo del contenido real
      const next = Math.max(0, kb - belowContent);
      heightRef.current = next;
      setHeight(next);
    });
  }, [kb]);

  return <View ref={ref} style={{ height }} />;
}
