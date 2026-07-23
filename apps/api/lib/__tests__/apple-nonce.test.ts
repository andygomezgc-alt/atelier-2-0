import { describe, expect, it, vi } from "vitest";

const deleteMany = vi.hoisted(() => vi.fn());
vi.mock("@atelier/db", () => ({
  prisma: { verificationToken: { deleteMany } },
}));

import { consumeAppleNonce, hashAppleNonce } from "../apple-nonce";

describe("consumeAppleNonce", () => {
  it("uses an atomic delete so the same nonce can win only once", async () => {
    deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(consumeAppleNonce("one-time-nonce")).resolves.toBe(true);
    await expect(consumeAppleNonce("one-time-nonce")).resolves.toBe(false);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: "apple-auth-nonce",
        token: hashAppleNonce("one-time-nonce"),
        expires: { gt: expect.any(Date) },
      },
    });
  });
});
