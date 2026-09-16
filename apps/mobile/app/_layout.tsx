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
import { nextRoute } from "@/src/lib/auth-route";
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

    // La regla vive en `nextRoute` (probada en src/lib/__tests__/auth-route.test.ts):
    // sin sesión → login; sin restaurante → crear o unirse con código, sin entrar
    // a las pestañas; con restaurante → Inicio al salir del onboarding.
    const destino = nextRoute(state.status, sub);
    if (destino) router.replace(destino as Parameters<typeof router.replace>[0]);
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
        <StatusBar style="dark" />
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
      <StatusBar style="dark" />
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
