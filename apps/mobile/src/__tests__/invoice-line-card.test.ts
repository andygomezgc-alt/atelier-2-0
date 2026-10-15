import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { InvoiceLineView } from "@atelier/shared";

const h = vi.hoisted(() => ({ patch: vi.fn(), choose: vi.fn() }));
vi.mock("react-native", () => ({
  Text: "Text", View: "View", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }) }));
for (const name of ["Button", "ChoiceSheet", "ConfirmMatchSheet", "EditableCell", "PickVariantSheet", "StatusBadge"]) {
  vi.doMock(`@/src/components/${name}`, () => ({ [name]: name }));
}
vi.mock("@/src/components/invoices/ProductPickerSheet", () => ({ ProductPickerSheet: "ProductPickerSheet" }));

const { InvoiceLineCard } = await import("@/src/components/invoices/InvoiceLineCard");

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 4, description: "Zucchine romanesche", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 },
  siblings: [], quantityLooksMisread: false, ...over,
});

let card: ReactTestRenderer;
const texts = () => card.root.findAllByType("Text" as never).map((n) => n.children.join(""));
const node = (type: string) => card.root.findByType(type as never);
const button = (label: string) => card.root.findAllByType("Button" as never).find((n) => n.props.label === label);
async function render(l: InvoiceLineView, readOnly = false) {
  await act(async () => { card = create(createElement(InvoiceLineCard, { line: l, readOnly, onPatch: h.patch, onChooseProduct: h.choose })); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(async () => { if (card) await act(async () => { card.unmount(); }); });

describe("InvoiceLineCard", () => {
  it("shows the paper text, the product and the price before → after", async () => {
    await render(line());
    expect(texts()).toEqual(expect.arrayContaining(["Zucchine romanesche", "Zucchine", "1,50 € → 1,80 € (+20 %)"]));
    expect(texts().join(" ")).toContain('invoice_line_tax:{"rate":4}');
  });

  it("a big change waits for a tick that updates the price", async () => {
    await render(line({ action: null }));
    await act(async () => { button('invoice_line_confirm_big_change:{"pct":20}')?.props.onPress(); });
    expect(h.patch).toHaveBeenCalledWith({ action: "update_price" });
  });

  it("a probable match is confirmed, or another product is chosen", async () => {
    await render(line({ action: null, matchLevel: "probable" }));
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    expect(node("ConfirmMatchSheet").props.open).toBe(true);
    await act(async () => { node("ConfirmMatchSheet").props.onYes(); });
    expect(h.choose).toHaveBeenCalledWith("p1");
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    await act(async () => { node("ConfirmMatchSheet").props.onNo(); });
    expect(node("ProductPickerSheet").props.open).toBe(true);
  });

  it("an ambiguous line picks a variant, or creates a product when none fits", async () => {
    const siblings = [{ productId: "p7", name: "Calamari 3P" }, { productId: "p8", name: "Calamari 5P" }];
    await render(line({ action: null, matchLevel: "ambiguo", product: null, siblings: siblings as never }));
    await act(async () => { button("invoice_line_choose")?.props.onPress(); });
    expect(node("PickVariantSheet").props.candidates).toEqual(siblings);
    await act(async () => { node("PickVariantSheet").props.onPick("p8"); });
    expect(h.choose).toHaveBeenCalledWith("p8");
    await act(async () => { node("PickVariantSheet").props.onNone(); });
    expect(h.patch).toHaveBeenCalledWith({ action: "create_draft" });
  });

  it("Change offers every decision, and choosing another product opens the picker", async () => {
    await render(line());
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    const sheet = node("ChoiceSheet");
    expect(sheet.props.options.map((o: { value: string }) => o.value)).toEqual(["update_price", "connect", "pick", "create_draft", "ignore"]);
    await act(async () => { sheet.props.onSelect("ignore"); });
    expect(h.patch).toHaveBeenCalledWith({ action: "ignore" });
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    await act(async () => { node("ChoiceSheet").props.onSelect("pick"); });
    await act(async () => { node("ProductPickerSheet").props.onPick("p3"); });
    expect(h.choose).toHaveBeenCalledWith("p3");
  });

  it("a new product line offers no price update for a product it does not have", async () => {
    await render(line({ action: "create_draft", product: null, matchLevel: "none" }));
    await act(async () => { button("invoice_line_change")?.props.onPress(); });
    expect(node("ChoiceSheet").props.options.map((o: { value: string }) => o.value)).toEqual(["pick", "create_draft", "ignore"]);
    expect(texts()).toContain("invoice_line_new_product");
  });

  it("editing the price keeps the line's decision", async () => {
    await render(line({ action: "create_draft", product: null }));
    await act(async () => { await node("EditableCell").props.onSave(2500); });
    expect(h.patch).toHaveBeenCalledWith({ action: "create_draft", priceCents: 2500 });
  });

  it("a misread quantity is flagged", async () => {
    await render(line({ quantityLooksMisread: true }));
    expect(card.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toContain("invoice_warning_quantity");
  });

  it("an applied update line shows the price it set, not a comparison with today", async () => {
    await render(line({ product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 180, taxRatePct: 4 } }), true);
    expect(texts()).toContain("1,80 €");
    expect(texts().some((x) => x.includes("→"))).toBe(false);
  });

  it("an applied connect or ignore line shows no price at all", async () => {
    for (const action of ["connect", "ignore"] as const) {
      await render(line({ action }), true);
      expect(texts()).not.toContain("1,80 €");
      expect(texts().some((x) => x.includes("→"))).toBe(false);
      await act(async () => { card.unmount(); });
    }
  });

  it("in review only a price update and an undecided line show the arrow", async () => {
    await render(line({ action: "connect" }));
    expect(texts().some((x) => x.includes("→"))).toBe(false);
    await act(async () => { card.unmount(); });
    await render(line({ action: "update_price" }));
    expect(texts().some((x) => x.includes("→"))).toBe(true);
    await act(async () => { card.unmount(); });
    await render(line({ action: null }));
    expect(texts().some((x) => x.includes("→"))).toBe(true);
  });

  it("an applied invoice only shows what was done", async () => {
    await render(line(), true);
    expect(card.root.findAllByType("Button" as never)).toHaveLength(0);
    expect(card.root.findAllByType("EditableCell" as never)).toHaveLength(0);
    expect(card.root.findAllByType("StatusBadge" as never).map((n) => n.props.label)).toContain("invoice_done_update_price");
  });
});
