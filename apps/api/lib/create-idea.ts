import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@atelier/db";
import type { CreateIdeaRequest } from "@atelier/shared";
import { ideaInclude } from "./projections";

export class IdeaSaveError extends Error {
  constructor(public code: "idea_save_conflict" | "idea_owner_changed" | "idea_already_deleted", public status: number) { super(code); }
}

const receiptInclude = { idea: { include: ideaInclude } } as const;
type Receipt = Prisma.IdeaCreateReceiptGetPayload<{ include: typeof receiptInclude }>;
function replay(receipt: Receipt, hash: string) {
  if (receipt.requestHash !== hash) throw new IdeaSaveError("idea_save_conflict", 409);
  if (!receipt.idea) throw new IdeaSaveError("idea_already_deleted", 410);
  // Return the current idea, keeping subsequent edits/archival intact.
  return { idea: receipt.idea, reused: true };
}

export async function saveNewIdea(restaurantId: string, authorId: string, body: CreateIdeaRequest) {
  if ((body.expectedRestaurantId && body.expectedRestaurantId !== restaurantId) ||
      (body.expectedAuthorId && body.expectedAuthorId !== authorId)) {
    throw new IdeaSaveError("idea_owner_changed", 409);
  }
  const data = { restaurantId, authorId, text: body.text };
  if (!body.clientRequestId) {
    // Compatibility for already installed clients; no content-based deduplication.
    return { idea: await prisma.idea.create({ data, include: ideaInclude }), reused: false };
  }
  const key = { restaurantId, authorId, clientRequestId: body.clientRequestId };
  const where = { restaurantId_authorId_clientRequestId: key };
  const hash = createHash("sha256").update(body.text).digest("hex");
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.ideaCreateReceipt.findUnique({ where, include: receiptInclude });
      if (previous) return replay(previous, hash);
      const idea = await tx.idea.create({ data, include: ideaInclude });
      await tx.ideaCreateReceipt.create({ data: { ...key, requestHash: hash, ideaId: idea.id } });
      return { idea, reused: false };
    });
  } catch (error) {
    // The unique receipt makes concurrent saves race safely: the losing
    // transaction rolls back its idea before returning the committed winner.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const previous = await prisma.ideaCreateReceipt.findUnique({ where, include: receiptInclude });
      if (previous) return replay(previous, hash);
    }
    throw error;
  }
}
