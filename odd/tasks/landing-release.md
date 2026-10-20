# Atelier landing release
Objective: publish the approved landing and optional tutorial without reverting newer production changes.
Branch: codex/landing-guided-tour. Delivery: exception-ok, user-authorized direct main publication, no PR. Runner: API Vitest, typecheck, production build, public HTTP/browser checks.

## Specs
- S1: The user answered "te autorizo" to using the saved local Git session to integrate the landing with the current version, create commits and push main of andygomezgc-alt/atelier-2-0 without overwriting recent changes. Publish through the existing Git-linked Atelier Vercel project. No force push or unrelated configuration/database changes.
- S2: Preserve the approved short landing and original animation as an optional tutorial. User: "tu dices de quitar la animacion de la app? por que si propones eso estoy de acuerdo pero me gustaria dejarla como un tutorial de como es la app que opinas?" Preserve ES/IT/EN, business contact, pricing and legal routes.
- S3: Preserve newer main changes, including its self-hosted Crimson Pro font fix. Integrate shared font loading for the landing and tutorial; retain font-file validation. Applicable checks: focused landing/playback/Prisma tests, full API suite, typecheck and production build.
- S4: Confirm the deployed main source and Ready status, then verify the public localized landing/tutorial, contact/legal links and health endpoint without triggering account mutations or payments.

## Tasks
- T1 [S1,S2] inline — completed: preserve reviewed work units; commits efd31d5 (landing) and c3b95d2 (Prisma checker). Existing native review approved and acknowledged before these commits.
- T2 [S1,S3] inline — completed, merge commit pending: merged origin/main 3c42306, preserved local fonts, resolved one component conflict. No writer trigger: one understood font-integration behavior. Risk: item 5, build/deployment integration.
- T3 [S2,S3] delegated verification — completed: focused 20 tests, full 147 files/2038 tests, typecheck/build/postbuild/diffcheck pass. Independent integration audit PASS 11 assertion groups; parent reran its exact probe. Trigger: large release checks and named risk item 5.
- T4 [S1,S3] inline native assessment — pending: assess integrated candidate; only enter a new native review if due, with candidate consent. Do not reuse burned authority for changed bytes.
- T5 [S1] inline — pending: normal fast-forward main push and observe Vercel deployment. Commit identity pending.
- T6 [S2,S4] inline — pending: public HTTP/browser verification and completion evidence.

## Log
- L1 User request: "te autorizo". Accepted prompt: "¿Me autorizás también a usar la sesión de Git guardada en esta PC para integrar la landing con la versión actual, crear los commits y hacer push a main de andygomezgc-alt/atelier-2-0, sin sobrescribir los cambios recientes?"
- L2 Fetched authorized origin/main: 3c423061ad4b3c2c2cad995044974e9f646d22a5, matching observed Vercel production. Original source branch base was 477869b. Main has 47 newer files; all mobile/i18n/db files currently match origin/main during merge.
- L3 Saved reviewed landing as one cohesive 719-line source unit efd31d5 (splitting its route/controller/markup would create incomplete intermediate behavior); saved independently revertible 128-line checker fix c3b95d2. No PR is being created, so no oversized PR exception is inferred.
- L4 Merge is paused with one conflict in pilot-landing.tsx: main inlined local-font setup while the approved landing extracts shared font setup. Keep the approved component and move main's exact local-font configuration into landing-font.ts. Adapt the existing font-file guard to inspect that helper, without weakening WOFF2/OFL validation.
- L5 Existing proof before integration: 2036 API tests, typecheck/build, independent 14 checker scenarios, native readability/reliability approval acknowledged and burned. Integrated bytes require new functional proof; publication has not happened.
- L6 RED observed: the shared-font guard failed because landing-font.ts still imported next/font/google. Moved the exact current-main local font paths, weights, styles and fallback into that shared helper; kept WOFF2 magic and license validation in the adapted test. The component now retains the approved landing without duplicate font setup.
- L7 GREEN integrated checks: 147 API files/2038 tests, typecheck, production build, Prisma checker (82 API manifests), and diffcheck against origin/main all exit 0. Non-fatal build warning: OpenTelemetry/Sentry dynamic require in unchanged logger code. Inherited OFL license trailing whitespace is identical to main and was not modified.
- L8 Independent verification PASS: 11 assertion groups, source/staged hashes unchanged. Twelve previously reviewed source blobs retain parity; local font configuration exactly matches production. Mobile/i18n/db/config/lockfile/font binaries identical to main. Public production and push remain pending. External evidence: TEMP/atelier-landing-checks-20261020-160404 and TEMP/atelier-landing-integration-verify-h089h8.
