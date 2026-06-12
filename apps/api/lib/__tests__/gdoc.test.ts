import { describe, expect, it } from "vitest";
import { parseGDocId, gdocExportUrl } from "../gdoc";

const ID = "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ_-abcdef";

describe("parseGDocId", () => {
  it("acepta el link de editor clásico", () => {
    expect(parseGDocId(`https://docs.google.com/document/d/${ID}/edit`)).toBe(ID);
  });

  it("acepta el link de compartir del app móvil (query + usp)", () => {
    expect(
      parseGDocId(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`),
    ).toBe(ID);
  });

  it("acepta el link sin sufijo", () => {
    expect(parseGDocId(`https://docs.google.com/document/d/${ID}`)).toBe(ID);
  });

  it("tolera espacios alrededor (paste de móvil)", () => {
    expect(parseGDocId(`  https://docs.google.com/document/d/${ID}/edit \n`)).toBe(ID);
  });

  it("rechaza http sin TLS", () => {
    expect(parseGDocId(`http://docs.google.com/document/d/${ID}/edit`)).toBeNull();
  });

  it("rechaza otros hosts (anti-SSRF)", () => {
    expect(parseGDocId(`https://evil.com/document/d/${ID}/edit`)).toBeNull();
    expect(parseGDocId(`https://docs.google.com.evil.com/document/d/${ID}`)).toBeNull();
    expect(parseGDocId(`https://drive.google.com/file/d/${ID}/view`)).toBeNull();
  });

  it("rechaza IDs con caracteres fuera del alfabeto de Google", () => {
    expect(parseGDocId("https://docs.google.com/document/d/../../etc/passwd")).toBeNull();
    expect(parseGDocId("https://docs.google.com/document/d/abc%2F..%2Fx/edit")).toBeNull();
  });

  it("rechaza vacío y basura", () => {
    expect(parseGDocId("")).toBeNull();
    expect(parseGDocId("hola")).toBeNull();
  });
});

describe("gdocExportUrl", () => {
  it("construye la URL de export docx con el ID extraído", () => {
    expect(gdocExportUrl(ID)).toBe(
      `https://docs.google.com/document/d/${ID}/export?format=docx`,
    );
  });
});
