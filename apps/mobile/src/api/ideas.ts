import { apiFetch } from "./client";

export type Idea = {
  id: string;
  text: string;
  status: "open" | "in_chat" | "archived";
  createdAt: string;
  authorName: string;
  conversationsCount: number;
};

export const listIdeas = () => apiFetch<Idea[]>("/api/ideas");

export type IdeaSaveRequest = {
  clientRequestId: string;
  expectedRestaurantId: string;
  expectedAuthorId: string;
};

export const createIdea = (text: string, request: IdeaSaveRequest) =>
  apiFetch<Idea>("/api/ideas", { method: "POST", body: JSON.stringify({ text, ...request }) });

export const patchIdea = (
  id: string,
  data: { text?: string; status?: Idea["status"] },
) =>
  apiFetch<{ id: string; text: string; status: Idea["status"] }>(`/api/ideas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteIdea = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/ideas/${id}`, { method: "DELETE" });
