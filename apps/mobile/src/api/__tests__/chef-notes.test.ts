import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({ apiFetch }));

import { createChefNote, deleteChefNote, getChefNotes } from "../chef-notes";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({});
});

describe("chef notes API client", () => {
  it("lists the notes of the active restaurant", async () => {
    const response = { notes: [{ id: "n1", text: "Sin cerdo", createdAt: "2026-09-29T10:00:00.000Z" }], canEdit: true };
    apiFetch.mockResolvedValueOnce(response);
    await expect(getChefNotes()).resolves.toBe(response);
    expect(apiFetch).toHaveBeenCalledWith("/api/restaurant/chef-notes");
  });

  it("creates a note with the given text", async () => {
    await createChefNote("Horno de leña");
    expect(apiFetch).toHaveBeenCalledWith("/api/restaurant/chef-notes", { method: "POST", body: JSON.stringify({ text: "Horno de leña" }) });
  });

  it("deletes one note by id", async () => {
    await deleteChefNote("note 1");
    expect(apiFetch).toHaveBeenCalledWith("/api/restaurant/chef-notes/note%201", { method: "DELETE" });
  });
});
