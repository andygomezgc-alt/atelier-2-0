import { describe, expect, it } from "vitest";
import { nextRoute } from "../auth-route";

describe("a dónde entra el chef", () => {
  it("sin sesión va al login", () => {
    expect(nextRoute("signed-out", ["(tabs)", "inicio"])).toBe("/(auth)/login");
    expect(nextRoute("signed-out", ["(auth)", "login"])).toBeNull();
  });

  it("sin restaurante NO entra a las pestañas: va a crear o unirse", () => {
    expect(nextRoute("needs-restaurant", ["(tabs)", "inicio"])).toBe("/(auth)/choose-flow");
    expect(nextRoute("needs-restaurant", ["(tabs)", "casa"])).toBe("/(auth)/choose-flow");
    expect(nextRoute("needs-restaurant", ["(auth)", "login"])).toBe("/(auth)/choose-flow");
  });

  it("mientras crea o se une, se queda donde está", () => {
    for (const pantalla of ["choose-flow", "create-restaurant", "join-with-code"]) {
      expect(nextRoute("needs-restaurant", ["(auth)", pantalla])).toBeNull();
    }
  });

  it("con restaurante sale del onboarding hacia Inicio y no se le mueve dentro de las pestañas", () => {
    expect(nextRoute("signed-in", ["(auth)", "choose-flow"])).toBe("/(tabs)/inicio");
    expect(nextRoute("signed-in", ["(tabs)", "recetas"])).toBeNull();
  });

  it("cargando, sin conexión y el deep link del correo no redirigen", () => {
    expect(nextRoute("loading", ["(tabs)", "inicio"])).toBeNull();
    expect(nextRoute("offline", ["(tabs)", "inicio"])).toBeNull();
    expect(nextRoute("signed-out", ["auth"])).toBeNull();
    expect(nextRoute("needs-restaurant", ["auth"])).toBeNull();
  });
});
