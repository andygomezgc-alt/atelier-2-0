import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useSession } from "@/src/hooks/useSession";
import { ToastHost } from "@/src/components/Toast";
import { colors } from "@/src/theme";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "loading") return;
    const inAuthGroup = segments[0] === "(auth)";

    if (state.status === "signed-out" && !inAuthGroup) {
      router.replace("/(auth)/login");
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
