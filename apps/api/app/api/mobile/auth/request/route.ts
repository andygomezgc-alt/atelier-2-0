import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { Resend } from "resend";
import { randomBytes, createHash } from "crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Hash tokens at rest so a DB leak does not expose usable magic links.
// Email still carries the plaintext token; verify route hashes before lookup.
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "Atelier <noreply@atelier.app>";

// In-memory rate limit. Per-instance only (Vercel may run multiple lambdas);
// good enough to slow casual abuse. For distributed limits use Upstash/Redis.
const EMAIL_WINDOW_MS = 60_000;
const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 5;
const lastByEmail = new Map<string, number>();
const ipHits = new Map<string, number[]>();

function rateLimited(email: string, ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const lastEmail = lastByEmail.get(email);
  if (lastEmail && now - lastEmail < EMAIL_WINDOW_MS) {
    return { ok: false, retryAfter: Math.ceil((EMAIL_WINDOW_MS - (now - lastEmail)) / 1000) };
  }
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX) {
    const oldest = hits[0] ?? now;
    return { ok: false, retryAfter: Math.ceil((IP_WINDOW_MS - (now - oldest)) / 1000) };
  }
  hits.push(now);
  ipHits.set(ip, hits);
  lastByEmail.set(email, now);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = (body?.email ?? "").toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limit = rateLimited(email, ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Auth.js stores verification tokens by identifier (email).
  // We persist sha256(token) instead of the plaintext to limit blast radius
  // of a DB leak. Pre-deploy tokens still in flight (TTL 15min) will fail
  // verification and users must request a new magic link.
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token: tokenHash } },
    update: { token: tokenHash, expires },
    create: { identifier: email, token: tokenHash, expires },
  });

  const deepLink = `atelier://auth?token=${token}&email=${encodeURIComponent(email)}`;

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Tu enlace mágico — Atelier",
      html: `
      <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f9f7f2;color:#2a2520">
        <h1 style="font-style:italic;color:#1a3a3a;margin-bottom:8px">Atelier</h1>
        <p style="color:#8b7a6f;margin-bottom:32px">Tu cuaderno creativo</p>
        <p>Toca el botón para entrar. El enlace expira en <strong>15 minutos</strong>.</p>
        <a href="${deepLink}" style="display:inline-block;background:#c47e4f;color:#f9f7f2;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:system-ui,sans-serif;font-weight:600;margin:24px 0">Abrir Atelier</a>
        <p style="font-size:13px;color:#8b7a6f;margin-top:32px">Si la app no se abrió al tocar el botón, copia este código y pégalo en la pantalla de login:</p>
        <p style="font-family:'SF Mono',Menlo,monospace;font-size:12px;background:#fff;border:1px solid #e8e2d8;border-radius:8px;padding:12px;word-break:break-all;color:#2a2520">${token}</p>
      </div>
    `,
    });
  } catch (err) {
    logger.error("magic_link_email_failed", {
      err: err instanceof Error ? err.message : String(err),
      email,
    });
    return NextResponse.json({ error: "No se pudo enviar el correo" }, { status: 502 });
  }

  logger.info("magic_link_sent", { email });
  return NextResponse.json({ ok: true });
}
