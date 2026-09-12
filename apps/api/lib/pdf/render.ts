// Renders an HTML template to PDF via Puppeteer. In serverless environments
// (Vercel) we use @sparticuz/chromium; in dev we use the local Chromium that
// `puppeteer` (not -core) downloaded post-install.

import type { Browser } from "puppeteer-core";
import { inspectDocumentFonts, MenuFontValidationError, type FontVariant } from "./font-validation";

const isProd =
  process.env.NEXT_RUNTIME === "edge" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview";

async function launchBrowser(): Promise<Browser> {
  if (isProd) {
    const puppeteer = await import("puppeteer-core");
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: use the full puppeteer package which bundles Chromium.
  const puppeteer = (await import("puppeteer")) as unknown as typeof import("puppeteer-core");
  return puppeteer.launch({ headless: true }) as unknown as Browser;
}

// Setup común de la página: bloquea toda la red salvo data:/about:blank y APAGA
// JS. Las plantillas (fijas y el theme generado) son 100% estáticas — sin JS no
// hace falta esperar networkidle0 (que cuelga sin scripts), así que usamos
// "load". Defensa en profundidad: aunque un theme adversarial trajera <script>,
// no correría.
async function setupPage(
  browser: Browser,
  html: string,
  variants: FontVariant[] | null,
) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    // Allow only data: URIs and the about:blank initial page
    if (url.startsWith("data:") || url === "about:blank") {
      req.continue();
    } else {
      req.abort();
    }
  });
  // ⚠️ FRONTERA DE SEGURIDAD, no solo performance. JS apagado + red bloqueada
  // (arriba) es lo que mantiene INERTE cualquier bypass del sanitizador de theme
  // (theme-sanitize.ts es defensa-en-profundidad de UNA sola pasada: tags
  // reformados, on-handlers sin espacio, entidades HTML en href, srcset, @import
  // ofuscado, etc. podrían colarse). Con JS off no ejecutan y sin red no cargan
  // nada externo. NO reactivar setJavaScriptEnabled(true) ni relajar la
  // interception sin re-endurecer el sanitizador primero — los revivís a todos.
  await page.setJavaScriptEnabled(false);
  await page.emulateMediaType("print");
  await page.setContent(html, { waitUntil: "load" });
  const fontIssues = await page.evaluate(inspectDocumentFonts, variants);
  if (fontIssues.length) throw new MenuFontValidationError(fontIssues);
  return page;
}

export async function renderHtmlToPdf(html: string, variants: FontVariant[] | null = null): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await setupPage(browser, html, variants);
    const pdf = await page.pdf({
      format: "A4",
      // Respeta @page del theme (A4 sigue siendo el tamaño por defecto).
      preferCSSPageSize: true,
      printBackground: true,
      timeout: 30_000,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
