import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  cameraPermission: vi.fn(), galleryPermission: vi.fn(), camera: vi.fn(), gallery: vi.fn(), document: vi.fn(),
  prepare: vi.fn(), send: vi.fn(), replace: vi.fn(), back: vi.fn(), toast: vi.fn(),
}));

vi.mock("react-native", () => ({
  Image: "Image", Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: h.replace, back: h.back }) }));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: h.cameraPermission, requestMediaLibraryPermissionsAsync: h.galleryPermission,
  launchCameraAsync: h.camera, launchImageLibraryAsync: h.gallery,
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: h.document }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }) }));
vi.mock("@/src/lib/invoice-image", () => {
  class InvoiceFileTooLargeError extends Error {}
  return { prepareInvoiceFile: h.prepare, InvoiceFileTooLargeError };
});
vi.mock("@/src/lib/invoice-upload", () => ({
  sendInvoices: h.send,
  invoiceBatches: (photos: unknown[], pdfs: unknown[]) => [...(photos.length ? [photos] : []), ...pdfs.map((p) => [p])],
}));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "error_network" }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));

import { InvoiceFileTooLargeError } from "@/src/lib/invoice-image";
import ScanInvoiceScreen from "../../app/facturas/escanear";

let screen: ReactTestRenderer;
const button = (label: string) => screen.root.findAllByType("Button" as never).find((n) => n.props.label === label);
const press = async (label: string) => { await act(async () => { await button(label)?.props.onPress(); }); };
const pages = () => screen.root.findAllByType("Image" as never).map((n) => n.props.source.uri);
async function render() { await act(async () => { screen = create(createElement(ScanInvoiceScreen)); }); }
let shot = 0;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  shot = 0;
  h.cameraPermission.mockResolvedValue({ granted: true });
  h.galleryPermission.mockResolvedValue({ granted: true });
  h.camera.mockImplementation(async () => ({ canceled: false, assets: [{ uri: `file:///raw${++shot}.jpg`, mimeType: "image/jpeg", width: 4000, height: 3000 }] }));
  h.prepare.mockImplementation(async (file: { uri: string; mimeType?: string }) => ({
    uri: file.uri.replace("raw", "ready"), mimeType: file.mimeType === "application/pdf" ? "application/pdf" : "image/jpeg",
  }));
  h.send.mockResolvedValue({ ids: ["inv1"], failed: [], error: null });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("scanner", () => {
  it("several photos are the pages of one invoice, which opens when sent", async () => {
    await render();
    await press("invoice_scan_camera");
    await press("invoice_scan_add_page");
    expect(pages()).toEqual(["file:///ready1.jpg", "file:///ready2.jpg"]);
    await press("invoice_scan_done");
    expect(h.send).toHaveBeenCalledWith([[{ uri: "file:///ready1.jpg", mimeType: "image/jpeg" }, { uri: "file:///ready2.jpg", mimeType: "image/jpeg" }]]);
    expect(h.replace).toHaveBeenCalledWith("/facturas/inv1");
  });

  it("each PDF is its own invoice, and several go back to the list", async () => {
    h.document.mockResolvedValue({ canceled: false, assets: [
      { uri: "file:///raw-a.pdf", mimeType: "application/pdf", name: "a.pdf", size: 1000 },
      { uri: "file:///raw-b.pdf", mimeType: "application/pdf", name: "b.pdf", size: 1000 },
    ] });
    h.send.mockResolvedValue({ ids: ["inv1", "inv2"], failed: [], error: null });
    await render();
    await press("invoice_scan_pdf");
    await press("invoice_scan_done");
    expect(h.send.mock.calls[0]![0]).toHaveLength(2);
    expect(h.back).toHaveBeenCalled();
  });

  it("without camera permission nothing is opened", async () => {
    h.cameraPermission.mockResolvedValue({ granted: false });
    await render();
    await press("invoice_scan_camera");
    expect(h.camera).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith("cargar_permiso_camara", "error");
  });

  it("a file that cannot fit is explained and not added", async () => {
    h.prepare.mockRejectedValueOnce(new InvoiceFileTooLargeError());
    await render();
    await press("invoice_scan_camera");
    expect(pages()).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("invoice_file_too_large", "error");
  });

  it("never more than 10 pages", async () => {
    h.gallery.mockResolvedValue({ canceled: false, assets: Array.from({ length: 11 }, (_, i) => ({ uri: `file:///raw-g${i}.jpg`, mimeType: "image/jpeg" })) });
    await render();
    await press("invoice_scan_gallery");
    expect(pages()).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("invoice_scan_too_many_pages", "error");
  });

  it("keeps what was not sent so the chef can send it again", async () => {
    h.send.mockResolvedValue({ ids: [], failed: [[{ uri: "file:///ready1.jpg", mimeType: "image/jpeg" }]], error: new Error("offline") });
    await render();
    await press("invoice_scan_camera");
    await press("invoice_scan_done");
    expect(pages()).toEqual(["file:///ready1.jpg"]);
    expect(h.toast).toHaveBeenCalledWith("error_network", "error");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("a page can be removed before sending", async () => {
    await render();
    await press("invoice_scan_camera");
    const remove = screen.root.findAllByType("Pressable" as never).find((n) => n.props.accessibilityLabel === "invoice_scan_remove_page");
    await act(async () => { remove?.props.onPress(); });
    expect(pages()).toEqual([]);
    expect(button("invoice_scan_done")?.props.disabled).toBe(true);
  });
});
