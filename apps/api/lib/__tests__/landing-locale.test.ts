import { describe, expect, it } from "vitest";
import { LANDING_LOCALES, landingLocale } from "../landing-locale";

describe("landingLocale", () => {
  it("serves Italian to Italy, Spanish to Spain and Latin America, English elsewhere", () => {
    expect(landingLocale({ country: "IT" })).toBe("it");
    expect(landingLocale({ country: "SM" })).toBe("it");
    expect(landingLocale({ country: "ES" })).toBe("es");
    for (const country of ["AR", "MX", "CO", "CL", "PE", "UY"]) expect(landingLocale({ country })).toBe("es");
    for (const country of ["US", "GB", "FR", "DE", "CH"]) expect(landingLocale({ country })).toBe("en");
  });

  it("lets the visitor's saved choice win over the IP country", () => {
    expect(landingLocale({ country: "IT", saved: "en" })).toBe("en");
    expect(landingLocale({ country: "US", saved: "es" })).toBe("es");
  });

  it("ignores a saved value that is not a landing language", () => {
    expect(landingLocale({ country: "ES", saved: "fr" })).toBe("es");
  });

  it("falls back to Italian when the country is unknown", () => {
    expect(landingLocale({})).toBe("it");
    expect(landingLocale({ country: "" })).toBe("it");
  });

  it("accepts lowercase country codes", () => {
    expect(landingLocale({ country: "es" })).toBe("es");
  });

  it("offers exactly Italian, Spanish and English", () => {
    expect([...LANDING_LOCALES].sort()).toEqual(["en", "es", "it"]);
  });
});
