import type { ChefNote, ChefNotesResponse } from "@atelier/shared";
import { apiFetch } from "./client";
const path = "/api/restaurant/chef-notes";
export const getChefNotes = () => apiFetch<ChefNotesResponse>(path);
export const createChefNote = (text: string) => apiFetch<ChefNote>(path, { method: "POST", body: JSON.stringify({ text }) });
export const deleteChefNote = (id: string) => apiFetch<{ ok: true }>(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" });
