import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { ToastHost } from "@/src/components/Toast";
import { colors } from "@/src/theme";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "loading") return;
    const sub = segments as readonly string[];
    const inAuthGroup = sub[0] === "(auth)";
    const inTabs = sub[0] === "(tabs)";

    if (state.status === "signed-out" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (state.status === "needs-restaurant" && sub[1] !== "choose-flow" && sub[1] !== "create-restaurant" && sub[1] !== "join-with-code") {
      router.replace("/(auth)/choose-flow");
    } else if (state.status === "signed-in" && inAuthGroup) {
      router.replace("/(tabs)/inicio");
    }
  }, [state, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.paper} />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthGate>
      <ToastHost />
    </SafeAreaProvider>
  );
}
