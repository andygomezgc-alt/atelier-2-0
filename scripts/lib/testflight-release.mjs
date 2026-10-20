// Releases an uploaded iOS build to an external TestFlight group (the chefs' public link).
// `eas build --auto-submit` only reaches the internal group; the external group needs the
// build added and a beta review submission. Every step checks first, so a rerun is safe.

// External states where the build is already submitted, approved or available to testers.
const SUBMITTED = new Set(["WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW", "BETA_APPROVED", "IN_BETA_TESTING"]);

/** The review notes name the build ("This is build 9 of the existing application"); keep that number current. */
export function withBuildNumber(notes, buildNumber) {
  return notes.replace(/This is build \d+ of/, `This is build ${buildNumber} of`);
}

async function findBuild(api, appId, buildNumber, uploadedAfter) {
  const version = buildNumber ? `&filter[version]=${buildNumber}` : "";
  const res = await api(
    "GET",
    `/v1/builds?filter[app]=${appId}${version}&sort=-uploadedDate&limit=1&include=buildBetaDetail`
      + "&fields[builds]=version,processingState,uploadedDate&fields[buildBetaDetails]=externalBuildState",
  );
  const build = res.data[0];
  if (!build) return null;
  // Without a number, only a build uploaded after the given time is the new one.
  if (!buildNumber && Date.parse(build.attributes.uploadedDate) <= Date.parse(uploadedAfter)) return null;
  const detail = (res.included ?? []).find((item) => item.type === "buildBetaDetails");
  return {
    id: build.id,
    version: build.attributes.version,
    state: build.attributes.processingState,
    externalState: detail?.attributes.externalBuildState ?? null,
  };
}

export async function releaseToGroup({
  api, appId, buildNumber, uploadedAfter, group,
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollMs = 60_000,
  timeoutMs = 90 * 60_000,
}) {
  const deadline = Date.now() + timeoutMs;
  let build;
  for (;;) {
    build = await findBuild(api, appId, buildNumber, uploadedAfter);
    if (build?.state === "VALID") break;
    if (build && build.state !== "PROCESSING") throw new Error(`Build ${build.version} is ${build.state} in App Store Connect`);
    if (Date.now() >= deadline) throw new Error(`Build ${buildNumber ?? "(new)"} not processed by Apple yet; run this again later`);
    log(build ? `Apple is processing build ${build.version}…` : "Waiting for the build to reach App Store Connect…");
    await sleep(pollMs);
  }
  log(`Build ${build.version} is processed.`);

  const groups = await api("GET", `/v1/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(group)}&fields[betaGroups]=name`);
  const groupId = groups.data.find((g) => g.attributes.name === group)?.id;
  if (!groupId) throw new Error(`TestFlight group "${group}" not found`);

  const review = await api("GET", `/v1/apps/${appId}/betaAppReviewDetail`);
  const notes = review.data.attributes.notes ?? "";
  const updated = withBuildNumber(notes, build.version);
  if (updated !== notes) {
    await api("PATCH", `/v1/betaAppReviewDetails/${review.data.id}`, {
      data: { type: "betaAppReviewDetails", id: review.data.id, attributes: { notes: updated } },
    });
    log(`Review notes now name build ${build.version}.`);
  }

  const groupBuilds = await api("GET", `/v1/betaGroups/${groupId}/builds?fields[builds]=version&limit=200`);
  if (!groupBuilds.data.some((b) => b.id === build.id)) {
    await api("POST", `/v1/betaGroups/${groupId}/relationships/builds`, { data: [{ type: "builds", id: build.id }] });
    log(`Build ${build.version} added to "${group}".`);
  }

  if (build.externalState === "READY_FOR_BETA_SUBMISSION") {
    await api("POST", "/v1/betaAppReviewSubmissions", {
      data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } },
    });
    log(`Build ${build.version} submitted for beta review.`);
    build = await findBuild(api, appId, build.version);
  } else if (!SUBMITTED.has(build.externalState)) {
    throw new Error(`Build ${build.version} cannot be submitted: external state ${build.externalState}`);
  }
  return { build: build.version, externalState: build.externalState };
}
