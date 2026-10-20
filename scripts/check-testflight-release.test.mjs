import test from "node:test";
import assert from "node:assert/strict";
import { releaseToGroup, withBuildNumber } from "./lib/testflight-release.mjs";

const NOTES = "Sign in with Apple or Google. This is build 9 of the existing application; Apple and Google sign-in are preserved.";

// In-memory App Store Connect: answers the paths the release uses and records every write.
function fakeAsc({ processing = ["VALID"], external = "READY_FOR_BETA_SUBMISSION", externals = null, inGroup = false, notes = NOTES, uploaded = "2026-10-20T07:02:52-07:00" } = {}) {
  const writes = [];
  const states = [...processing];
  const api = async (method, path, body) => {
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (path === "/v1/betaAppReviewSubmissions") external = "WAITING_FOR_BETA_REVIEW";
      if (path.startsWith("/v1/betaAppReviewDetails/")) notes = body.data.attributes.notes;
      return { data: {} };
    }
    if (path.startsWith("/v1/builds?")) {
      const state = states.length > 1 ? states.shift() : states[0];
      if (externals?.length) external = externals.shift();
      if (state === "MISSING") return { data: [] };
      return {
        data: [{ id: "build-21", attributes: { version: "21", processingState: state, uploadedDate: uploaded } }],
        included: [{ type: "buildBetaDetails", attributes: { externalBuildState: external } }],
      };
    }
    if (path.startsWith("/v1/betaGroups?")) return { data: [{ id: "group-chefs", attributes: { name: "Chefs" } }] };
    if (path.startsWith("/v1/betaGroups/group-chefs/builds")) return { data: inGroup ? [{ id: "build-21" }] : [] };
    if (path.endsWith("/betaAppReviewDetail")) return { data: { id: "review-1", attributes: { notes } } };
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { api, writes };
}
const quiet = { log: () => {}, sleep: async () => {} };

test("replaces the build number in the review notes, and leaves notes without one untouched", () => {
  assert.equal(withBuildNumber(NOTES, "21"), NOTES.replace("build 9 of", "build 21 of"));
  assert.equal(withBuildNumber("No build mentioned.", "21"), "No build mentioned.");
});

test("waits for processing, then updates the notes, adds the build to the group and submits it for beta review", async () => {
  const { api, writes } = fakeAsc({ processing: ["MISSING", "PROCESSING", "VALID"] });
  const result = await releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet });
  assert.deepEqual(writes.map((w) => `${w.method} ${w.path}`), [
    "PATCH /v1/betaAppReviewDetails/review-1",
    "POST /v1/betaGroups/group-chefs/relationships/builds",
    "POST /v1/betaAppReviewSubmissions",
  ]);
  assert.match(writes[0].body.data.attributes.notes, /This is build 21 of/);
  assert.deepEqual(writes[1].body, { data: [{ type: "builds", id: "build-21" }] });
  assert.deepEqual(writes[2].body.data.relationships.build.data, { type: "builds", id: "build-21" });
  assert.deepEqual(result, { build: "21", externalState: "WAITING_FOR_BETA_REVIEW" });
});

test("running it again on a released build writes nothing", async () => {
  const { api, writes } = fakeAsc({ inGroup: true, external: "IN_BETA_TESTING", notes: NOTES.replace("build 9", "build 21") });
  const result = await releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet });
  assert.deepEqual(writes, []);
  assert.equal(result.externalState, "IN_BETA_TESTING");
});

test("without a build number it takes the newest build uploaded after the given time", async () => {
  const { api, writes } = fakeAsc({ processing: ["VALID"] });
  await releaseToGroup({ api, appId: "app-1", uploadedAfter: "2026-10-20T13:00:00Z", group: "Chefs", ...quiet });
  assert.equal(writes.length, 3);
  const old = fakeAsc({ uploaded: "2026-10-16T08:58:02-07:00" });
  await assert.rejects(
    releaseToGroup({ api: old.api, appId: "app-1", uploadedAfter: "2026-10-20T13:00:00Z", group: "Chefs", ...quiet, timeoutMs: 0 }),
    /not processed/,
  );
  assert.deepEqual(old.writes, []);
});

test("keeps waiting while the build is still processing for external testers", async () => {
  const { api, writes } = fakeAsc({ externals: ["PROCESSING", "PROCESSING", "READY_FOR_BETA_SUBMISSION"] });
  const result = await releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet });
  assert.equal(writes.length, 3);
  assert.equal(result.externalState, "WAITING_FOR_BETA_REVIEW");
});

test("treats a build already ready for external testing as released", async () => {
  const { api, writes } = fakeAsc({ inGroup: true, external: "READY_FOR_BETA_TESTING", notes: NOTES.replace("build 9", "build 21") });
  const result = await releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet });
  assert.deepEqual(writes, []);
  assert.equal(result.externalState, "READY_FOR_BETA_TESTING");
});

test("refuses a build whose external state cannot be submitted, after adding it to the group", async () => {
  const { api, writes } = fakeAsc({ external: "MISSING_EXPORT_COMPLIANCE" });
  await assert.rejects(releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet }), /MISSING_EXPORT_COMPLIANCE/);
  assert.equal(writes.some((w) => w.path === "/v1/betaAppReviewSubmissions"), false);
});

test("stops without writing when Apple rejects the processed build", async () => {
  const { api, writes } = fakeAsc({ processing: ["INVALID"] });
  await assert.rejects(releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Chefs", ...quiet }), /INVALID/);
  assert.deepEqual(writes, []);
});

test("fails clearly when the tester group does not exist", async () => {
  const { api } = fakeAsc();
  await assert.rejects(releaseToGroup({ api, appId: "app-1", buildNumber: "21", group: "Nadie", ...quiet }), /Nadie/);
});
