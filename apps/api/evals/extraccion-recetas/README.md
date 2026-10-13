# Recipe extraction bench

Checks that every way a recipe comes in (the assistant's «Guardar como receta», a PDF/DOCX/Google Doc, a photo) ends in the standard ingredient format after `lib/recipes/extraction-pipeline.ts`.

## Run it

| Mode | Command | Cost |
|---|---|---|
| A — recorded outputs (default) | `pnpm -C apps/api eval:extraccion` | Offline, no AI call |
| B — live GLM | `EVAL_LIVE=1 pnpm -C apps/api eval:extraccion` | One paid GLM call per fixture (5 in total) |

- Mode A also runs inside `pnpm -C apps/api test`, through `checks.test.ts`.
- Mode B calls the real `extractRecipeFromText` with the fixture's prompt (`chat` or `document`). It needs `ZAI_API_KEY` in the environment; only the AI budget is mocked, so nothing touches the database. It prints each model output, ready to be pasted into `fixtures.ts` as a new recorded variant.

## Fixtures

| Id | Input | Recorded variants |
|---|---|---|
| `chat-calamar` | The production assistant message (`CHEF: …\nASISTENTE: …`) with **Tripa**, **Aceite de chorizo** and **Farsa** | `flattened` (the real bad GLM output, «40 g AOVE (aceite de chorizo)»), `markdown`, `objects` |
| `documento-albondigas` | Spanish document: tablespoons, cl, ½, a range, «Para la salsa:» | `copied`, `objects`, `looseObjects` |
| `ricetta-zucchine` | Italian recipe with pieces and a weight per piece, q.b., «Per la besciamella:» | `copied`, `objects` |
| `foto-ocr-bizcocho` | Text as OCR reads a photographed card | `copied`, `objects` |
| `ricetta-torta-salata` | Italian recipe with q.b., «2 uova», «1 bustina», headers without a colon | `copied`, `objects`, `looseObjects` |

## What is checked (`checks.ts`)

- Every line is measured, or its note keeps the original measure («pan rallado, 2 cucharadas»).
- No preparation inside a product name, as a parenthetical or a suffix.
- The expected sections, in order.
- Each expected line: display text, section, linked product and piece weight; probable matches; products that must never be offered (AOVE is never Chorizo).

Add a fixture by appending to `FIXTURES` in `fixtures.ts` with its input, at least one recorded output and the expected lines.
