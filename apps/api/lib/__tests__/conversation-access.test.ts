import { describe, expect, it } from "vitest";
import { accessibleConversationsWhere, canAccessConversation } from "../conversation-access";

const teamChat = { authorId: "chef-2", ideaId: null, idea: null };
const ideaChat = { authorId: "chef-2", ideaId: "idea-1", idea: { authorId: "chef-2" } };

describe("who can see and use a conversation", () => {
  it("shares a chat without an idea with every teammate", () => {
    expect(canAccessConversation(teamChat, { userId: "chef-1", role: "sous_chef" })).toBe(true);
  });

  it("opens a chat born from an idea to the chat's author", () => {
    expect(canAccessConversation(ideaChat, { userId: "chef-2", role: "sous_chef" })).toBe(true);
  });

  it("opens a legacy chat opened by a teammate to the idea's author", () => {
    const legacy = { authorId: "chef-2", ideaId: "idea-1", idea: { authorId: "chef-1" } };
    expect(canAccessConversation(legacy, { userId: "chef-1", role: "sous_chef" })).toBe(true);
  });

  it("opens every idea chat to an admin", () => {
    expect(canAccessConversation(ideaChat, { userId: "admin-1", role: "admin" })).toBe(true);
  });

  it.each(["sous_chef", "chef_executive"] as const)("hides a teammate's idea chat from a %s", role => {
    expect(canAccessConversation(ideaChat, { userId: "chef-1", role })).toBe(false);
  });

  it("lists every restaurant chat for an admin", () => {
    expect(accessibleConversationsWhere("restaurant-1", { userId: "admin-1", role: "admin" })).toEqual({ restaurantId: "restaurant-1" });
  });

  it("lists team chats and the caller's own idea chats for everyone else", () => {
    expect(accessibleConversationsWhere("restaurant-1", { userId: "chef-1", role: "chef_executive" })).toEqual({
      restaurantId: "restaurant-1",
      OR: [{ ideaId: null }, { authorId: "chef-1" }, { idea: { authorId: "chef-1" } }],
    });
  });
});
