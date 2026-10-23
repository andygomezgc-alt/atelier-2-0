import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PatchIdeaRequestSchema } from "./index";

// API 400 bodies carry these messages (`error.flatten()`, `issues`), so a Zod
// upgrade must not reword them.
function messages(schema: z.ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues.map((issue) => issue.message);
}

describe("default validation messages", () => {
  it.each<[string, z.ZodTypeAny, unknown, string]>([
    ["a missing field", z.object({ a: z.string() }), {}, "Required"],
    ["a wrong type", z.string(), 1, "Expected string, received number"],
    ["null", z.string(), null, "Expected string, received null"],
    ["an array for an object", z.object({}), [], "Expected object, received array"],
    ["a string for an array", z.array(z.string()), "a", "Expected array, received string"],
    ["a float for an int", z.number().int(), 1.5, "Expected integer, received float"],
    ["a short string", z.string().min(4), "abc", "String must contain at least 4 character(s)"],
    ["a long string", z.string().max(2), "abc", "String must contain at most 2 character(s)"],
    ["a short array", z.array(z.string()).min(1), [], "Array must contain at least 1 element(s)"],
    ["a long array", z.array(z.string()).max(1), ["a", "b"], "Array must contain at most 1 element(s)"],
    ["a small number", z.number().min(1), 0, "Number must be greater than or equal to 1"],
    ["a non-positive number", z.number().positive(), 0, "Number must be greater than 0"],
    ["a big number", z.number().max(1), 2, "Number must be less than or equal to 1"],
    ["an unknown enum value", z.enum(["a", "b"]), "c", "Invalid enum value. Expected 'a' | 'b', received 'c'"],
    ["a wrong literal", z.literal("a"), "b", 'Invalid literal value, expected "a"'],
    ["an invalid email", z.string().email(), "x", "Invalid email"],
    ["an invalid datetime", z.string().datetime(), "x", "Invalid datetime"],
    ["an invalid url", z.string().url(), "x", "Invalid url"],
    ["a regex mismatch", z.string().regex(/^a$/), "b", "Invalid"],
    ["an unknown key", z.object({}).strict(), { a: 1 }, "Unrecognized key(s) in object: 'a'"],
    ["a failed refinement", z.string().refine(() => false), "a", "Invalid input"],
    ["no matching union member", z.union([z.string(), z.number()]), true, "Invalid input"],
  ])("keeps the message for %s", (_case, schema, input, expected) => {
    expect(messages(schema, input)).toEqual([expected]);
  });

  it("keeps the flattened shape with field and form errors", () => {
    const result = PatchIdeaRequestSchema.safeParse({ status: "lost" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten()).toEqual({
      formErrors: [],
      fieldErrors: { status: ["Invalid enum value. Expected 'open' | 'in_chat' | 'archived', received 'lost'"] },
    });
    expect(PatchIdeaRequestSchema.safeParse({}).error?.flatten()).toEqual({
      formErrors: ["At least one of text or status is required"],
      fieldErrors: {},
    });
  });
});
