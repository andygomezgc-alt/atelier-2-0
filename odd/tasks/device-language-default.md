# Device language on first launch

Use the first supported device language (Italian, Spanish, English), with Italian when none is supported. Saved account language always wins after sign-in.

## Objective and authorized scope
The user approved this implementation on 2026-10-05. Avoid Spanish-only first-launch screens and new-account language resets, without extra screens, location permissions, or chef decisions.
Scope: mobile bootstrap/config/dependency and auth request hints; Google, Apple and mobile magic-link new-account creation; focused regression tests.
Do not overwrite existing account language, migrate existing users, change unrelated web auth, deploy, push, or publish builds.

## Execution
- Route: delegated direct; two meaningful implementation steps and multiple non-trivial files trigger a single bounded writer.
- Strict TDD: enabled by workspace AGENTS.md; observed RED -> GREEN -> REFACTOR required for each behavior.
- Runner: pnpm 9.15.0 / Vitest; existing mobile and API test scripts.
- Branch: codex/device-language-default; branch point `c646c86917401c0685a45d2f9a1ea3c28abd6a26`.
- Delivery: ask-on-risk; forecast 180-350 authored added/deleted lines excluding generated lock/graph files. Current T1 working diff: approximately 158 authored lines before this evidence update; no work-unit commit yet.
- RDD: on (global); parent assesses each work-unit commit against last reviewed boundary. Consent belongs to user.
- New native app binaries are required for expo-localization; cloud builds and release remain pending separate authorization.

## Tasks
- [x] T1 — Detect the first supported device language on startup, fall back to Italian, preserve saved profile precedence, and include the resolved device-language hint in mobile auth requests. Add regression coverage and compatible Expo localization configuration/dependency.
  - Route: delegated (new locale logic, native config, transport and tests).
  - Acceptance: ordered preferences and regional variants work; empty/unsupported/error returns Italian; existing profile override still works; no geolocation.
  - Checks: focused mobile locale and auth-transport tests; pnpm --filter mobile test; pnpm --filter mobile typecheck; git diff --check.
  - Verification: initial focused RED observed before production edits (missing locale module and sign-out locale assertion); after fixing native-test mocks, a baseline replay of the original auth transport produced three missing-hint assertion failures. Focused GREEN: 17/17. Full mobile suite: 194/194; mobile typecheck and `git diff --check`: pass. Static Expo config exposes one `expo-localization` plugin with `it`, `es`, `en` supported locales.
  - Runtime harness: mocked Expo `getLocales` verifies ordered preferences, regional tags, null/empty/unsupported/error fallback; mocked API transport verifies magic-link, Google and Apple request bodies; mocked auth bootstrap verifies saved-profile override and sign-out reset. Actual Android/iOS behavior remains unverified until a native rebuild.
  - Rollback: remove the localization module/dependency/plugin and revert mobile hook/auth transport and their tests; no backend or database changes in T1.
  - Commit/evidence: parent spot-check passed 17/17 focused tests and git diff --check; work-unit commit follows this checked snapshot.
- [ ] T2 — Apply validated hints only when Google, Apple or mobile magic-link sign-in creates an account. Preserve current behavior for existing users and clients without the hint unless Italian fallback is explicitly needed for a new mobile account.
  - Route: delegated (three auth entry points, shared resolver and tests).
  - Acceptance: Italian/Spanish/English new accounts match requested locale; existing accounts cannot be overwritten; malformed inputs handled through existing validation; legacy clients remain compatible.
  - Checks: pnpm --filter api exec vitest run lib/__tests__/oauth-identity.test.ts app/api/mobile/auth/__tests__/auth-flow.test.ts; pnpm --filter api test; pnpm --filter api typecheck; pnpm --filter mobile test; pnpm --filter mobile typecheck; git diff --check.
  - Commit/evidence: pending.

## Verification and release
- Functional runtime boundary: locale -> auth payload -> new-account creation -> saved profile locale. Cover with mocked native/client/route tests; actual Android/iOS device smoke test remains pending a native build.
- Run graphify update . after source changes; generated graph artifacts are not authored-line budget.
- Normalize before verification/review freeze; do not mutate reviewed source bytes.
- Rollback: revert these work-unit commits and dependency/config changes; existing users and database schema are untouched.
- Final source/types/tests, line count, commit identities and RDD outcomes must be recorded before closing.
- T1 source and checks complete; parent commit and native RDD assessment pending. T2 is authorized by the user and unstarted, awaiting parent dispatch.

