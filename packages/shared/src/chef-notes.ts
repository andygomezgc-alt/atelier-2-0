import { z } from "zod";

/** Máximo de notas del chef por restaurante (lo aplica la API al crear). */
export const CHEF_NOTES_MAX = 10;
export const ChefNoteTextSchema = z.string()
  .transform(text => text.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(160));
export const CreateChefNoteSchema = z.object({ text: ChefNoteTextSchema }).strict();
export const ChefNoteSchema = z.object({ id: z.string(), text: ChefNoteTextSchema, createdAt: z.string().datetime() });
export const ChefNotesResponseSchema = z.object({ notes: z.array(ChefNoteSchema), canEdit: z.boolean() });
export type CreateChefNote = z.infer<typeof CreateChefNoteSchema>;
export type ChefNote = z.infer<typeof ChefNoteSchema>;
export type ChefNotesResponse = z.infer<typeof ChefNotesResponseSchema>;
