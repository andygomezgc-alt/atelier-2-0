/**
 * Simple in-memory rate limiter (fixed window).
 *
 * NOTE: state is per-process. In serverless (Vercel) the limit is per-lambda
 * instance, NOT global across the fleet. For brute-force prevention against
 * invite-code guessing this is still effective: an attacker is throttled per
 * warm container, and cold-starts are slow enough to dominate cost.
 *
 * If you need a global limit, swap the backing Map for Redis/Upstash.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  if (existing.count >= opts.max) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true };
}
