import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit liviano por IP (memoria por instancia; el honeypot cubre el resto)
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, restaurant, extra, lang } = (body ?? {}) as Record<string, unknown>;

  // honeypot relleno → responder ok sin enviar, pero dejar rastro en logs
  // (si un autofill agresivo lo llena, la reserva de un humano real se
  // perdería en silencio; con el log se puede recuperar a mano)
  if (typeof extra === "string" && extra.trim() !== "") {
    const masked = typeof email === "string" ? email.replace(/^(.{2}).*(@.*)$/, "$1***$2") : "?";
    console.warn("[reservas] honeypot activado, no se envió email:", masked);
    return NextResponse.json({ ok: true });
  }

  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !EMAIL_RE.test(email) ||
    typeof restaurant !== "string" ||
    restaurant.trim().length === 0 ||
    restaurant.length > 120
  ) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  // en Vercel el primer hop de XFF lo escribe la plataforma (no spoofeable ahí)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip) || rateLimited(`email:${email.toLowerCase()}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.RESERVAS_TO ?? "andygomezgc@gmail.com";
  const from = process.env.RESEND_FROM ?? "Atelier <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("[reservas] RESEND_API_KEY ausente; reserva perdida:", { email, restaurant });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `Reserva Socio Fundador — ${restaurant.trim()}`,
      text: [
        `Nueva reserva de Socio Fundador desde la landing (${typeof lang === "string" ? lang : "?"}).`,
        "",
        `Restaurante: ${restaurant.trim()}`,
        `Email: ${email}`,
        `Fecha: ${new Date().toISOString()}`,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    console.error("[reservas] Resend fallo:", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
