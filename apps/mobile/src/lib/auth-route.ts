// A dónde mandar al chef según su estado de sesión y la pantalla actual.
//
// Vive fuera del componente para poder probarlo: esta regla ya cambió una vez sin
// que se notara (A-12 dejó entrar a las pestañas sin restaurante, y el chef caía
// en Inicio, que responde 403 y lo pinta como "Sin conexión").
export type AuthRouteStatus = "loading" | "signed-out" | "needs-restaurant" | "signed-in" | "offline";

const ONBOARDING = ["choose-flow", "create-restaurant", "join-with-code"];

export function nextRoute(status: AuthRouteStatus, segments: readonly string[]): string | null {
  if (status === "loading") return null;
  // "auth" es el alias del deep link del magic link: su propio Redirect corre en
  // este mismo commit; redirigir aquí pisaría esa navegación y perdería el token.
  if (segments[0] === "auth") return null;

  const inAuthGroup = segments[0] === "(auth)";
  const enOnboarding = inAuthGroup && ONBOARDING.includes(segments[1] ?? "");

  if (status === "signed-out") return inAuthGroup ? null : "/(auth)/login";
  // Sin restaurante no se entra: primero crear uno o unirse con código.
  if (status === "needs-restaurant") return enOnboarding ? null : "/(auth)/choose-flow";
  if (status === "signed-in" && inAuthGroup) return "/(tabs)/inicio";
  return null;
}
