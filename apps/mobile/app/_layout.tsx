import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  CrimsonPro_400Regular,
  CrimsonPro_400Regular_Italic,
  CrimsonPro_500Medium,
  CrimsonPro_500Medium_Italic,
} from "@expo-google-fonts/crimson-pro";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { ToastHost } from "@/src/components/Toast";
import { Button } from "@/src/components/Button";
import { LazyRestaurantHost } from "@/src/components/LazyRestaurantHost";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";
import { captureException, initSentry } from "@/src/lib/sentry";

initSentry();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "loading") return;
    const sub = segments as readonly string[];
    const inAuthGroup = sub[0] === "(auth)";

    // A-12: signed-out → login. needs-restaurant ya NO se redirige forzado a
    // choose-flow: el chef entra directo a las tabs y la app se autoexplica
    // con los subtítulos por sección. El alta del sitio se dispara al primer
    // intento de guardar algo (lazy create vía LazyRestaurantHost) o
    // explícitamente desde el lobby en Casa.
    // "auth" es el alias del deep link del magic link (app/auth.tsx): su
    // Redirect a verify corre en el mismo commit que este efecto; si acá
    // forzáramos login, pisaríamos esa navegación y el token se perdería.
    if (state.status === "signed-out" && !inAuthGroup && sub[0] !== "auth") {
      router.replace("/(auth)/login");
    } else if (state.status === "needs-restaurant" && inAuthGroup) {
      // A-12: el chef en needs-restaurant cae en INICIO, no en Casa.
      // Filosofía: la app se autoexplica con los subtítulos por sección y el
      // chef navega libre; el alta del sitio se dispara recién al guardar
      // (idea, receta, menú) o explícitamente desde el lobby de Casa.
      // Permitimos `join-with-code` y `create-restaurant` por si llegó por
      // ese deep-link.
      const allow = sub[1] === "join-with-code" || sub[1] === "create-restaurant";
      if (!allow) router.replace("/(tabs)/inicio");
    } else if (state.status === "signed-in" && inAuthGroup) {
      router.replace("/(tabs)/inicio");
    }
  }, [state, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  // Bloque 4 · C-02 — Crimson Pro (4 variantes) cargadas antes del primer
  // render. Sin estas fuentes, todos los `fontFamily: fonts.serif*` quedarían
  // en fallback sans-serif del sistema.
  const [fontsLoaded] = useFonts({
    CrimsonPro_400Regular,
    CrimsonPro_400Regular_Italic,
    CrimsonPro_500Medium,
    CrimsonPro_500Medium_Italic,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.paper} />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.paper,
          }}
        >
          <ActivityIndicator color={colors.terracota} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.paper} />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.paper },
            // Bloque 4 · C-01 — slide horizontal en push/pop. En iOS ya
            // ocurría nativo; en Android antes entraban instantáneas.
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthGate>
      <ToastHost />
      <LazyRestaurantHost />
    </SafeAreaProvider>
  );
}

// P2-17 — ErrorBoundary global (convención de Expo Router: exportar un
// `ErrorBoundary` desde el layout raíz lo instala para todo el árbol). Antes,
// cualquier excepción de render tumbaba la app a la pantalla roja nativa sin
// fallback ni salida. Ahora: pantalla traducida + reintento (retry re-monta la
// ruta que falló, del propio router). Sin dependencias nuevas.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  captureException(error);
  const { t } = useI18n();
  return (
    <SafeAreaProvider>
      {/* style="dark" basta acá; el backgroundColor lo aporta el View de fondo.
          (Los StatusBar de arriba lo pasan por convención del archivo.) */}
      <StatusBar style="dark" />
      <View style={boundaryStyles.root}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.terracota} />
        <Text style={boundaryStyles.title}>{t("error_boundary_title")}</Text>
        <Text style={boundaryStyles.sub}>{t("error_boundary_sub")}</Text>
        <Button
          label={t("error_retry")}
          variant="secondary"
          onPress={retry}
          style={boundaryStyles.btn}
        />
      </View>
    </SafeAreaProvider>
  );
}

const boundaryStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
  },
  btn: { marginTop: spacing.md, alignSelf: "center" },
});
