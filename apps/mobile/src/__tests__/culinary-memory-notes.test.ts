// Actual memory sheet: the chef notes section, with network and native layers replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  getCulinaryMemory: vi.fn(), getChefNotes: vi.fn(), deleteChefNote: vi.fn(), toast: vi.fn(), onClose: vi.fn(),
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable", ScrollView: "ScrollView", Switch: "Switch", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/api/client", () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("@/src/api/culinary-memory", () => ({ getCulinaryMemory: h.getCulinaryMemory, patchCulinaryMemory: vi.fn(), clearCulinaryMemory: vi.fn() }));
vi.mock("@/src/api/chef-notes", () => ({ getChefNotes: h.getChefNotes, deleteChefNote: h.deleteChefNote }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: (e: Error) => `translated:${e.message}` }));

import { ApiError } from "@/src/api/client";
import { CulinaryMemorySheet } from "../components/CulinaryMemorySheet";
let screen: ReactTestRenderer;
const memory = {
  restaurantId: "restaurant-1", version: 1, enabled: true, identityLine: null, learned: [], corrections: [],
  excludedKeys: [], updatedAt: null, canEdit: true, learningAvailable: true,
};
const notes = [
  { id: "n1", text: "No usamos cerdo", createdAt: "2026-09-29T10:00:00.000Z" },
  { id: "n2", text: "Horno de leña", createdAt: "2026-09-29T10:01:00.000Z" },
];
const texts = () => screen.root.findAllByType("Text" as never).map((node) => [node.props.children].flat().join(""));
const deleteButtons = () => screen.root.findAllByProps({ accessibilityLabel: "notes_delete" });
const noteConfirm = () => screen.root.findAllByType("ConfirmSheet" as never).find((node) => node.props.confirmLabel === "notes_delete")!;
async function render() {
  await act(async () => { screen = create(createElement(CulinaryMemorySheet, { restaurantId: "restaurant-1", onClose: h.onClose })); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  h.getCulinaryMemory.mockResolvedValue(memory);
  h.getChefNotes.mockResolvedValue({ notes, canEdit: true });
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("chef notes in the memory sheet", () => {
  it("loads and lists the notes when the sheet opens", async () => {
    await render();
    expect(h.getChefNotes).toHaveBeenCalledOnce();
    expect(texts()).toEqual(expect.arrayContaining(["notes_title", "No usamos cerdo", "Horno de leña"]));
    expect(deleteButtons()).toHaveLength(2);
  });

  it("deletes a note after confirming it", async () => {
    h.deleteChefNote.mockResolvedValue({ ok: true });
    await render();
    expect(noteConfirm().props.open).toBe(false);
    await act(async () => { deleteButtons()[0]!.props.onPress(); });
    expect(noteConfirm().props.open).toBe(true);
    expect(noteConfirm().props.body).toBe("No usamos cerdo");
    await act(async () => { await noteConfirm().props.onConfirm(); });
    expect(h.deleteChefNote).toHaveBeenCalledWith("n1");
    expect(texts()).not.toContain("No usamos cerdo");
    expect(texts()).toContain("Horno de leña");
    expect(noteConfirm().props.open).toBe(false);
    expect(h.toast).toHaveBeenCalledWith("notes_deleted");
  });

  it("keeps the note and shows the error when deleting fails", async () => {
    h.deleteChefNote.mockRejectedValue(new Error("offline"));
    await render();
    await act(async () => { deleteButtons()[1]!.props.onPress(); });
    await act(async () => { await noteConfirm().props.onConfirm(); });
    expect(texts()).toContain("Horno de leña");
    expect(h.toast).toHaveBeenCalledWith("translated:offline");
  });

  it("drops a note that was already deleted elsewhere", async () => {
    h.deleteChefNote.mockRejectedValue(new ApiError(404, "Not found"));
    await render();
    await act(async () => { deleteButtons()[1]!.props.onPress(); });
    await act(async () => { await noteConfirm().props.onConfirm(); });
    expect(texts()).not.toContain("Horno de leña");
  });

  it("offers no delete action to readers and explains the empty state", async () => {
    h.getChefNotes.mockResolvedValue({ notes: [], canEdit: false });
    await render();
    expect(deleteButtons()).toHaveLength(0);
    expect(texts()).toContain("notes_none");
    h.getChefNotes.mockResolvedValue({ notes: [], canEdit: true });
    await act(async () => { screen.unmount(); });
    await render();
    expect(texts()).toContain("notes_empty");
  });

  it("shows a load error with a retry, independent of the memory", async () => {
    h.getChefNotes.mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(texts()).toContain("translated:offline");
    expect(texts()).toContain("memory_identity");
    const retry = screen.root.findAllByType("Button" as never).find((node) => node.props.label === "memory_retry")!;
    await act(async () => { await retry.props.onPress(); });
    expect(texts()).toContain("No usamos cerdo");
  });
});
