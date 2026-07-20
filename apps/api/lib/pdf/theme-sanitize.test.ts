import { describe, test, expect } from "vitest";
import { sanitizeCss, sanitizeFragment, sanitizeTheme } from "./theme-sanitize";
import type { MenuCustomTheme } from "@atelier/shared";

describe("sanitizeCss", () => {
  test("conserva url(data:...) y CSS normal", () => {
    const css = ".x{background:url(data:image/png;base64,AAAA);color:#111}";
    expect(sanitizeCss(css)).toContain("url(data:image/png;base64,AAAA)");
    expect(sanitizeCss(css)).toContain("color:#111");
  });

  test("elimina url() externo (http) dejando el resto", () => {
    const out = sanitizeCss(".x{background:url(https://evil.example/a.png);color:red}");
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("https://");
    expect(out).toContain("color:red");
  });

  test("elimina url() con comillas apuntando afuera", () => {
    expect(sanitizeCss(`.x{background:url("//cdn.evil/a.png")}`)).not.toContain("cdn.evil");
    expect(sanitizeCss(`.x{background:url('http://evil/a.png')}`)).not.toContain("evil");
  });

  test("throw si contiene '<' (breakout de </style>)", () => {
    expect(() => sanitizeCss(".x{}</style><script>alert(1)</script>")).toThrow();
  });

  test("throw con @import", () => {
    expect(() => sanitizeCss("@import url(data:x);.x{}")).toThrow();
  });

  test("throw con expression(", () => {
    expect(() => sanitizeCss(".x{width:expression(alert(1))}")).toThrow();
  });
});

describe("sanitizeFragment", () => {
  test("elimina <script> con su contenido", () => {
    const out = sanitizeFragment(`<div>ok<script>alert(1)</script></div>`);
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("ok");
  });

  test("elimina iframe/object/embed/link/meta/style/base", () => {
    const out = sanitizeFragment(
      `<div><iframe src="x"></iframe><object></object><embed><link rel="x"><meta><base href="y"></div>`,
    );
    for (const tag of ["iframe", "object", "embed", "<link", "<meta", "<base"]) {
      expect(out).not.toContain(tag);
    }
    expect(out).toContain("<div>");
  });

  test("elimina handlers on*=", () => {
    const out = sanitizeFragment(`<div onclick="steal()" onmouseover='x'>hi</div>`);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).toContain("hi");
  });

  test("elimina href/src con javascript: y externos http(s)/protocol-relative", () => {
    const out = sanitizeFragment(
      `<a href="javascript:evil()">a</a><img src="https://evil/x.png"><img src="//cdn/x.png">`,
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("https://evil");
    expect(out).not.toContain("//cdn");
  });

  test("conserva clase y style inline", () => {
    const out = sanitizeFragment(`<div class="dish" style="color:red">x</div>`);
    expect(out).toContain('class="dish"');
    expect(out).toContain('style="color:red"');
  });

  test("conserva src data: (icono inline)", () => {
    const out = sanitizeFragment(`<img src="data:image/png;base64,AAAA">`);
    expect(out).toContain("data:image/png;base64,AAAA");
  });
});

describe("sanitizeTheme", () => {
  const base: MenuCustomTheme = {
    version: 1,
    fontTitle: "playfair-display",
    fontBody: "eb-garamond",
    fontAccent: null,
    css: ".x{color:#111}",
    frameHtml: null,
    headerHtml: "<h1>{{MENU_NAME}}</h1>",
    sectionHeaderHtml: "<div>{{SECTION_NAME}}</div>",
    dishHtml: "<div onclick='x'>{{DISH_NAME}}</div>",
    footerHtml: null,
  };

  test("sanitiza todos los campos y respeta nulls", () => {
    const out = sanitizeTheme(base);
    expect(out.dishHtml).not.toContain("onclick");
    expect(out.frameHtml).toBeNull();
    expect(out.footerHtml).toBeNull();
    expect(out.css).toContain("#111");
  });

  test("propaga throw si el CSS tiene breakout", () => {
    expect(() => sanitizeTheme({ ...base, css: ".x{}</style>" })).toThrow();
  });
});
