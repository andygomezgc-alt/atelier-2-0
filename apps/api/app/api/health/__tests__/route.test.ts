import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db } = vi.hoisted(() => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const PROBES = {
  anthropic: ["https://api.anthropic.com/v1/models?limit=1", { "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" }],
  gemini: ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": "gemini-test" }],
  zai: ["https://api.z.ai/api/paas/v4/models", { Authorization: "Bearer zai-test" }],
} as const;
type Provider = keyof typeof PROBES;

// Per provider host: answer 200, reject the key with 401, or fail on the network.
let answers: Map<string, "rejected" | "unreachable">;
const fetchMock = vi.fn(async (url: string) => {
  const answer = answers.get(new URL(url).host);
  if (answer === "unreachable") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  return new Response("{}", { status: answer === "rejected" ? 401 : 200 });
});
const hostOf = (provider: Provider) => new URL(PROBES[provider][0]).host;

async function health(query = "") {
  const { GET } = await import("../route");
  const res = await GET(new NextRequest(`http://localhost/api/health${query}`));
  return { status: res.status, body: await res.json() };
}

// Each test re-imports the route for a fresh verification cache; the first
// import transforms the whole dependency graph, so it is warmed up once here.
beforeAll(async () => { await import("../route"); }, 30_000);

beforeEach(() => {
  vi.resetModules();
  answers = new Map();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("GEMINI_API_KEY", "gemini-test");
  vi.stubEnv("ZAI_API_KEY", "zai-test");
  vi.stubEnv("RESEND_API_KEY", "");
  db.$queryRaw.mockReset().mockResolvedValue([{ ok: 1 }]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/health — AI keys", () => {
  it("reports ok only after each provider accepts its own key", async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    for (const provider of Object.keys(PROBES) as Provider[]) {
      expect(body.checks[provider].ok).toBe(true);
      const [url, headers] = PROBES[provider];
      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ headers }));
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["anthropic", "gemini", "zai"] as const)("reports degraded when %s rejects its key, without deep", async provider => {
    answers.set(hostOf(provider), "rejected");
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks[provider].ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/401|error/);
  });

  it("reports degraded when a provider does not answer in time", async () => {
    answers.set(hostOf("gemini"), "unreachable");
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.checks.gemini.ok).toBe(false);
  });

  it("reports a missing key as degraded without calling that provider", async () => {
    vi.stubEnv("ZAI_API_KEY", "");
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.checks.zai.ok).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).host === hostOf("zai"))).toBe(false);
  });

  it("reuses a recent verification, and deep=1 verifies again", async () => {
    await health();
    await health();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await health("?deep=1");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("verifies again once the five-minute window has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
    await health();
    answers.set(hostOf("anthropic"), "rejected");
    vi.setSystemTime(new Date("2026-10-23T10:04:59Z"));
    expect((await health()).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-23T10:05:01Z"));
    expect((await health()).status).toBe(503);
  });
});
