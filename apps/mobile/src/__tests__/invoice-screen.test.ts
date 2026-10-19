import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceDetail, InvoiceLineView } from "@atelier/shared";

const h = vi.hoisted(() => ({
  get: vi.fn(), retry: vi.fn(), remove: vi.fn(), apply: vi.fn(), patchLine: vi.fn(), choose: vi.fn(), list: vi.fn(), patchHeader: vi.fn(),
  invalidate: vi.fn(), toast: vi.fn(), push: vi.fn(), back: vi.fn(), pdf: vi.fn(), polling: null as boolean | null,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useLocalSearchParams: () => ({ id: "inv1" }),
    useRouter: () => ({ push: h.push, back: h.back }),
    useFocusEffect: (fn: () => void) => useEffect(fn, [fn]),
  };
});
vi.mock("@/src/hooks/useI18n", () => ({
  useI18n: () => ({ lang: "es", t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
  dateLocale: () => "es-ES",
}));
vi.mock("@/src/hooks/usePolling", () => ({ usePolling: (active: boolean) => { h.polling = active; } }));
vi.mock("@/src/api/invoices", () => ({
  getInvoice: h.get, retryInvoice: h.retry, deleteInvoice: h.remove, applyInvoice: h.apply, patchInvoiceLine: h.patchLine,
  chooseProduct: h.choose, listInvoices: h.list, patchInvoiceHeader: h.patchHeader,
}));
vi.mock("@/src/api/cache", () => ({ invalidate: h.invalidate }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error_message" }));
vi.mock("@/src/lib/invoice-original", () => ({ openInvoicePdf: h.pdf }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
for (const name of ["Screen", "Button", "ConfirmSheet", "NetworkError", "StatusBadge"]) {
  vi.doMock(`@/src/components/${name}`, () => ({ [name]: name }));
}
for (const name of ["InvoiceLineCard", "InvoiceHeaderSheet", "InvoiceOriginalSheet"]) {
  vi.doMock(`@/src/components/invoices/${name}`, () => ({ [name]: name }));
}

const { default: InvoiceScreen } = await import("../../app/facturas/[id]");

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 0, description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 }, draft: null, siblings: [], quantityLooksMisread: false, ...over,
});
const invoice = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: "inv1", status: "review", number: "77", issuedOn: "2026-10-10", grossTotalCents: 2288, netTotalCents: 2200, failureReason: null,
  createdAt: "2026-10-11T08:00:00.000Z", supplier: { id: "s1", name: "Recchioni" }, taxTotalCents: 88,
  pages: [{ position: 0, mimeType: "image/jpeg" }], lines: [line()],
  checks: { totals: { status: "ok", sumCents: 2200, diffCents: 0 }, duplicateOf: null }, ...over,
});

let screen: ReactTestRenderer;
const texts = () => screen.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const button = (label: string) => screen.root.findAllByType("Button" as never).find((n) => n.props.label === label);
const press = async (label: string) => { await act(async () => { await button(label)?.props.onPress(); }); };
async function render() { await act(async () => { screen = create(createElement(InvoiceScreen)); }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.polling = null;
  h.get.mockResolvedValue(invoice());
  h.apply.mockResolvedValue({ updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("invoice screen", () => {
  it("while reading it says so and refreshes by itself", async () => {
    h.get.mockResolvedValue(invoice({ status: "reading", lines: [] }));
    await render();
    expect(texts()).toContain("invoice_reading_title");
    expect(h.polling).toBe(true);
  });

  it("a failed read gives its plain reason and can be retried", async () => {
    h.get.mockResolvedValue(invoice({ status: "failed", failureReason: "unreadable", lines: [] }));
    await render();
    expect(texts()).toContain("invoice_failure_unreadable");
    expect(h.polling).toBe(false);
    await press("invoice_retry");
    expect(h.retry).toHaveBeenCalledWith("inv1");
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("deleting asks first, then goes back", async () => {
    await render();
    await press("invoice_delete");
    const confirm = screen.root.findByType("ConfirmSheet" as never);
    expect(confirm.props.open).toBe(true);
    await act(async () => { await confirm.props.onConfirm(); });
    expect(h.remove).toHaveBeenCalledWith("inv1");
    expect(h.back).toHaveBeenCalled();
  });

  it("Apply waits until every line is decided and says how many are left", async () => {
    h.get.mockResolvedValue(invoice({ lines: [line(), line({ position: 1, action: null }), line({ position: 2, action: null })] }));
    await render();
    const apply = button('invoice_apply_undecided:{"count":2}');
    expect(apply?.props.disabled).toBe(true);
  });

  it("applying refreshes products and recipes and shows what was done", async () => {
    h.apply.mockResolvedValue({ updated: 1, drafts: 1, connected: 0, ignored: 0, skipped: [{ position: 0, reason: "newer_price" }] });
    await render();
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await press("invoice_apply");
    expect(h.apply).toHaveBeenCalledWith("inv1");
    expect(h.invalidate).toHaveBeenCalledWith("products:");
    expect(h.invalidate).toHaveBeenCalledWith("recipes:");
    expect(texts()).toEqual(expect.arrayContaining(['invoice_apply_done:{"updated":1,"drafts":1}', 'invoice_skipped_newer_price:{"line":"Zucchine"}']));
    // A server from before the price-rise count sends no field: no rise line.
    expect(texts().some((text) => text.startsWith("invoice_apply_price_rises"))).toBe(false);
  });

  it("after applying, says how many products rose and how many recipes they touch", async () => {
    h.apply.mockResolvedValue({ updated: 3, drafts: 0, connected: 0, ignored: 0, skipped: [], priceRises: 3, affectedRecipes: 8 });
    await render();
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await press("invoice_apply");
    expect(texts()).toContain('invoice_apply_price_rises:{"products":3,"recipes":8}');
  });

  it("an invoice where no price rose shows no rise line", async () => {
    h.apply.mockResolvedValue({ updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [], priceRises: 0, affectedRecipes: 0 });
    await render();
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await press("invoice_apply");
    expect(texts()).toContain('invoice_apply_done:{"updated":1,"drafts":0}');
    expect(texts().some((text) => text.startsWith("invoice_apply_price_rises"))).toBe(false);
  });

  it("a second press while applying sends nothing", async () => {
    let finish: (v: unknown) => void = () => undefined;
    h.apply.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render();
    const apply = button("invoice_apply")!;
    await act(async () => { void apply.props.onPress(); void apply.props.onPress(); });
    await act(async () => { finish({ updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] }); });
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it("an invoice applied from another phone says so", async () => {
    h.apply.mockResolvedValue({ alreadyApplied: true });
    await render();
    await press("invoice_apply");
    expect(texts()).toContain("invoice_apply_already");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("an applied invoice is read only", async () => {
    h.get.mockResolvedValue(invoice({ status: "applied" }));
    await render();
    expect(screen.root.findByType("InvoiceLineCard" as never).props.readOnly).toBe(true);
    expect(button("invoice_apply")).toBeUndefined();
    expect(button("invoice_edit_header")).toBeUndefined();
  });

  it("warns about totals that do not add up and about a duplicate, which opens", async () => {
    h.get.mockResolvedValue(invoice({ checks: { totals: { status: "mismatch", sumCents: 2000, diffCents: 200 }, duplicateOf: "inv0" } }));
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['invoice_warning_totals:{"sum":"20,00 €"}', "invoice_warning_duplicate"]));
    await press("invoice_warning_duplicate_open");
    expect(h.push).toHaveBeenCalledWith("/facturas/inv0");
  });

  it("a line decision is saved and the invoice reloaded; a refusal is explained", async () => {
    await render();
    const card = screen.root.findByType("InvoiceLineCard" as never);
    await act(async () => { await card.props.onChooseProduct("p9"); });
    expect(h.choose).toHaveBeenCalledWith("inv1", 0, "p9");
    expect(h.get).toHaveBeenCalledTimes(2);
    h.patchLine.mockRejectedValueOnce(new Error("409"));
    await act(async () => { await screen.root.findByType("InvoiceLineCard" as never).props.onPatch({ action: "ignore" }); });
    expect(h.toast).toHaveBeenCalledWith("error_message", "error");
  });

  it("a PDF original opens through the share sheet; photos open in the viewer", async () => {
    h.get.mockResolvedValue(invoice({ pages: [{ position: 0, mimeType: "application/pdf" }] }));
    await render();
    await press("invoice_view_original");
    expect(h.pdf).toHaveBeenCalledWith("inv1");
    await act(async () => { screen.unmount(); });
    h.get.mockResolvedValue(invoice());
    await render();
    await press("invoice_view_original");
    expect(screen.root.findByType("InvoiceOriginalSheet" as never).props).toMatchObject({ open: true, pages: 1 });
  });

  it("the header can be corrected with the known suppliers", async () => {
    h.list.mockResolvedValue({ toReview: 1, suppliers: [{ supplier: { id: "s2", name: "Garden Fruit" }, invoices: [] }, { supplier: null, invoices: [] }] });
    await render();
    await press("invoice_edit_header");
    const sheet = screen.root.findByType("InvoiceHeaderSheet" as never);
    expect(sheet.props.open).toBe(true);
    expect(sheet.props.suppliers).toEqual([{ id: "s2", name: "Garden Fruit" }]);
    await act(async () => { await sheet.props.onSave({ number: "78" }); });
    expect(h.patchHeader).toHaveBeenCalledWith("inv1", { number: "78" });
  });
});
