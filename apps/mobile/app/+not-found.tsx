// Red de seguridad: cualquier URL desconocida vuelve a la entrada en vez
// de mostrar "Unmatched Route" a un chef del pilot.
import { Redirect } from "expo-router";

export default function NotFound() {
  return <Redirect href="/" />;
}
