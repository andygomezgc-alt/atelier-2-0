import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const h = vi.hoisted(() => ({
  role: "admin",
  photoUrl: null as string | null,
  permission: vi.fn(),
  push: vi.fn(),
  pick: vi.fn(),
  upload: vi.fn(),
  reload: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Image: "Image", Pressable: "Pressable",
  RefreshControl: "RefreshControl", ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Share: { share: vi.fn() },
  Platform: { OS: "android", select: (items: Record<string, unknown>) => items.android ?? items.default },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: h.permission,
  launchImageLibraryAsync: h.pick,
}));
vi.mock("@/src/hooks/useI18n", () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: () => ({ state: { status: "signed-in", user: { id: "user-1", role: h.role, restaurantId: "restaurant-1" } }, refreshMe: vi.fn(), patchLocalUser: vi.fn() }),
}));
vi.mock("@/src/hooks/useRestaurant", async () => {
  const { useState } = await import("react");
  return {
    useRestaurant: () => {
      const [photoUrl, setPhotoUrl] = useState(h.photoUrl);
      const reload = async () => {
        await h.reload();
        setPhotoUrl(h.photoUrl);
      };
      return {
        rs: { status: "ok", data: { id: "restaurant-1", name: "Atelier", identityLine: null, photoUrl, inviteCode: "ABC", staff: [] } },
        reload,
      };
    },
  };
});
vi.mock("@/src/hooks/useRefresh", () => ({ useRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("@/src/components/LazyRestaurantHost", () => ({ ensureRestaurant: vi.fn() }));
vi.mock("@/src/components/Screen", () => ({ Screen: "Screen" }));
vi.mock("@/src/components/NetworkError", () => ({ NetworkError: "NetworkError" }));
vi.mock("@/src/components/StaffMemberSheet", () => ({ StaffMemberSheet: "StaffMemberSheet" }));
vi.mock("@/src/components/EditRestaurantNameSheet", () => ({ EditRestaurantNameSheet: "EditRestaurantNameSheet" }));
vi.mock("@/src/components/LeaveRestaurantSheet", () => ({ LeaveRestaurantSheet: "LeaveRestaurantSheet" }));
vi.mock("@/src/components/Toast", () => ({ showToast: h.toast }));
vi.mock("@/src/api/auth", () => ({ uploadRestaurantPhoto: h.upload }));
vi.mock("@/src/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/src/lib/api-error", () => ({ apiErrorMessage: () => "network_error" }));
vi.mock("@atelier/shared", () => ({ can: (role: string, permission: string) => role === "admin" && ["edit_restaurant", "manage_products"].includes(permission) }));

import CasaScreen from "../../app/(tabs)/casa";

let screen: ReactTestRenderer;
const editPhoto = () => screen.root.findAllByType("Pressable" as never).find((node) =>
  ["casa_photo_edit", "casa_photo_uploading"].includes(node.props.accessibilityLabel),
);
const images = () => screen.root.findAllByType("Image" as never);
const initial = () => screen.root.findAllByType("Text" as never).find((node) => node.children.join("") === "A");

async function render() {
  await act(async () => { screen = create(createElement(CasaScreen)); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  h.role = "admin";
  h.photoUrl = null;
  h.permission.mockResolvedValue({ granted: true });
  h.pick.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///restaurant.jpg", mimeType: "image/jpeg" }] });
  h.upload.mockResolvedValue({ photoUrl: "https://example.com/new.jpg" });
  h.reload.mockResolvedValue(undefined);
});
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

describe("Casa restaurant photo", () => {
  it("shows the restaurant initial before a photo is added", async () => {
    await render();
    expect(images()).toHaveLength(0);
    expect(initial()).toBeDefined();
  });

  it("shows the saved image and falls back to the initial if it cannot load", async () => {
    h.photoUrl = "https://example.com/restaurant.jpg";
    await render();
    expect(images()[0]?.props.source.uri).toBe(h.photoUrl);
    await act(async () => { images()[0]?.props.onError(); });
    expect(images()).toHaveLength(0);
    expect(initial()).toBeDefined();
  });

  it("only lets an administrator edit the restaurant photo", async () => {
    await render();
    expect(editPhoto()?.props.accessibilityRole).toBe("button");
    await act(async () => { screen.unmount(); });
    h.role = "viewer";
    h.photoUrl = "https://example.com/restaurant.jpg";
    await render();
    expect(editPhoto()).toBeUndefined();
    expect(images()[0]?.props.source.uri).toBe(h.photoUrl);
  });

  it("opens the supplier invoices to who manages products", async () => {
    await render();
    const entry = () => screen.root.findAllByType("Pressable" as never).find((node) => node.props.accessibilityLabel === "casa_facturas_entry_title");
    await act(async () => { entry()?.props.onPress(); });
    expect(h.push).toHaveBeenCalledWith("/facturas");
    await act(async () => { screen.unmount(); });
    h.role = "viewer";
    await render();
    expect(entry()).toBeUndefined();
  });

  it("does not upload when gallery permission is denied or selection is cancelled", async () => {
    await render();
    h.permission.mockResolvedValueOnce({ granted: false });
    await act(async () => { await editPhoto()?.props.onPress(); });
    expect(h.pick).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith("cargar_permiso_galeria");
    h.pick.mockResolvedValueOnce({ canceled: true });
    await act(async () => { await editPhoto()?.props.onPress(); });
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("locks rapid taps, uploads once, and refreshes the restaurant", async () => {
    let finish!: (value: { photoUrl: string }) => void;
    const savedUrl = "https://example.com/new.jpg";
    h.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    h.reload.mockImplementation(async () => { h.photoUrl = savedUrl; });
    await render();
    await act(async () => { void editPhoto()?.props.onPress(); void editPhoto()?.props.onPress(); });
    expect(h.permission).toHaveBeenCalledOnce();
    expect(h.pick).toHaveBeenCalledOnce();
    expect(h.upload).toHaveBeenCalledWith("file:///restaurant.jpg", "image/jpeg");
    expect(editPhoto()?.props.disabled).toBe(true);
    expect(editPhoto()?.props.accessibilityLabel).toBe("casa_photo_uploading");
    await act(async () => { finish({ photoUrl: savedUrl }); });
    expect(h.reload).toHaveBeenCalledOnce();
    expect(images()[0]?.props.source.uri).toBe(savedUrl);
  });

  it("keeps the existing photo and shows an error when upload fails", async () => {
    h.photoUrl = "https://example.com/old.jpg";
    h.upload.mockRejectedValue(new Error("upload failed"));
    await render();
    await act(async () => { await editPhoto()?.props.onPress(); });
    expect(images()[0]?.props.source.uri).toBe(h.photoUrl);
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith("casa_photo_upload_failed");
  });

  it("does not report a saved photo as failed when the refresh afterwards fails", async () => {
    h.reload.mockRejectedValue(new Error("refresh failed"));
    await render();
    await act(async () => { await editPhoto()?.props.onPress(); });
    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.reload).toHaveBeenCalledOnce();
    expect(h.toast).not.toHaveBeenCalledWith("casa_photo_upload_failed");
    expect(editPhoto()?.props.disabled).toBe(false);
  });

  it("rejects unsupported gallery formats before upload", async () => {
    h.pick.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///restaurant.heic", mimeType: "image/heic" }] });
    await render();
    await act(async () => { await editPhoto()?.props.onPress(); });
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith("casa_photo_unsupported");
  });
});
