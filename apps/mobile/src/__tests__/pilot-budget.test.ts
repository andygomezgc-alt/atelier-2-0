import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { t as translate, type TranslationKey } from "@atelier/i18n";
const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("react-native", () => ({ Text: "Text", View: "View", Platform: { OS: "android", select: (values: Record<string, unknown>) => values.android ?? values.default } }));
vi.mock("@/src/api/client", () => ({ apiFetch: h.fetch }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, "es", vars) }) }));
import { PilotBudget } from "../components/PilotBudget";
import { colors } from "../theme";
let screen: ReactTestRenderer;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; vi.resetAllMocks(); });
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });
const budget = { limit: 50, used: 36, reserved: 2, warning: false, blocked: false, endsAt: null };
describe("owner pilot budget", () => {
  it("does not fetch while the profile is closed or render data for ordinary chefs", async () => {
    await act(async () => { screen = create(createElement(PilotBudget, { open: false, userId: "chef" })); });
    expect(h.fetch).not.toHaveBeenCalled(); expect(screen.toJSON()).toBeNull();
    h.fetch.mockResolvedValue({ budget: null });
    await act(async () => { screen.update(createElement(PilotBudget, { open: true, userId: "chef" })); });
    expect(screen.toJSON()).toBeNull();
  });
  it("shows a textual warning including pending spend at 75 percent", async () => {
    h.fetch.mockResolvedValue({ budget });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    expect(JSON.stringify(screen.toJSON())).toContain("Se ha utilizado el 75 %");
    expect(JSON.stringify(screen.toJSON())).toContain("38.00 € de 50.00 €");
  });
  it("draws a thin bar of the spend, pending included, and says what is left", async () => {
    h.fetch.mockResolvedValue({ budget: { ...budget, used: 8, reserved: 2 } });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    const bar = screen.root.findByProps({ accessibilityRole: "progressbar" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 20 });
    expect(bar.props.accessibilityLabel).toBe("IA del piloto");
    const fill = bar.findByProps({ testID: "ai-budget-fill" });
    expect(fill.props.style).toMatchObject({ width: "20%", backgroundColor: colors.teal });
    expect(JSON.stringify(screen.toJSON())).toContain("Saldo disponible: 40.00 €");
  });

  it("turns the bar amber from 75 percent and dark terracota once paused, never past full", async () => {
    h.fetch.mockResolvedValue({ budget });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    expect(screen.root.findByProps({ testID: "ai-budget-fill" }).props.style).toMatchObject({ width: "76%", backgroundColor: colors.amber });
    await act(async () => { screen.unmount(); });
    h.fetch.mockResolvedValue({ budget: { ...budget, used: 51, blocked: true } });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    expect(screen.root.findByProps({ testID: "ai-budget-fill" }).props.style).toMatchObject({ width: "100%", backgroundColor: colors.danger });
    expect(JSON.stringify(screen.toJSON())).toContain("Saldo disponible: 0.00 €");
  });

  it("discards a late owner response after an account change", async () => {
    let resolve!: (value: unknown) => void;
    h.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ budget: null });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    await act(async () => { screen.update(createElement(PilotBudget, { open: true, userId: "chef" })); });
    await act(async () => { resolve({ budget }); });
    expect(screen.toJSON()).toBeNull();
  });
});
