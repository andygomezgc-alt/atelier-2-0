import { z } from "zod";

export const MemoryKeySchema = z.enum(["cuisine", "ingredients", "techniques", "flavours", "textures", "presentation", "complexity"]);
export const MemoryPreferenceSchema = z.object({ key: MemoryKeySchema, text: z.string().trim().min(1).max(160) });
export const MemoryPreferencesSchema = z.array(MemoryPreferenceSchema).max(8).refine(items => new Set(items.map(i => i.key)).size === items.length);
export const MemoryVersionSchema = z.object({ expectedVersion: z.number().int().nonnegative() });
export const PatchCulinaryMemorySchema = MemoryVersionSchema.extend({
  enabled: z.boolean().optional(),
  identityLine: z.string().trim().max(1000).nullable().optional(),
  corrections: MemoryPreferencesSchema.optional(),
  excludedKeys: z.array(MemoryKeySchema).max(8).optional(),
}).strict();
export type MemoryPreference = z.infer<typeof MemoryPreferenceSchema>;
export type PatchCulinaryMemory = z.infer<typeof PatchCulinaryMemorySchema>;
export type CulinaryMemoryResponse = {
  restaurantId: string; version: number; enabled: boolean; identityLine: string | null;
  learned: MemoryPreference[]; corrections: MemoryPreference[];
  excludedKeys: MemoryPreference["key"][]; updatedAt: string | null; canEdit: boolean; learningAvailable: boolean;
};
