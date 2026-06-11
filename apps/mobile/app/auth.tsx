// Alias del deep link del magic link: atelier://auth?token=...&email=...
// El host "auth" del URL se vuelve el primer segmento de ruta, y el grupo
// (auth) no consume segmentos — sin este alias el correo caía en Unmatched.
import { Redirect, useLocalSearchParams } from "expo-router";

export default function AuthDeepLink() {
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>();
  return <Redirect href={{ pathname: "/(auth)/verify", params: { token, email } }} />;
}
