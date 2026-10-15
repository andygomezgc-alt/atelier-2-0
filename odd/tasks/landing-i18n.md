# Landing i18n (es / it / en)

Objective: serve the pilot landing in Italian, Spanish and English, with the language picked from the visitor's IP country and a visible selector.
Branch: `feat/landing-i18n` (from `origin/main` 368614a). Delivery: ask-on-risk, single PR. Test runner: vitest (`apps/api`).

## Specs

- **S1** Italian and English versions of the landing, alongside Spanish. User: «la landing esta solo en español, recuerda que atelier la vendemos como una app italiana, entonces hacer una version en italiano y ingles».
- **S2** Language from the visitor's IP. User: «dependiendo de la ip de la persona se detecta y te pone el idioma». Browser language is NOT used: «no tomare tu recomendacion de que salga del idiona del navegador».
- **S3** Chosen option «IP + selector (Recomendado)»: «El idioma sale del país de la IP: Italia → italiano, España y Latinoamérica → español, resto → inglés. Además hay un selector IT · ES · EN y cada idioma tiene su dirección (/it, /es, /en), así Google indexa los tres.» The selector choice is remembered (cookie) and wins over the IP on `/`.
- **S4** (assumption) With no country header at all (local dev, unknown), `/` goes to Italian, the brand's home market.
- **S5** (assumption) The phone mockup shows the app's real UI labels per language (`packages/i18n` es/it/en); legal pages (/privacidad, /terminos) stay Spanish-only.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S2 S3 S4 | inline | done | RED: landing-locale.test.ts failed to load the missing module; GREEN 6/6 |
| T2 | S1 S5 | delegated (context backstop: parent >150k) | done | writer: 19/19 landing tests; new source checks RED before the component change |
| T3 | S1-S5 | inline | done | tsc clean; vitest 1658 passed (leave.test.ts load flake only); next build OK (/it /es /en static, / dynamic); curl: no country → /it, ES/MX → /es, IT → /it, US → /en, cookie en wins over IT, /xx 404; hreflang it/es/en/x-default; screenshots /it 1440px, /en 375px |

- T1: `lib/landing-locale.ts` (locale list, country → locale, cookie), `/` redirect, `app/[lang]/page.tsx` with hreflang metadata, language selector component.
- T2: move all landing copy into an es/it/en dictionary; `PilotLanding` and `LandingStory` take `locale`.
- T3: tests, `next build`, browser check of /it /es /en and the `/` redirect; commit, push, PR.

## Log

- **L1** (2026-10-15) User: «espera un momento, estuve leyendo y la landing esta solo en español, recuerda que atelier la vendemos como una app italiana, entonces hacer una version en italiano y ingles y lo mas importante era preguntarte si dependiendo de la ip de la persona se detecta y te pone el idioma»
- **L2** (2026-10-15) User: «no tomare tu recomendacion de que salga del idiona del navegador y lo demas». Clarified by question; answer: «IP + selector (Recomendado)».
- **L3** PR #58 (docs for ateliercocina.com) left unmerged: the user interrupted the merge to raise this request.
