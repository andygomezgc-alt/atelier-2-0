import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractGoogleProfile, googleAudiences } from "../google-auth";

describe("googleAudiences", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it("devuelve web + iOS cuando ambos están seteados", () => {
    process.env.GOOGLE_WEB_CLIENT_ID = "web.apps.googleusercontent.com";
    process.env.GOOGLE_IOS_CLIENT_ID = "ios.apps.googleusercontent.com";
    expect(googleAudiences()).toEqual([
      "web.apps.googleusercontent.com",
      "ios.apps.googleusercontent.com",
    ]);
  });

  it("filtra los vacíos / ausentes", () => {
    process.env.GOOGLE_WEB_CLIENT_ID = "web.apps.googleusercontent.com";
    delete process.env.GOOGLE_IOS_CLIENT_ID;
    expect(googleAudiences()).toEqual(["web.apps.googleusercontent.com"]);
  });
});

describe("extractGoogleProfile", () => {
  it("normaliza email a minúsculas y devuelve name/picture", () => {
    expect(
      extractGoogleProfile({
        email: "Chef@Cocina.IT",
        email_verified: true,
        name: "Andy Gómez",
        picture: "https://lh3.googleusercontent.com/a/foto",
      }),
    ).toEqual({
      email: "chef@cocina.it",
      name: "Andy Gómez",
      picture: "https://lh3.googleusercontent.com/a/foto",
    });
  });

  it("name y picture son null cuando faltan", () => {
    expect(
      extractGoogleProfile({ email: "x@y.com", email_verified: true }),
    ).toEqual({ email: "x@y.com", name: null, picture: null });
  });

  it("rechaza token sin email", () => {
    expect(() => extractGoogleProfile({ email_verified: true })).toThrow(
      "google_no_email",
    );
  });

  it("rechaza email no verificado", () => {
    expect(() =>
      extractGoogleProfile({ email: "x@y.com", email_verified: false }),
    ).toThrow("google_email_unverified");
  });

  it("rechaza cuando email_verified no viene", () => {
    expect(() => extractGoogleProfile({ email: "x@y.com" })).toThrow(
      "google_email_unverified",
    );
  });
});
