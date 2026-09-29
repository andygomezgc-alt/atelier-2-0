// Actual "Recordar esto" sheet, with the network and native layers replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  createChefNote: vi.fn(), toast: vi.fn(), onClose: vi.fn(),
  t: (key: string) => key,
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/api/chef-notes", () => ({ createChefNote: h.createChefNote }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/components/BottomSheet", () => ({ BottomSheet: "BottomSheet" }));
vi.mock("@/src/components/Button", () => ({ Button: "Button" }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: (e: Error) => `translated:${e.message}` }));

import { RememberNoteSheet } from "../components/RememberNoteSheet";
let screen: ReactTestRenderer;
const input = () => screen.root.findByType("TextInput" as never);
const button = (label: string) => screen.root.findByProps({ label });
const texts = () => screen.root.findAllByType("Text" as never).map((node) => [node.props.children].flat().join(""));
async function render(text: string) {
  await act(async () => { screen = create(createElement(RememberNoteSheet, { text, onClose: h.onClose })); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("remember a chat message as a chef note", () => {
  it("prefills the message on one line, clamped to the limit, with a live counter", async () => {
    await render(`No usamos\n\n cerdo. ${"x".repeat(300)}`);
    expect(input().props.value).toBe(`No usamos cerdo. ${"x".repeat(143)}`);
    expect(input().props.maxLength).toBe(160);
    expect(texts()).toContain("160/160");
    await act(async () => { input().props.onChangeText("Horno de leña"); });
    expect(texts()).toContain("13/160");
  });

  it("does not allow saving blank text", async () => {
    await render("Sin gluten");
    await act(async () => { input().props.onChangeText("   "); });
    expect(button("notes_save").props.disabled).toBe(true);
    await act(async () => { await button("notes_save").props.onPress(); });
    expect(h.createChefNote).not.toHaveBeenCalled();
  });

  it("saves the trimmed text, confirms and closes", async () => {
    h.createChefNote.mockResolvedValue({ id: "n1", text: "Horno de leña", createdAt: "2026-09-29T10:00:00.000Z" });
    await render("Sin gluten");
    await act(async () => { input().props.onChangeText("  Horno de leña  "); });
    await act(async () => { await button("notes_save").props.onPress(); });
    expect(h.createChefNote).toHaveBeenCalledWith("Horno de leña");
    expect(h.toast).toHaveBeenCalledWith("notes_saved");
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the sheet open with the translated error when saving fails", async () => {
    h.createChefNote.mockRejectedValue(new Error("chef_notes_limit"));
    await render("Sin gluten");
    await act(async () => { await button("notes_save").props.onPress(); });
    expect(texts()).toContain("translated:chef_notes_limit");
    expect(h.onClose).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(button("notes_save").props.disabled).toBe(false);
  });

  it("ignores a second tap while saving and cannot be closed mid-request", async () => {
    let finish!: (value: unknown) => void;
    h.createChefNote.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render("Sin gluten");
    await act(async () => { void button("notes_save").props.onPress(); void button("notes_save").props.onPress(); });
    expect(h.createChefNote).toHaveBeenCalledOnce();
    await act(async () => { button("memory_cancel").props.onPress(); });
    expect(h.onClose).not.toHaveBeenCalled();
    await act(async () => { finish({ id: "n1" }); });
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it("cancel closes without saving", async () => {
    await render("Sin gluten");
    await act(async () => { button("memory_cancel").props.onPress(); });
    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.createChefNote).not.toHaveBeenCalled();
  });
});
