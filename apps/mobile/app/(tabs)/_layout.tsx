// Phase 0 tab bar. Real screens land in 0.8; for now each tab renders
// a placeholder that validates routing + the i18n binding for tab labels.

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fontSizes, fonts } from "@/src/theme";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  inicio: "create-outline",
  asistente: "chatbubble-outline",
  recetas: "book-outline",
  menus: "list-outline",
  casa: "home-outline",
};

export default function TabsLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={({ route }) => {
        const iconName = ICONS[route.name] ?? "ellipse-outline";
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.terracota,
          tabBarInactiveTintColor: colors.mute,
          tabBarStyle: {
            backgroundColor: colors.paper,
            borderTopWidth: 0.5,
            borderTopColor: colors.edge,
            height: 58,
            paddingTop: 6,
            paddingBottom: 6,
          },
          tabBarLabelStyle: {
            fontFamily: fonts.sans,
            fontSize: fontSizes.caption,
            fontWeight: "500",
            marginTop: 0,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={iconName} size={size ?? 22} color={color} />
          ),
        };
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: t("tab_inicio") }} />
      <Tabs.Screen name="asistente" options={{ title: t("tab_asistente") }} />
      <Tabs.Screen name="recetas" options={{ title: t("tab_recetas") }} />
      <Tabs.Screen name="menus" options={{ title: t("tab_menus") }} />
      <Tabs.Screen name="casa" options={{ title: t("tab_casa") }} />
    </Tabs>
  );
}
