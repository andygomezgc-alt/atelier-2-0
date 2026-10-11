import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocales = vi.hoisted(() => vi.fn());
vi.mock("expo-localization", () => ({ getLocales }));

import { getDeviceLanguage, resolveDeviceLanguage } from "../device-language";

describe("device language", () => {
  beforeEach(() => getLocales.mockReset());

  it("uses the first supported locale in device preference order", () => {
    expect(resolveDeviceLanguage([
      { languageCode: "fr", languageTag: "fr-FR" },
      { languageCode: "ES", languageTag: "es-AR" },
      { languageCode: "it", languageTag: "it-IT" },
    ])).toBe("es");
  });

  it("accepts regional tags when languageCode is missing", () => {
    expect(resolveDeviceLanguage([
      { languageCode: null, languageTag: "en_GB" },
    ])).toBe("en");
  });

  it("falls back to Italian for empty or unsupported preferences", () => {
    expect(resolveDeviceLanguage([])).toBe("it");
    expect(resolveDeviceLanguage([
      { languageCode: "fr", languageTag: "fr-FR" },
      { languageCode: null, languageTag: null },
    ])).toBe("it");
  });

  it("falls back to Italian if the native lookup throws", () => {
    getLocales.mockImplementationOnce(() => { throw new Error("native unavailable"); });
    expect(getDeviceLanguage()).toBe("it");
  });

  it("reads the native preference list on each request", () => {
    getLocales.mockReturnValueOnce([{ languageCode: "es", languageTag: "es-ES" }]);
    getLocales.mockReturnValueOnce([{ languageCode: "it", languageTag: "it-IT" }]);
    expect(getDeviceLanguage()).toBe("es");
    expect(getDeviceLanguage()).toBe("it");
  });
});
