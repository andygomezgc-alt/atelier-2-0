import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { Resend } from "resend";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "Atelier <noreply@atelier.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = (body?.email ?? "").toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Auth.js stores verification tokens by identifier (email)
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token } },
    update: { token, expires },
    create: { identifier: email, token, expires },
  });

  const deepLink = `atelier://auth?token=${token}&email=${encodeURIComponent(email)}`;
  const webFallback = `${APP_URL}/api/mobile/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;

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
        <p style="font-size:13px;color:#8b7a6f">Si el botón no funciona, <a href="${webFallback}" style="color:#c47e4f">abre este enlace</a>.</p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
