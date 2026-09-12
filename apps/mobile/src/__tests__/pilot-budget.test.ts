import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { t as translate, type TranslationKey } from "@atelier/i18n";
const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("react-native", () => ({ Text: "Text", View: "View", Platform: { OS: "android", select: (values: Record<string, unknown>) => values.android ?? values.default } }));
vi.mock("@/src/api/client", () => ({ apiFetch: h.fetch }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, "es", vars) }) }));
import { PilotBudget } from "../components/PilotBudget";
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
  it("discards a late owner response after an account change", async () => {
    let resolve!: (value: unknown) => void;
    h.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ budget: null });
    await act(async () => { screen = create(createElement(PilotBudget, { open: true, userId: "owner" })); });
    await act(async () => { screen.update(createElement(PilotBudget, { open: true, userId: "chef" })); });
    await act(async () => { resolve({ budget }); });
    expect(screen.toJSON()).toBeNull();
  });
});
