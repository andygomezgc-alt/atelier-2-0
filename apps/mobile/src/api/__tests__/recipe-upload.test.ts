import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getToken: vi.fn(), upload: vi.fn() }));

vi.mock("@/src/lib/secure-storage", () => ({ getItemAsync: h.getToken }));
vi.mock("expo-file-system/legacy", () => ({
  uploadAsync: h.upload,
  FileSystemUploadType: { MULTIPART: 1 },
}));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "es", languageTag: "es-ES" }],
}));

import { uploadRecipeFile } from "../recipes";
import { ApiError } from "../client";
import { apiErrorMessage } from "@/src/lib/api-error";

const t = (key: string) => `t:${key}`;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeEach(() => {
  vi.resetAllMocks();
  h.getToken.mockResolvedValue("session-token");
});

describe("recipe file upload errors", () => {
  it("keeps the server code so the app shows a translated message, not the raw error", async () => {
    h.upload.mockResolvedValue({
      status: 422,
      body: '{"error":"recipe_too_many_ingredients","code":"recipe_extraction_failed"}',
    });
    const error = await uploadRecipeFile("file:///receta.docx", DOCX).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, message: "recipe_too_many_ingredients", code: "recipe_extraction_failed" });
    expect(apiErrorMessage(error, t)).toBe("t:error_recipe_extraction_failed");
  });

  it("an error body without a code still reports the server message", async () => {
    h.upload.mockResolvedValue({ status: 413, body: '{"error":"Archivo demasiado grande"}' });
    const error = await uploadRecipeFile("file:///receta.pdf", "application/pdf").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 413, message: "Archivo demasiado grande", code: undefined });
  });

  it("a body that is not JSON reports the HTTP status", async () => {
    h.upload.mockResolvedValue({ status: 413, body: "Request Entity Too Large" });
    await expect(uploadRecipeFile("file:///receta.pdf", "application/pdf"))
      .rejects.toMatchObject({ status: 413, message: "HTTP 413" });
  });
});
