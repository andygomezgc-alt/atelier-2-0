import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
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
import { ToastHost } from "@/src/components/Toast";
import { LazyRestaurantHost } from "@/src/components/LazyRestaurantHost";
import { colors } from "@/src/theme";

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
    if (state.status === "signed-out" && !inAuthGroup) {
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
