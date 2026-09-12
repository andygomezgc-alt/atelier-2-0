import { describe, expect, it } from "vitest";
import { menuStyleImageMime } from "../menu-style-file";

describe("menu style image type", () => {
  it("preserves a PNG instead of labelling it JPEG", () => {
    expect(menuStyleImageMime({ uri: "file://menu.png", mimeType: "image/png" })).toBe("image/png");
  });
  it("uses picker output type when the original filename had another extension", () => {
    expect(menuStyleImageMime({ uri: "file://converted.jpg", fileName: "original.heic", mimeType: "image/jpeg" })).toBe("image/jpeg");
  });
  it("infers a missing type from a known file extension", () => {
    expect(menuStyleImageMime({ uri: "file://menu.WEBP" })).toBe("image/webp");
  });
  it("does not disguise unsupported input as JPEG", () => {
    expect(menuStyleImageMime({ uri: "file://menu.heic" })).toBe("image/heic");
  });
});
