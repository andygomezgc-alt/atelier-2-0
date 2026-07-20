// Renders an HTML template to PDF via Puppeteer. In serverless environments
// (Vercel) we use @sparticuz/chromium; in dev we use the local Chromium that
// `puppeteer` (not -core) downloaded post-install.

import type { Browser } from "puppeteer-core";

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
  viewport?: { width: number; height: number; deviceScaleFactor: number },
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
  await page.setJavaScriptEnabled(false);
  // Viewport ANTES de setContent para que el layout use el ancho A4 (PNG).
  if (viewport) await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: "load" });
  return page;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await setupPage(browser, html);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// Render de UNA página A4 a PNG (viewport 794×1123 @1x ≈ A4 a 96dpi). Se usa en
// el bucle de refinamiento del theme: renderizamos el theme generado, sacamos
// screenshot y el modelo compara original vs. copia.
export async function renderHtmlToPng(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await setupPage(browser, html, {
      width: 794,
      height: 1123,
      deviceScaleFactor: 1,
    });
    const png = await page.screenshot({ fullPage: true, type: "png" });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}
