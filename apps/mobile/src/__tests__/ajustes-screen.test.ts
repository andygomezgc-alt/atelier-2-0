// Bank settings: the "last recalc" line tells how long ago the criticality job ran, in the
// shared relative wording (no "hace 1 días" at one day, since the copy has no plurals).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { t as translate, type TranslationKey } from "@atelier/i18n";

const h = vi.hoisted(() => ({ recalc: vi.fn(), migration: vi.fn() }));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Alert: { alert: vi.fn() }, Pressable: "Pressable", ScrollView: "ScrollView",
  Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Toast", () => ({ showToast: vi.fn() }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error" }));
const i18n = vi.hoisted(() => ({ t: null as unknown }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => i18n }));
vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: () => ({ state: { status: "signed-in", user: { role: "admin", restaurantId: "r1" } } }),
}));
vi.mock("@/src/api/products", () => ({
  getRecalcStatus: h.recalc, getMigrationStatus: h.migration, migrateLegacyRecipes: vi.fn(),
}));

import AjustesBancoScreen from "../../app/productos/ajustes";

i18n.t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, "es", vars);
const now = new Date("2026-10-20T12:00:00Z").getTime();
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
let screen: ReactTestRenderer;
const texts = () => screen.root.findAllByType("Text" as never).map((n) => n.children.join(""));
async function renderWithLastRun(lastRunAt: string) {
  h.recalc.mockResolvedValue({ lastRunAt });
  await act(async () => { screen = create(createElement(AjustesBancoScreen)); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  h.migration.mockResolvedValue({ pendingCount: 0 });
});
afterEach(async () => {
  vi.useRealTimers();
  if (screen) await act(async () => { screen.unmount(); });
});

describe("last criticality recalc", () => {
  it("reads one day and one week without a count", async () => {
    await renderWithLastRun(hoursAgo(30));
    expect(texts()).toContain("Último recalc: hace un día");
    await act(async () => { screen.unmount(); });
    await renderWithLastRun(hoursAgo(9 * 24));
    expect(texts()).toContain("Último recalc: hace una semana");
  });

  it("keeps the counted wording for hours and several days", async () => {
    await renderWithLastRun(hoursAgo(2));
    expect(texts()).toContain("Último recalc: hace 2 h");
    await act(async () => { screen.unmount(); });
    await renderWithLastRun(hoursAgo(3 * 24));
    expect(texts()).toContain("Último recalc: hace 3 días");
  });
});
