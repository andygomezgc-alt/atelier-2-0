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

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
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
    await page.setContent(html, { waitUntil: "networkidle0" });
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
