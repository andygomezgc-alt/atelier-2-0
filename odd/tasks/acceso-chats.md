# Acceso a chats — alinear borrar, detener e importar con la regla de visibilidad

- **Rama:** `feat/acceso-chats`, apilada sobre `feat/ideas-privadas` (505d21a; el PR #31 sigue abierto), worktree `.claude/worktrees/acceso-chats`
- **Espejo Engram:** `odd/acceso-chats/tasks`
- **Origen:** hallazgo no bloqueante de la revisión RDD del PR #31. Pedido de Andy del 12-10-2026.

## Objetivo
Que `DELETE /api/conversations/[id]`, `POST /api/conversations/[id]/messages/stop` y `POST /api/conversations/[id]/messages/bulk` usen `canAccessConversation` (`apps/api/lib/conversation-access.ts`) igual que el resto de las rutas de chat.

## Problema
Las tres rutas siguen con la comprobación vieja `conv.authorId !== ctx.userId && ctx.role !== "admin"` → 403:
- Un compañero recibe 403 en vez de 404 en un chat privado ajeno, lo que confirma que el chat existe.
- El autor de una idea, en un chat viejo que abrió un compañero, puede leer y escribir pero no puede detener una generación, borrar el chat ni importar en él.

## Decisiones (de Andy, 12-10-2026)
- **Borrar un chat compartido (sin idea):** sigue reservado al autor del chat o a un admin; el compañero que lo ve recibe 403 (no filtra nada, ya lo ve).
- **Borrar un chat nacido de una idea:** sigue la visibilidad (autor del chat, autor de la idea o admin); el resto, 404.
- **Detener e importar:** siguen la visibilidad en los dos tipos de chat (un compañero puede detener o importar en un chat compartido).
- Lo que no se ve responde 404 `{ error: "Not found" }`, igual que el anti-IDOR actual.

## Alcance autorizado
Las tres rutas y sus pruebas. Fuera de alcance: cambiar `canAccessConversation`, la app móvil, otras rutas.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled", y el pedido), runner `vitest run` (`pnpm --filter api test`), tipos con `pnpm --filter api typecheck`.
- Commits Conventional Commits, sin Co-Authored-By. Push y PR quedan para Andy salvo su regla de git al terminar.
- Previsión de tamaño: ~200 líneas en total → estrategia de entrega `ask-on-risk`, sin cortes.

## Tareas
| ID | Tarea | Ruta | Motivo |
|---|---|---|---|
| A1 | Detener (`messages/stop`) sigue la visibilidad | Delegada (Opus) | Disparador de escritor: 3 rutas + 3 archivos de prueba no triviales, control de acceso |
| A2 | Importar (`messages/bulk`) sigue la visibilidad | Delegada (Opus) | Mismo escritor |
| A3 | Borrar (`DELETE /api/conversations/[id]`): visibilidad + compartido solo autor o admin | Delegada (Opus) | Mismo escritor, prueba nueva |

- [x] A1 — `stop`: 404 si `!canAccessConversation`; compañero en chat compartido → 204; autor de la idea en chat viejo de otro → 204. Actualizar la matriz de `lifecycle.test.ts`.
  - Commit `6453986`.
- [x] A2 — `bulk`: 404 si `!canAccessConversation`; compañero en chat compartido → importa; autor de la idea en chat viejo de otro → importa. Actualizar el caso "author or admin" de `bulk.test.ts`.
  - Commit `978f79c`.
- [x] A3 — `DELETE`: 404 si `!canAccessConversation`; chat compartido y ni autor ni admin → 403; autor de la idea en chat viejo de otro → 204. Prueba nueva de la ruta.
  - Commit `6bb2e36`. Prueba nueva `apps/api/app/api/conversations/[id]/__tests__/route.test.ts` (no existía prueba del DELETE).

### Evidencia (A1–A3, un solo escritor delegado, Opus)
- RED observado por el padre con las rutas sin tocar (`npx vitest run app/api/conversations`): 3 archivos fallan, **10 fallos / 191 pasan**, todos aserciones de estado contra el chequeo viejo (`expected 403 to be 204`, `expected 403 to be 404`, `expected 403 to be 200`).
- GREEN verificado por el padre: `pnpm --filter api test` **101 archivos / 1253 pruebas** en verde (exit 0); `pnpm --filter api typecheck` exit 0.
- Rutas: +13/−12 líneas. Total de la rama: 209 líneas en 6 archivos.
- RDD assess (base `505d21a`, solo commits, documento excluido): `medium`, `under_budget`.

## Criterios de aceptación
- RED observado antes de tocar las rutas, por la razón correcta.
- `pnpm --filter api test` y `pnpm --filter api typecheck` en verde.

## Progreso
- 12-10-2026: decisión de Andy registrada; documento creado.
- 12-10-2026: A1–A3 hechas (RED → GREEN), tres commits de unidad de trabajo.
- 12-10-2026: preflight RDD del slice (base `505d21a`, linaje `review-b4e85fc811195d80`): START pidió consentimiento (riesgo medio); la pregunta se cortó al terminar la sesión y quedó **sin respuesta** → candidato sin revisar.
- 12-10-2026: el PR #31 se fusionó en `main` (`15d2c42`, contiene `505d21a`); Andy pidió crear el PR de esta rama contra `main`.

- 12-10-2026: PR #33 abierto contra `main`; CI (`verify`, `dependency-scan`) en verde.
- 12-10-2026: revisión RDD consentida por Andy (linaje `review-4045951db1301eaf`, lente `review-reliability`). Dos intentos fallaron por el entorno (crash de Bun en `claude.exe`, sesión OAuth vencida); tras el nuevo login, **aprobada sin hallazgos** y reconocida (autoridad quemada). Frontera revisada: `0f8b992` (árbol del candidato).

## Próximo paso
Fusionar el PR #33 (decisión de Andy).
