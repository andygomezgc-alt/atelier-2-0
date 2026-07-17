// Punto de entrada "/" — el build standalone abre la app en atelier:///
// (Expo Go entra por su propio launcher y nunca pisa esta ruta, por eso
// el hueco no se notaba en dev). Sin este archivo: "Unmatched Route".
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/hooks/useAuth";
import { NetworkError } from "@/src/components/NetworkError";
import { useI18n } from "@/src/hooks/useI18n";
import { colors } from "@/src/theme";

export default function Index() {
  const { state, retryBootstrap } = useAuth();
  const { t } = useI18n();

  // P1-4 — antes esto era `if (loading) return null`: hasta 30 s de pantalla en
  // blanco mientras fetchMe corría contra su timeout. Ahora un spinner.
  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.terracota} />
      </View>
    );
  }

  // P1-4 — el bootstrap falló por red (no por sesión inválida): pantalla mínima
  // "sin conexión" con reintento que relanza el bootstrap, sin destruir la sesión.
  if (state.status === "offline") {
    return (
      <View style={styles.fill}>
        <NetworkError
          sub={t("error_offline_generic_sub")}
          onRetry={() => {
            void retryBootstrap();
          }}
        />
      </View>
    );
  }

  if (state.status === "signed-out") return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)/inicio" />;
}

const styles = {
  center: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.paper,
  },
  fill: { flex: 1, backgroundColor: colors.paper },
};
