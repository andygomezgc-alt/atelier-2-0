import { describe, it, expect } from "vitest";
import { fileMatchesMime, PDF_MIME, DOCX_MIME } from "../recipe-extraction";
import { redactEmail } from "../logger";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("fileMatchesMime", () => {
  it("acepta un PDF real (%PDF)", () => {
    expect(fileMatchesMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), PDF_MIME)).toBe(true);
  });

  it("acepta un DOCX real (ZIP PK\\x03\\x04)", () => {
    expect(fileMatchesMime(bytes(0x50, 0x4b, 0x03, 0x04), DOCX_MIME)).toBe(true);
  });

  it("rechaza un archivo disfrazado (mime dice PDF pero es otra cosa)", () => {
    expect(fileMatchesMime(bytes(0x00, 0x01, 0x02, 0x03), PDF_MIME)).toBe(false);
  });

  it("rechaza un PDF declarado como DOCX y viceversa", () => {
    expect(fileMatchesMime(bytes(0x25, 0x50, 0x44, 0x46), DOCX_MIME)).toBe(false);
    expect(fileMatchesMime(bytes(0x50, 0x4b, 0x03, 0x04), PDF_MIME)).toBe(false);
  });

  it("rechaza buffers demasiado cortos", () => {
    expect(fileMatchesMime(bytes(0x25, 0x50), PDF_MIME)).toBe(false);
  });
});

describe("redactEmail", () => {
  it("mantiene inicial y dominio, oculta el resto", () => {
    expect(redactEmail("andy@gmail.com")).toBe("a***@gmail.com");
    expect(redactEmail("chef.mario@ristorante.it")).toBe("c***@ristorante.it");
  });

  it("no explota con entradas raras", () => {
    expect(redactEmail("@nolocal.com")).toBe("***");
    expect(redactEmail("sinarroba")).toBe("***");
  });
});
