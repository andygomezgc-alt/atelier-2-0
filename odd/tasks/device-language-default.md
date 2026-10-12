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
- Branch: codex/device-language-default (T1, merged); branch point `c646c86917401c0685a45d2f9a1ea3c28abd6a26`. T2: `feat/idioma-cuentas-nuevas` from `main` `d3d797f`, worktree `.claude/worktrees/idioma-cuentas`.
- Delivery: ask-on-risk; forecast 180-350 authored added/deleted lines excluding generated lock/graph files. T1 work-unit authored count: 190 lines (212 total minus 22 generated lock lines); tracking updates counted at final closure.
- RDD: on (global). T1 high/auth risk, user granted, four native lenses approved; exact acknowledgement burned review-aa4f70c2885a323c. Last reviewed boundary: 98d359f0b488ef4657c430c1ebb7fa9c044a1d2a. Consent remains candidate-scoped. T2 base for assessment: `d3d797f`.
- New native app binaries are required for expo-localization; cloud builds and release remain pending separate authorization.

## Tasks
- [x] T1 — Detect the first supported device language on startup, fall back to Italian, preserve saved profile precedence, and include the resolved device-language hint in mobile auth requests. Add regression coverage and compatible Expo localization configuration/dependency.
  - Route: delegated (new locale logic, native config, transport and tests).
  - Acceptance: ordered preferences and regional variants work; empty/unsupported/error returns Italian; existing profile override still works; no geolocation.
  - Checks: focused mobile locale and auth-transport tests; pnpm --filter mobile test; pnpm --filter mobile typecheck; git diff --check.
  - Verification: initial focused RED observed before production edits (missing locale module and sign-out locale assertion); after fixing native-test mocks, a baseline replay of the original auth transport produced three missing-hint assertion failures. Focused GREEN: 17/17. Full mobile suite: 194/194; mobile typecheck and `git diff --check`: pass. Static Expo config exposes one `expo-localization` plugin with `it`, `es`, `en` supported locales.
  - Runtime harness: mocked Expo `getLocales` verifies ordered preferences, regional tags, null/empty/unsupported/error fallback; mocked API transport verifies magic-link, Google and Apple request bodies; mocked auth bootstrap verifies saved-profile override and sign-out reset. Actual Android/iOS behavior remains unverified until a native rebuild.
  - Rollback: remove the localization module/dependency/plugin and revert mobile hook/auth transport and their tests; no backend or database changes in T1.
  - Commit/evidence: 580e31799ff57fb367a0e2cf899d9cf44acc8d67 — feat(mobile): select device language with Italian fallback. Parent spot-check: 17/17 and working-tree diff check passed. Staging exposed a trailing blank line in this new task document; removed in the tracking commit before review.
- [x] T2 — Apply validated hints only when Google, Apple or mobile magic-link sign-in creates an account. Preserve current behavior for existing users and legacy clients without the hint; the new mobile client always sends its detected language or Italian fallback.
  - Route: delegated (three auth entry points, shared resolver and tests).
  - Acceptance: Italian/Spanish/English new accounts match requested locale; existing accounts cannot be overwritten; malformed inputs handled through existing validation; legacy clients remain compatible.
  - Checks: pnpm --filter api exec vitest run lib/__tests__/oauth-identity.test.ts app/api/mobile/auth/__tests__/auth-flow.test.ts; pnpm --filter api test; pnpm --filter api typecheck; pnpm --filter mobile test; pnpm --filter mobile typecheck; git diff --check.
  - Route taken: delegated to one writer (Opus); trigger: writer (4 production files + 4 test files, auth). Parent observed RED and GREEN.
  - Invalid-hint rule: an unsupported or malformed `languagePref` is ignored (account created with the schema default), never rejected, matching the permissive hand validation of the three routes. Parsing uses the existing `LanguageSchema` from `@atelier/shared`; `verify` sets it only in the upsert `create` branch.
  - Verification: RED observed by the parent before production edits: 12 failed / 44 passed (`expected undefined to be 'it'|'es'|'en'`, Apple resolver call missing `languagePref`); `pnpm --filter api typecheck` also failed only on the 4 new `TS2353` test usages. GREEN observed by the parent: `pnpm --filter api test` 104 files / 1317 tests; `pnpm --filter api typecheck` 0; `pnpm --filter mobile test` 0; `pnpm --filter mobile typecheck` 0; `git diff --check` 0 (writer).
  - Coverage: new Google route test (did not exist); resolver, Apple route and magic-link `verify` cases for new account with hint, existing account with a different hint (unchanged), no hint (legacy), invalid hint (`"fr"`, `123`, `""`, `null`, object).
  - Size: production +17/−1; tests ~412 lines. Graph not refreshed: `graphify-out/` lives untracked in the main checkout, not in this worktree.
  - Commit/evidence: recorded in the PR (this document ships in the same work-unit commit).

## Verification and release
- Functional runtime boundary: locale -> auth payload -> new-account creation -> saved profile locale. Cover with mocked native/client/route tests; actual Android/iOS device smoke test remains pending a native build.
- Run graphify update . after source changes; generated graph artifacts are not authored-line budget.
- Normalize before verification/review freeze; do not mutate reviewed source bytes.
- Rollback: revert these work-unit commits and dependency/config changes; existing users and database schema are untouched.
- Final source/types/tests, line count, commit identities and RDD outcomes must be recorded before closing.
- T1 reviewed and closed; non-blocking T1 advisory R2-supported-language-drift: native config and runtime allowlist must stay synchronized if languages change; no correction requested.
- 2026-10-12: Andy asked to do T2. Document reconciled with the newer Engram mirror. Finding: the API never reads `languagePref` from the auth bodies today, so every new account gets the schema default `es`. Users are only created at sign-in (`oauth-identity.ts` create; magic-link `verify` upsert; `dev-login` is out of scope). T2 dispatched to one delegated writer (Opus, auth risk), strict TDD.
