import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ restaurantId: "r1" as string | null, role: "viewer" }));
vi.mock("react-native", () => ({ Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default } }));
vi.mock("expo-router", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  const Tabs = ({ children, ...props }: { children: ReactNode }) => createElement("Tabs", props, children);
  const Screen = (props: { name: string; options: Record<string, unknown> }) => createElement("TabScreen", props);
  return { Tabs: Object.assign(Tabs, { Screen }) };
});
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: () => ({ state: { status: h.restaurantId ? "signed-in" : "needs-restaurant", user: { role: h.role, restaurantId: h.restaurantId } } }),
}));

import TabsLayout from "../../app/(tabs)/_layout";
let screen: ReactTestRenderer;
afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
});

describe("assistant tab permission in layout", () => {
  it.each([
    ["viewer", "r1", null],
    ["viewer", null, undefined],
    ["sous_chef", "r1", undefined],
  ])("sets the assistant href for %s in restaurant %s", async (role, restaurantId, href) => {
    h.role = role!;
    h.restaurantId = restaurantId ?? null;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => { screen = create(createElement(TabsLayout)); });
    expect(screen.root.findByProps({ name: "asistente" }).props.options.href).toBe(href);
  });
});

describe("tab bar icons", () => {
  type IconProps = { focused: boolean; color: string; size: number };
  type Options = { tabBarIcon: (props: IconProps) => { props: { name: string } } };
  async function iconName(route: string, focused: boolean) {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => { screen = create(createElement(TabsLayout)); });
    const screenOptions = screen.root.findByType("Tabs" as never).props.screenOptions as (args: { route: { name: string } }) => Options;
    return screenOptions({ route: { name: route } }).tabBarIcon({ focused, color: "ink", size: 22 }).props.name;
  }

  it.each([
    ["inicio", "create"],
    ["asistente", "chatbubble"],
    ["recetas", "book"],
    ["menus", "list"],
    ["casa", "home"],
  ])("fills the %s icon while its tab is active and outlines it otherwise", async (route, base) => {
    expect(await iconName(route, true)).toBe(base);
    await act(async () => { screen.unmount(); });
    expect(await iconName(route, false)).toBe(`${base}-outline`);
  });
});
