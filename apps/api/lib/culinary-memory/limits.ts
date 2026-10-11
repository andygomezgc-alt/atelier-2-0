const DAY = 24 * 60 * 60 * 1000;

/** Consecutive identical deterministic input failures before a paid call is suspended. */
export const MEMORY_FAILURE_SUSPENSION_THRESHOLD = 2;
/** A suspension ends after this long even when the input is unchanged. */
export const MEMORY_SUPPRESSION_EXPIRY_MS = 28 * DAY;
/** Consecutive discarded paid runs that get a prompt retry before the weekly cadence. */
export const MEMORY_DISCARD_RETRY_LIMIT = 2;
/** Maximum serialized provider payload, shared by evidence trimming and the provider guard. */
export const MEMORY_PAYLOAD_CHAR_LIMIT = 20_000;
/** Bump when the prompt or parser changes so earlier failures stop suppressing. */
export const MEMORY_PROMPT_VERSION = "2026-10-07.1";
