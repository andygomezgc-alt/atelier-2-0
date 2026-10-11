# Ideas privadas — el bloc de ideas pasa a ser personal

- **Rama:** `feat/ideas-privadas` (sale de `main` 3cc6ff2), worktree `.claude/worktrees/ideas-privadas`
- **Espejo Engram:** `odd/ideas-privadas/tasks`
- **Origen:** pedido de Andy del 12-10-2026 ("notas personales que los otros usuarios del equipo no puedan ver" → el bloc de ideas). Diseño aprobado en el chat.

## Objetivo
Que cada usuario tenga su bloc de ideas privado: el resto del equipo no ve sus ideas ni los chats del asistente que nacen de ellas, salvo los admins, que ven todos los chats.

## Problema
Hoy las ideas son del restaurante: `GET /api/ideas` lista las de todo el equipo, cualquiera con `capture_idea` puede editar o borrar ideas ajenas, y el historial de chats (`GET /api/conversations`) muestra a todos el texto de la idea como título y deja leer y escribir en cualquier chat del restaurante.

## Decisiones (de Andy, 12-10-2026)
- **Idea:** solo la ve y la usa su autor. También el admin ve únicamente sus propias ideas en el bloc.
- **Chat nacido de una idea:** lo ven y usan el autor de la idea, el autor del chat y cualquier admin.
- **Chat sin idea:** compartido con el equipo, como hoy.
- **Recetas:** sin cambios (del equipo).
- Lo ajeno responde 404, igual que el anti-IDOR actual.
- Supuestos presentados y no objetados: quien puede ver un chat privado también puede escribir en él (admin incluido); las ideas de alguien que se va del restaurante quedan ocultas para todos, y sus chats los sigue viendo el admin.
- Sin migración: `Idea.authorId` y `Conversation.authorId` ya son obligatorios.
- La regla de chat cuenta autor del chat **o** autor de la idea porque en datos viejos pueden diferir (un compañero pudo abrir la idea de otro).

## Alcance autorizado
P1–P3. Fuera de alcance: hacer privados los chats sin idea, compartir ideas a voluntad, cambios en recetas.

## Restricciones
- TDD estricto: activado (fuente `~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled"), runner `vitest run` (`pnpm --filter api test`, `pnpm --filter mobile test`).
- Otra sesión trabaja en la carpeta principal (`feat/aprendizaje-agrupado`, cambios sin guardar en `apps/api/lib/create-recipe.ts`). No tocarla; conflicto chico esperado en `create-recipe.ts` al fusionar.
- Commits Conventional Commits, sin Co-Authored-By.

## Tareas
| ID | Tarea | Ruta | Motivo |
|---|---|---|---|
| P1 | API de ideas solo para su autor | Delegada (Opus) | Seguridad, 4 rutas + tests (disparador de escritor: 2+ archivos no triviales) |
| P2 | Visibilidad de chats: `canAccessConversation` + filtro del historial | Delegada (Opus) | Seguridad, 5+ archivos + tests |
| P3 | App: quitar el autor de la tarjeta de idea | Delegada (Sonnet) | Mecánico, 1 componente + test |

Orden: P1 → P2 → P3.

- [x] P1 — `GET /api/ideas` filtra por `authorId`; `PATCH`/`DELETE /api/ideas/[id]`, `GET /api/ideas/[id]/conversation` y `POST /api/conversations` con `ideaId` exigen ser el autor de la idea (404 si no).
  - Ruta: delegada (Opus), disparador de escritor (4 rutas + 5 archivos de test).
  - RED observado por el escritor: 11 fallos por la razón correcta (`expected 200 to be 404`, `where` sin `authorId`).
  - GREEN verificado por el padre: `pnpm --filter api test` 98 archivos / 1192 tests; `pnpm --filter api typecheck` exit 0.
- [ ] P2 — helper único en `apps/api/lib` (regla + `where` de Prisma); aplicarlo en `GET /api/conversations` (dentro del `where`, antes del `take 50`), `GET /api/conversations/[id]/messages`, `prepareChatTurn` (`chat-turn-service.ts`) y `sourceConversationId` de `create-recipe.ts`.
- [ ] P3 — tarjeta de idea en `apps/mobile/app/(tabs)/inicio.tsx` sin `authorName`.

## Criterios de aceptación
- Un sous-chef no ve, edita, borra ni abre en el chat ideas de otro (404).
- El historial de un no-admin no incluye chats nacidos de ideas ajenas; el de un admin los incluye todos.
- Un no-admin no lee ni escribe mensajes en un chat nacido de una idea ajena (404), ni guarda una receta con ese chat como origen.
- Los chats sin idea siguen visibles para todo el equipo.

## Checks
- `pnpm --filter api test` y `pnpm --filter api typecheck` en verde.
- `pnpm --filter mobile test` y typecheck del móvil (P3).

## Entrega
- Previsión ≈ 430 líneas (mayoría tests); estrategia `ask-on-risk`, se decide si el conteo real pasa claramente de 400.
- Un commit por tarea; push de la rama al cerrar. Fusionar a `main` (despliegue a producción) es decisión de Andy.

## Progreso
- Worktree creado, rama `feat/ideas-privadas` desde `origin/main` 3cc6ff2.

- P1 hecho (130+/19−).

## Siguiente paso
P2.
