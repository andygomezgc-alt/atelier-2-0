import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANDING_LOCALE_COOKIE, landingLocale } from "@/lib/landing-locale";

// "/" has no content of its own: it sends each visitor to /it, /es or /en,
// by their saved choice or else by the country Vercel reads from their IP.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  redirect(`/${landingLocale({
    country: requestHeaders.get("x-vercel-ip-country"),
    saved: requestCookies.get(LANDING_LOCALE_COOKIE)?.value,
  })}`);
}
