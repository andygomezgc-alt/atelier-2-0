import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn() }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));

import { InvoiceHeaderSheet } from "@/src/components/invoices/InvoiceHeaderSheet";

let sheet: ReactTestRenderer;
const input = (label: string) => sheet.root.findAllByType("TextInput" as never).find((n) => n.props.accessibilityLabel === label)!;
const chip = (label: string) => sheet.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === label)!;
const saveButton = () => sheet.root.findAllByType("Button" as never).find((n) => n.props.label === "invoice_header_save")!;
const save = async () => {
  await act(async () => { await saveButton().props.onPress(); });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.save.mockResolvedValue(undefined);
  await act(async () => {
    sheet = create(createElement(InvoiceHeaderSheet, {
      open: true,
      invoice: { supplier: { id: "s1", name: "Recchioni" }, number: "77", issuedOn: "2026-10-10" },
      suppliers: [{ id: "s1", name: "Recchioni" }, { id: "s2", name: "Garden Fruit" }],
      onSave: h.save,
      onClose: h.close,
    }));
  });
});
afterEach(async () => { await act(async () => { sheet.unmount(); }); });

describe("InvoiceHeaderSheet", () => {
  it("starts from what was read and sends only what changed", async () => {
    expect(input("invoice_number_label").props.value).toBe("77");
    expect(input("invoice_date_label").props.value).toBe("10/10/2026");
    await act(async () => { chip("Garden Fruit").props.onPress(); input("invoice_number_label").props.onChangeText("78"); });
    await save();
    expect(h.save).toHaveBeenCalledWith({ supplierId: "s2", number: "78" });
    expect(h.close).toHaveBeenCalled();
  });

  it("a supplier not in the list is typed by name", async () => {
    await act(async () => { chip("invoice_header_supplier_new").props.onPress(); });
    await act(async () => { input("invoice_header_supplier_placeholder").props.onChangeText("Pescheria Adriatica"); });
    await save();
    expect(h.save).toHaveBeenCalledWith({ supplierName: "Pescheria Adriatica" });
  });

  it("a day that does not exist is shown as an error and nothing is sent", async () => {
    await act(async () => { input("invoice_date_label").props.onChangeText("31/02/2026"); });
    await save();
    expect(h.save).not.toHaveBeenCalled();
    expect(sheet.root.findAllByType("Text" as never).map((n) => n.children.join(""))).toContain("invoice_header_date_invalid");
  });

  it("a failed save keeps the sheet open", async () => {
    h.save.mockRejectedValue(new Error("offline"));
    await act(async () => { input("invoice_number_label").props.onChangeText("79"); });
    await save();
    expect(h.close).not.toHaveBeenCalled();
  });

  it("keeps the inputs and Save inside a scroll view that lets taps through, so Save stays reachable with the keyboard open", () => {
    const scroll = sheet.root.findByType("ScrollView" as never);
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scroll.findAllByType("TextInput" as never).length).toBe(2);
    expect(scroll.findAllByType("Button" as never)).toContain(saveButton());
  });
});
