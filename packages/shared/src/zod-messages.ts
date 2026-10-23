import { z } from "zod";

// Zod 4 reworded its default messages. API 400 bodies (`error.flatten()`,
// `issues`) keep the Zod 3 wording, so the upgrade changes nothing clients
// read. Messages set on a schema still win over this map.

function receivedType(input: unknown): string {
  if (input === null) return "null";
  if (Array.isArray(input)) return "array";
  if (typeof input === "number" && Number.isNaN(input)) return "nan";
  if (input instanceof Date) return "date";
  return typeof input;
}

const quoted = (values: readonly unknown[], separator: string) =>
  values.map((value) => (typeof value === "string" ? `'${value}'` : String(value))).join(separator);

const ZOD3_EXPECTED: Record<string, string> = { int: "integer", record: "object", tuple: "array" };

export function zod3Message(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined) return "Required";
      const received = issue.expected === "int" && typeof issue.input === "number" ? "float" : receivedType(issue.input);
      return `Expected ${ZOD3_EXPECTED[issue.expected] ?? issue.expected}, received ${received}`;
    }
    case "too_small": {
      const { exact, inclusive, minimum } = issue;
      if (issue.origin === "array") return `Array must contain ${exact ? "exactly" : inclusive ? "at least" : "more than"} ${minimum} element(s)`;
      if (issue.origin === "string") return `String must contain ${exact ? "exactly" : inclusive ? "at least" : "over"} ${minimum} character(s)`;
      if (issue.origin === "number" || issue.origin === "int") return `Number must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${minimum}`;
      return undefined;
    }
    case "too_big": {
      const { exact, inclusive, maximum } = issue;
      if (issue.origin === "array") return `Array must contain ${exact ? "exactly" : inclusive ? "at most" : "less than"} ${maximum} element(s)`;
      if (issue.origin === "string") return `String must contain ${exact ? "exactly" : inclusive ? "at most" : "under"} ${maximum} character(s)`;
      if (issue.origin === "number" || issue.origin === "int") return `Number must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
      return undefined;
    }
    case "invalid_format":
      if (issue.format === "regex") return "Invalid";
      if (["starts_with", "ends_with", "includes"].includes(issue.format)) return undefined;
      return `Invalid ${issue.format}`;
    case "invalid_value": {
      const def = issue.inst?._zod.def as { type?: string } | undefined;
      if (def?.type === "literal") return `Invalid literal value, expected ${JSON.stringify(issue.values[0])}`;
      if (issue.input === undefined) return "Required";
      if (typeof issue.input !== "string") return `Expected ${quoted(issue.values, " | ")}, received ${receivedType(issue.input)}`;
      return `Invalid enum value. Expected ${quoted(issue.values, " | ")}, received '${issue.input}'`;
    }
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${quoted(issue.keys, ", ")}`;
    case "not_multiple_of":
      return `Number must be a multiple of ${issue.divisor}`;
    case "invalid_key":
      // Zod 3 reported the key schema's own issue at the key's path.
      return issue.issues[0]?.message;
    default:
      // custom and invalid_union already read "Invalid input" in both versions.
      return undefined;
  }
}

z.config({ customError: zod3Message });
