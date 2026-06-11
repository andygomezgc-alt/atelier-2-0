// Punto de entrada "/" — el build standalone abre la app en atelier:///
// (Expo Go entra por su propio launcher y nunca pisa esta ruta, por eso
// el hueco no se notaba en dev). Sin este archivo: "Unmatched Route".
import { Redirect } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";

export default function Index() {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "signed-out") return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)/inicio" />;
}
