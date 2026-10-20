import localFont from "next/font/local";

// Share production's self-hosted serif across the landing and optional tour.
export const landingFont = localFont({
  src: [
    { path: "./fonts/crimson-pro/crimson-pro-latin-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/crimson-pro/crimson-pro-latin-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/crimson-pro/crimson-pro-latin-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/crimson-pro/crimson-pro-latin-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-crimson",
  adjustFontFallback: "Times New Roman",
});
