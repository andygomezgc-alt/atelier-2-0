# Restaurant photo in Casa

Let administrators add or replace the restaurant photo directly from the existing Casa avatar. Everyone on the team sees the saved image; the restaurant initial remains the fallback.

## Intent and authorized scope
User requested this feature on 2026-10-05 and explicitly assigned implementation to Sol with high reasoning. Root plans, supervises and verifies; Sol writes code.
The existing Restaurant.photoUrl, GET projection and admin-only POST /api/restaurant/photo already cover persistence. Reuse them without schema/API changes, new screens, geolocation, photo deletion controls, or new dependencies.
Use the existing native gallery and expo-file-system/legacy multipart pattern. Keep gallery cancellation silent, handle permission/upload failures, retain the current photo on failure, and refresh restaurant data after success.
No production calls, blob uploads to real accounts, push, pull request, merge or deployment are authorized.

## Route and recovery
- Route: delegated direct; multiple non-trivial files and preparatory reading require one Sol-high writer.
- Feature branch: codex/restaurant-photo, based on main c646c86917401c0685a45d2f9a1ea3c28abd6a26 in an isolated managed worktree.
- Locale feature remains separate in codex/device-language-default; do not edit its checkout or task document.
- Strict TDD: enabled by workspace AGENTS.md; Vitest runners from mobile and @atelier/i18n package scripts. Observe assertion RED before production edits, then GREEN and REFACTOR.
- Delivery: ask-on-risk; forecast 220-340 authored changed lines including tests and this document. Running count: 0. About 400 per work unit is a planning heuristic, not permission to omit tests or compress code. Ask parent before committing if accumulated delivery count exceeds 400.
- RDD: on globally; each candidate requires native assessment and its own user consent when requested. Prior locale consent does not apply.
- Task mirror: odd/restaurant-photo/tasks, project atelier-2-0.

## Work unit
- [x] RP1 — Connect Casa restaurant photo display and administrator gallery upload, with translations and regression tests.
  - Route: delegated; target UI, upload helper and three translation dictionaries plus tests.
  - Expected files: apps/mobile/app/(tabs)/casa.tsx, apps/mobile/src/api/auth.ts, packages/i18n/src/es.ts, it.ts, en.ts, and focused mobile tests; a small isolated component/helper is allowed only if it improves testability without unrelated refactoring.
  - Acceptance: stored photo is shown; missing/unloadable photo falls back to initial; only administrators can edit; tap target and labels are accessible; loading prevents duplicate uploads; cancellation does not upload; successful save refreshes visible data; errors preserve existing image and show localized feedback.
  - Transport: existing endpoint, multipart field, Bearer token, MIME/size validation and native upload behavior remain consistent with the existing server and profile-photo pattern.
  - Checks: behavioral focused Vitest commands recorded by writer; pnpm --filter mobile test; pnpm --filter @atelier/i18n test; pnpm --filter mobile typecheck; pnpm --filter @atelier/i18n typecheck; git diff --check; graphify update . after source changes.
  - RED: `pnpm --filter mobile exec vitest run src/__tests__/restaurant-photo.test.ts src/api/__tests__/restaurant-photo.test.ts` failed 8/8 assertions before production edits (missing hero image/action and missing transport helper).
  - GREEN: the same focused command passed 9/9 after implementation and refactor. The success test simulates a refreshed restaurant response and asserts that Casa renders its new photo URL, not only that `reload()` was called. `pnpm --filter mobile test`: 195/195 passed; `pnpm --filter @atelier/i18n test`: 5/5 passed; both package typechecks passed.
  - Native runtime harness: rendered Casa interactions and mocked gallery, auth token and multipart upload passed. Real Android/iOS gallery and Blob upload remain untested without an authorized device and account.
  - Graph and hygiene: `graphify update .` passed (3390 nodes, 7559 edges); `git diff --check` passed. Existing backend/schema and dependencies were not changed.
  - Rollback boundary: revert Casa avatar interaction, the mobile upload helper, five translation keys in each dictionary, and their two focused tests; the pre-existing backend and saved photos remain intact.
  - Commit identity: 8159490 (feature), 849c581 (merge of main), 702e3c5 (test fix: mock expo-localization, needed after device-language-default landed on main).
  - Re-verified on 2026-10-11 after merging main: `pnpm --filter mobile test` 443/443, `pnpm --filter @atelier/i18n test` 41/41, both typechecks and `git diff --check` passed.
  - RDD outcome: high risk (auth.ts hot path); user granted consent; four-lens review approved and acknowledged (lineage review-74f5071dd6d68207). Twelve non-blocking advisory findings; the main one, a failed reload after a successful upload reported as a failed save (casa.tsx:226-229), is follow-up work.

- [x] RP2 — A failed refresh after a successful upload no longer reports the photo as not saved.
  - Route: direct inline; one-line guard in apps/mobile/app/(tabs)/casa.tsx plus one test. Follow-up to the RP1 advisory finding (R2/R3/R4 reload-failure-misreported).
  - Note: today useRestaurant().reload never rejects (it catches and switches Casa to NetworkError), so the misreport could not happen yet; the guard keeps the save error tied to the upload if that contract changes.
  - RED: `pnpm --filter mobile exec vitest run src/__tests__/restaurant-photo.test.ts` failed 1/8 (toast called with casa_photo_upload_failed after a rejected reload).
  - GREEN: same command 8/8; `pnpm --filter mobile test` 444/444; mobile typecheck and `git diff --check` passed.

## Progress and next step
RP1 merged in PR #27. RP2 committed on fix/restaurant-photo-reload; next: pull request to main and merge after CI.
