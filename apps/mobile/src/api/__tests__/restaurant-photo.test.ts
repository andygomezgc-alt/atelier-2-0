import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getToken: vi.fn(), upload: vi.fn() }));

vi.mock("@/src/lib/secure-storage", () => ({ getItemAsync: h.getToken }));
vi.mock("expo-file-system/legacy", () => ({
  uploadAsync: h.upload,
  FileSystemUploadType: { MULTIPART: 1 },
}));
vi.mock("@/src/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/src/api/client")>("@/src/api/client");
  return { ...actual, BASE: "https://api.example.com" };
});

import { uploadRestaurantPhoto } from "../auth";

beforeEach(() => {
  vi.resetAllMocks();
  h.getToken.mockResolvedValue("session-token");
  h.upload.mockResolvedValue({ status: 200, body: '{"photoUrl":"https://example.com/photo.jpg"}' });
});

describe("restaurant photo transport", () => {
  it("posts the native multipart photo to the restaurant endpoint with bearer auth", async () => {
    const result = await uploadRestaurantPhoto("file:///restaurant.jpg", "image/jpeg");
    expect(result.photoUrl).toBe("https://example.com/photo.jpg");
    expect(h.upload).toHaveBeenCalledWith(
      "https://api.example.com/api/restaurant/photo",
      "file:///restaurant.jpg",
      expect.objectContaining({
        httpMethod: "POST", uploadType: 1, fieldName: "photo", mimeType: "image/jpeg",
        headers: { Authorization: "Bearer session-token" },
      }),
    );
  });

  it("reports a non-success server response instead of treating it as saved", async () => {
    h.upload.mockResolvedValue({ status: 413, body: '{"error":"Image too large"}' });
    await expect(uploadRestaurantPhoto("file:///restaurant.jpg", "image/jpeg"))
      .rejects.toMatchObject({ status: 413, message: "Image too large" });
  });
});
