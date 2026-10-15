import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({ source: vi.fn() }));
vi.mock("react-native", () => ({
  Image: "Image", ScrollView: "ScrollView", Text: "Text", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/api/invoices", () => ({ invoicePageSource: h.source }));

import { InvoiceOriginalSheet } from "@/src/components/invoices/InvoiceOriginalSheet";

let sheet: ReactTestRenderer;
const element = (invoiceId: string) => createElement(InvoiceOriginalSheet, { open: true, invoiceId, pages: 1, onClose: vi.fn() });
const images = () => sheet.root.findAllByType("Image" as never);
const texts = () => sheet.root.findAllByType("Text" as never).map((n) => n.children.join(""));

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
});
afterEach(async () => { await act(async () => { sheet.unmount(); }); });

describe("InvoiceOriginalSheet", () => {
  it("says so when the pages cannot be loaded, instead of an empty sheet", async () => {
    h.source.mockRejectedValue(new Error("offline"));
    await act(async () => { sheet = create(element("inv1")); });
    expect(texts()).toContain("invoice_original_failed");
    expect(images()).toHaveLength(0);
  });

  it("never shows another invoice's pages while the new ones load", async () => {
    h.source.mockResolvedValueOnce({ uri: "https://api/invoices/invA/pages/0", headers: {} });
    await act(async () => { sheet = create(element("invA")); });
    expect(images()).toHaveLength(1);
    h.source.mockReturnValue(new Promise(() => undefined));
    await act(async () => { sheet.update(element("invB")); });
    expect(images()).toHaveLength(0);
  });
});
