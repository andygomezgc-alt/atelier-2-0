import { SignJWT } from "jose";
import type { Prisma } from "@atelier/db";
import { meSelect, projectMe } from "@/lib/projections";

export const mobileUserSelect = {
  ...meSelect,
  tokenVersion: true,
} as const;

export type MobileSessionUser = Prisma.UserGetPayload<{
  select: typeof mobileUserSelect;
}>;

function getMobileJwtSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("mobile_jwt_not_configured");
  return new TextEncoder().encode(secret);
}

export async function createMobileSession(user: MobileSessionUser) {
  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    tv: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setExpirationTime("30d")
    .sign(getMobileJwtSecret());

  return { accessToken, user: projectMe(user) };
}
