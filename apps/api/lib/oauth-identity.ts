import { prisma, Prisma } from "@atelier/db";
import { mobileUserSelect, type MobileSessionUser } from "@/lib/mobile-session";

export class OAuthIdentityError extends Error {
  constructor(
    public readonly code: "oauth_email_missing" | "oauth_provider_conflict",
  ) {
    super(code);
  }
}

type OAuthTokens = {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
};

type ResolveOAuthIdentityInput = {
  provider: "apple" | "google";
  providerAccountId: string;
  email: string | null;
  name: string | null;
  photoUrl?: string | null;
  tokens?: OAuthTokens;
};

function accountCreateData(input: ResolveOAuthIdentityInput) {
  return {
    type: "oauth",
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    refresh_token: input.tokens?.refreshToken,
    access_token: input.tokens?.accessToken,
    expires_at: input.tokens?.expiresAt,
    token_type: input.tokens?.tokenType,
    scope: input.tokens?.scope,
    id_token: input.tokens?.idToken,
  };
}

function accountTokenUpdate(tokens: OAuthTokens | undefined): Prisma.AccountUpdateInput {
  if (!tokens) return {};
  return {
    ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
    ...(tokens.accessToken ? { access_token: tokens.accessToken } : {}),
    ...(tokens.expiresAt ? { expires_at: tokens.expiresAt } : {}),
    ...(tokens.tokenType ? { token_type: tokens.tokenType } : {}),
    ...(tokens.scope ? { scope: tokens.scope } : {}),
    ...(tokens.idToken ? { id_token: tokens.idToken } : {}),
  };
}

async function resolveInTransaction(
  tx: Prisma.TransactionClient,
  input: ResolveOAuthIdentityInput,
): Promise<MobileSessionUser> {
  // provider + sub is the durable identity. It always wins over a mutable email.
  const linked = await tx.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { id: true, user: { select: mobileUserSelect } },
  });
  if (linked) {
    const tokenUpdate = accountTokenUpdate(input.tokens);
    if (Object.keys(tokenUpdate).length > 0) {
      await tx.account.update({ where: { id: linked.id }, data: tokenUpdate });
    }
    return linked.user;
  }

  if (!input.email) throw new OAuthIdentityError("oauth_email_missing");

  const userWithEmail = await tx.user.findUnique({
    where: { email: input.email },
    select: mobileUserSelect,
  });

  if (userWithEmail) {
    // Never silently replace another identity from the same provider.
    const otherProviderIdentity = await tx.account.findFirst({
      where: { userId: userWithEmail.id, provider: input.provider },
      select: { providerAccountId: true },
    });
    if (
      otherProviderIdentity &&
      otherProviderIdentity.providerAccountId !== input.providerAccountId
    ) {
      throw new OAuthIdentityError("oauth_provider_conflict");
    }

    await tx.account.create({
      data: { userId: userWithEmail.id, ...accountCreateData(input) },
    });
    return userWithEmail;
  }

  const fallbackName = input.email.split("@")[0] || input.email;
  return tx.user.create({
    data: {
      email: input.email,
      name: input.name?.trim() || fallbackName,
      photoUrl: input.photoUrl ?? null,
      accounts: { create: accountCreateData(input) },
    },
    select: mobileUserSelect,
  });
}

/**
 * Resolves an external identity atomically. Verified exact-email matches are
 * linked, while private relay addresses naturally create a separate user.
 */
export async function resolveOAuthIdentity(
  input: ResolveOAuthIdentityInput,
): Promise<MobileSessionUser> {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => resolveInTransaction(tx, input), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");
      if (retryable && attempt < maxAttempts) continue;
      throw error;
    }
  }
}
