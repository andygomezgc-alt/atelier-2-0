// Integration check against the isolated QA database only; no AI calls.
// From repo root: node --env-file=apps/api/.env.local packages/db/node_modules/tsx/dist/cli.mjs apps/api/scripts/check-idea-saves.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@atelier/db";
import { IdeaSaveError, saveNewIdea } from "../lib/create-idea";

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "ep-summer-heart-alhlh8nm-pooler.c-3.eu-central-1.aws.neon.tech", "Only the isolated QA database is allowed");
  const suffix = randomUUID();
  const restaurants = [`idea-qa-a-${suffix}`, `idea-qa-b-${suffix}`];
  const users = [`idea-chef-a-${suffix}`, `idea-chef-b-${suffix}`];
  const restaurantId = restaurants[0]!;
  const authorId = users[0]!;
  const body = { text: "Idea sintética de prueba", clientRequestId: "same-submission", expectedRestaurantId: restaurantId, expectedAuthorId: authorId };
  const isCode = (code: string) => (error: unknown) => error instanceof IdeaSaveError && error.code === code;
  try {
    for (const id of restaurants) await prisma.restaurant.create({ data: { id, name: "Idea QA", inviteCode: id } });
    for (const id of users) await prisma.user.create({ data: { id, name: "Idea QA", email: `${id}@example.test`, role: "admin", restaurantId } });

    const saves = await Promise.all(Array.from({ length: 5 }, () => saveNewIdea(restaurantId, authorId, body)));
    const ideaId = saves[0]!.idea.id;
    assert.equal(new Set(saves.map((result) => result.idea.id)).size, 1);
    assert.equal(saves.filter((result) => !result.reused).length, 1);
    assert.equal(await prisma.idea.count({ where: { restaurantId } }), 1, "The losing transactions must roll back their ideas");
    assert.equal(await prisma.ideaCreateReceipt.count({ where: { restaurantId } }), 1);

    await assert.rejects(saveNewIdea(restaurantId, authorId, { ...body, text: "Contenido distinto" }), isCode("idea_save_conflict"));
    await assert.rejects(saveNewIdea(restaurants[1]!, authorId, body), isCode("idea_owner_changed"));
    await assert.rejects(saveNewIdea(restaurantId, users[1]!, body), isCode("idea_owner_changed"));
    const intentional = await saveNewIdea(restaurantId, authorId, { ...body, clientRequestId: "another-submission" });
    assert.notEqual(intentional.idea.id, ideaId);

    await prisma.idea.update({ where: { id: ideaId }, data: { text: "Texto editado", status: "archived" } });
    const replay = await saveNewIdea(restaurantId, authorId, body);
    assert.equal(replay.idea.text, "Texto editado");
    assert.equal(replay.idea.status, "archived");
    await prisma.idea.delete({ where: { id: ideaId } });
    await assert.rejects(saveNewIdea(restaurantId, authorId, body), isCode("idea_already_deleted"));
    assert.equal(await prisma.idea.count({ where: { restaurantId } }), 1);

    const otherChef = await saveNewIdea(restaurantId, users[1]!, { ...body, expectedAuthorId: users[1]! });
    const otherTeam = await saveNewIdea(restaurants[1]!, authorId, { ...body, expectedRestaurantId: restaurants[1]! });
    assert.notEqual(otherChef.idea.id, otherTeam.idea.id);
    assert.equal(otherTeam.idea.restaurantId, restaurants[1]);
    assert.equal(otherChef.idea.authorId, users[1]);

    const legacy = await saveNewIdea(restaurantId, authorId, { text: "Cliente anterior" });
    assert.equal(legacy.reused, false);
    assert.equal(await prisma.ideaCreateReceipt.count({ where: { ideaId: legacy.idea.id } }), 0);
    console.log(JSON.stringify({ status: "passed", concurrentSaves: 5, realAiCalls: 0, checks: ["concurrent deduplication and rollback", "content conflict", "identity changes", "intentional duplicate text", "edited and archived replay", "deleted tombstone", "restaurant and author isolation", "legacy client"] }));
  } finally {
    await prisma.idea.deleteMany({ where: { restaurantId: { in: restaurants } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: restaurants } } });
    assert.equal(await prisma.ideaCreateReceipt.count({ where: { restaurantId: { in: restaurants } } }), 0);
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
