import type { CulinaryMemoryResponse, PatchCulinaryMemory } from "@atelier/shared";
import { apiFetch } from "./client";
const path = "/api/restaurant/culinary-memory";
export const getCulinaryMemory = () => apiFetch<CulinaryMemoryResponse>(path);
export const patchCulinaryMemory = (body: PatchCulinaryMemory) => apiFetch<CulinaryMemoryResponse>(path, { method: "PATCH", body: JSON.stringify(body) });
export const clearCulinaryMemory = (expectedVersion: number) => apiFetch<CulinaryMemoryResponse>(path, { method: "DELETE", body: JSON.stringify({ expectedVersion }) });
