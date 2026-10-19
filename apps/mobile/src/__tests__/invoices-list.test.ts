import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceListResponse, InvoiceSummary } from "@atelier/shared";

const h = vi.hoisted(() => ({ list: vi.fn(), push: vi.fn(), polling: null as boolean | null }));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", RefreshControl: "RefreshControl", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useRouter: () => ({ push: h.push, back: vi.fn() }), useFocusEffect: (fn: () => void) => useEffect(fn, [fn]) };
});
vi.mock("@/src/hooks/useI18n", () => ({
  useI18n: () => ({ lang: "es", t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
  dateLocale: () => "es-ES",
}));
vi.mock("@/src/hooks/usePolling", () => ({ usePolling: (active: boolean) => { h.polling = active; } }));
vi.mock("@/src/api/invoices", () => ({ listInvoices: h.list }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/components/Empty", () => ({ Empty: "Empty" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/StatusBadge", () => ({ StatusBadge: "StatusBadge" }));
vi.mock("@/src/components/SkeletonList", () => ({ SkeletonList: "SkeletonList" }));
vi.mock("@/src/lib/refresh", () => ({ forceRefresh: (_prefixes: unknown, reload: () => Promise<unknown>) => reload() }));

import InvoicesScreen from "../../app/facturas/index";

const summary = (over: Partial<InvoiceSummary>): InvoiceSummary => ({
  id: "i1", status: "review", number: "77", issuedOn: "2026-10-10", grossTotalCents: 2288, netTotalCents: 2200,
  failureReason: null, createdAt: "2026-10-11T08:00:00.000Z", ...over,
});
const response = (over: Partial<InvoiceListResponse> = {}): InvoiceListResponse => ({
  toReview: 1,
  suppliers: [
    { supplier: { id: "s1", name: "Recchioni" }, invoices: [summary({})] },
    { supplier: null, invoices: [summary({ id: "i2", status: "reading", number: null, issuedOn: null, grossTotalCents: null })] },
  ],
  ...over,
});

let screen: ReactTestRenderer;
const texts = () => screen.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const byLabel = (type: string, label: string) => screen.root.findAllByType(type as never).find((n) => n.props.label === label);
async function render() { await act(async () => { screen = create(createElement(InvoicesScreen)); }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.polling = null;
  h.list.mockResolvedValue(response());
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("invoice list", () => {
  it("groups by supplier with day, number, total and status", async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(["Recchioni", "10/10/2026", "77", "22,88 €", "invoices_no_supplier", "11/10/2026", "invoices_no_number"]));
    expect(screen.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toEqual(["invoice_status_review", "invoice_status_reading"]);
  });

  it("counts the invoices waiting for review, and hides the band when none", async () => {
    await render();
    expect(texts()).toContain('invoices_to_review:{"count":1}');
    await act(async () => { screen.unmount(); });
    h.list.mockResolvedValue(response({ toReview: 0 }));
    await render();
    expect(texts().some((s) => s.startsWith("invoices_to_review"))).toBe(false);
  });

  it("refreshes by itself only while an invoice is being read", async () => {
    await render();
    expect(h.polling).toBe(true);
    await act(async () => { screen.unmount(); });
    h.list.mockResolvedValue(response({ suppliers: [{ supplier: null, invoices: [summary({ status: "applied" })] }] }));
    await render();
    expect(h.polling).toBe(false);
  });

  it("opens the scanner and each invoice", async () => {
    await render();
    await act(async () => { byLabel("Button", "invoices_scan")?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas/escanear");
    const row = screen.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "Recchioni 77");
    await act(async () => { row?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas/i1");
  });

  it("shows ghost rows instead of a spinner until the first answer", async () => {
    let answer!: (value: InvoiceListResponse) => void;
    h.list.mockReturnValueOnce(new Promise<InvoiceListResponse>((resolve) => { answer = resolve; }));
    await render();
    expect(screen.root.findAllByType("SkeletonList" as never)).toHaveLength(1);
    expect(screen.root.findAllByType("ActivityIndicator" as never)).toHaveLength(0);
    await act(async () => { answer(response()); });
    expect(screen.root.findAllByType("SkeletonList" as never)).toHaveLength(0);
    expect(texts()).toContain("Recchioni");
  });

  it("pulling the list down reloads it", async () => {
    await render();
    h.list.mockResolvedValue(response({ suppliers: [{ supplier: { id: "s2", name: "Marr" }, invoices: [summary({ id: "i3" })] }] }));
    const control = screen.root.findByType("ScrollView" as never).props.refreshControl;
    expect(control.props.refreshing).toBe(false);
    await act(async () => { await control.props.onRefresh(); });
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(texts()).toContain("Marr");
  });

  it("pulling down also reloads an empty list or one that failed to load", async () => {
    const pull = () => screen.root.findByType("ScrollView" as never).props.refreshControl.props.onRefresh();
    h.list.mockResolvedValue(response({ toReview: 0, suppliers: [] }));
    await render();
    expect(screen.root.findAllByType("Empty" as never)).toHaveLength(1);
    h.list.mockResolvedValue(response());
    await act(async () => { await pull(); });
    expect(texts()).toContain("Recchioni");
    await act(async () => { screen.unmount(); });
    h.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response());
    await render();
    expect(screen.root.findAllByType("NetworkError" as never)).toHaveLength(1);
    await act(async () => { await pull(); });
    expect(texts()).toContain("Recchioni");
  });

  it("offers scanning when empty, and retry when offline", async () => {
    h.list.mockResolvedValue(response({ toReview: 0, suppliers: [] }));
    await render();
    expect(screen.root.findByType("Empty" as never).props.actionLabel).toBe("invoices_scan");
    await act(async () => { screen.unmount(); });
    h.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response());
    await render();
    await act(async () => { screen.root.findByType("NetworkError" as never).props.onRetry(); });
    expect(texts()).toContain("Recchioni");
  });
});
