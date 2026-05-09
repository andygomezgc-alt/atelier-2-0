// Three menu templates from brief sec. 9. Each renders the same data
// (restaurant, season, menu name, dishes) in a distinct typographic register.
// All A4, single column, no images, server-side rendering.

type Dish = {
  name: string;
  description: string;
  price: number; // cents
};

type RenderInput = {
  restaurantName: string;
  menuName: string;
  season: string | null;
  dishes: Dish[];
};

type Theme = {
  css: string;
  frame?: (inner: string) => string;
  header: (restaurantName: string, menuName: string, seasonHtml: string) => string;
  dish: (d: Dish, priceHtml: string) => string;
  footer?: string;
};

const PRICE = (cents: number) => `${(cents / 100).toFixed(0)} €`;

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);

const SHARED_HEAD = `
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 28mm 24mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
</style>
`;

function renderMenu(input: RenderInput, theme: Theme): string {
  const { restaurantName, menuName, season, dishes } = input;
  const seasonHtml = season ? `<div class="season">${escape(season)}</div>` : "";
  const header = theme.header(restaurantName, menuName, seasonHtml);
  const dishesHtml = dishes.map((d) => theme.dish(d, PRICE(d.price))).join("");
  const inner = header + dishesHtml + (theme.footer ?? "");
  const body = theme.frame ? theme.frame(inner) : inner;
  return `<!doctype html><html><head>${SHARED_HEAD}${theme.css}</head><body>
    ${body}
  </body></html>`;
}

const THEME_ELEGANT: Theme = {
  css: `<style>
    body { font-family: 'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif; color: #2a2520; background: #f9f7f2; }
    .brand { text-align: center; font-style: italic; font-size: 12pt; letter-spacing: 0.5em; color: #8b7a6f; margin-bottom: 4mm; }
    h1 { text-align: center; font-style: italic; font-weight: 400; font-size: 32pt; letter-spacing: 0.04em; color: #1a3a3a; margin: 0 0 2mm; }
    .season { text-align: center; font-style: italic; font-size: 11pt; color: #8b7a6f; margin-bottom: 16mm; }
    .rule { width: 24mm; height: 0.5pt; background: #c47e4f; margin: 0 auto 16mm; }
    .dish { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 8mm; page-break-inside: avoid; }
    .dish-text { flex: 1; }
    .dish-name { font-style: italic; font-size: 14pt; color: #1a3a3a; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: #4a423b; line-height: 1.5; margin: 0; }
    .dish-price { font-style: italic; font-size: 14pt; color: #c47e4f; flex-shrink: 0; }
    .footer { margin-top: 18mm; text-align: center; font-style: italic; font-size: 9pt; color: #b1a394; letter-spacing: 0.4em; }
  </style>`,
  header: (restaurantName, menuName, seasonHtml) => `<div class="brand">${escape(restaurantName.toUpperCase())}</div>
    <h1>${escape(menuName)}</h1>
    ${seasonHtml}
    <div class="rule"></div>
    `,
  dish: (d, price) => `
      <div class="dish">
        <div class="dish-text">
          <div class="dish-name">${escape(d.name)}</div>
          ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
        </div>
        <div class="dish-price">${price}</div>
      </div>`,
  footer: `
    <div class="footer">— ATELIER —</div>`,
};

const THEME_RUSTIC: Theme = {
  css: `<style>
    body { font-family: 'Iowan Old Style', 'Hoefler Text', Georgia, serif; color: #2a2520; background: #f5f0e6; }
    .frame { border: 1.5pt double #c47e4f; padding: 14mm 12mm; }
    .brand { text-align: center; font-size: 10pt; letter-spacing: 0.6em; color: #4a423b; margin-bottom: 6mm; text-transform: uppercase; }
    h1 { text-align: center; font-style: italic; font-weight: 400; font-size: 26pt; color: #2a2520; margin: 0; }
    .underline { width: 36mm; height: 1pt; background: #c47e4f; margin: 4mm auto 4mm; }
    .season { text-align: center; font-size: 10pt; color: #6e5e54; margin-bottom: 14mm; font-variant: small-caps; letter-spacing: 0.2em; }
    .dish { margin-bottom: 7mm; padding-bottom: 5mm; border-bottom: 0.4pt dotted #b1a394; page-break-inside: avoid; }
    .dish:last-child { border-bottom: none; }
    .dish-name { font-style: italic; font-size: 13pt; color: #2a2520; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: #4a423b; line-height: 1.6; margin: 0 0 2mm; }
    .dish-price { font-size: 11pt; color: #c47e4f; font-weight: 600; }
    .footer { margin-top: 12mm; text-align: center; font-size: 8.5pt; color: #8b7a6f; }
  </style>`,
  frame: (inner) => `<div class="frame">${inner}</div>`,
  header: (restaurantName, menuName, seasonHtml) => `
      <div class="brand">${escape(restaurantName)}</div>
      <h1>${escape(menuName)}</h1>
      <div class="underline"></div>
      ${seasonHtml}
      `,
  dish: (d, price) => `
        <div class="dish">
          <div class="dish-name">${escape(d.name)}</div>
          ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
          <div class="dish-price">${price}</div>
        </div>`,
  footer: `
      <div class="footer">— Atelier —</div>
    `,
};

const THEME_MINIMAL: Theme = {
  css: `<style>
    body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2a2520; background: #ffffff; font-size: 10.5pt; }
    .head { margin-bottom: 18mm; }
    .restaurant { font-size: 9pt; letter-spacing: 0.4em; color: #8b7a6f; text-transform: uppercase; margin-bottom: 6mm; }
    h1 { font-weight: 300; font-size: 24pt; letter-spacing: -0.01em; color: #1a3a3a; margin: 0 0 2mm; }
    .season { font-size: 10pt; color: #8b7a6f; }
    .dishes { display: grid; gap: 7mm; }
    .dish { display: grid; grid-template-columns: 1fr auto; gap: 6mm; align-items: baseline; page-break-inside: avoid; }
    .dish-text { display: flex; flex-direction: column; gap: 1.5mm; }
    .dish-name { font-weight: 500; color: #1a3a3a; margin: 0; }
    .dish-desc { font-size: 9.5pt; color: #6e5e54; line-height: 1.5; margin: 0; }
    .dish-price { font-variant-numeric: tabular-nums; color: #c47e4f; font-weight: 500; }
    .rule { height: 0.4pt; background: #e0d8c8; margin: 6mm 0 8mm; }
  </style>`,
  header: (restaurantName, menuName, seasonHtml) => `<div class="head">
      <div class="restaurant">${escape(restaurantName)}</div>
      <h1>${escape(menuName)}</h1>
      ${seasonHtml}
    </div>
    <div class="rule"></div>
    <div class="dishes">
      `,
  dish: (d, price) => `
        <div class="dish">
          <div class="dish-text">
            <div class="dish-name">${escape(d.name)}</div>
            ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
          </div>
          <div class="dish-price">${price}</div>
        </div>`,
  footer: `
    </div>`,
};

export const renderElegant = (input: RenderInput) => renderMenu(input, THEME_ELEGANT);
export const renderRustic = (input: RenderInput) => renderMenu(input, THEME_RUSTIC);
export const renderMinimal = (input: RenderInput) => renderMenu(input, THEME_MINIMAL);

export const TEMPLATES = {
  elegant: renderElegant,
  rustic: renderRustic,
  minimal: renderMinimal,
} as const;
