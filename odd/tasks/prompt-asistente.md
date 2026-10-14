# Prompt del asistente — función clara, conciso y adaptado al estilo de cada chef

- **Rama:** `feat/prompt-asistente` (sale de `origin/main` 9c54198), worktree `.claude/worktrees/prompt-asistente`
- **Origen:** conversación del 11-10-2026. Andy preguntó si convenía darle comportamientos al asistente desde el prompt, pidió los cambios y aprobó el borrador v2 («sí, pásalo al archivo y armamos la prueba»).
- **Espejo en Engram:** `odd/prompt-asistente/tasks`

## Objetivo
Reescribir `apps/api/lib/anthropic-system.md`, el prompt que comparten los modos Diario y Creativo, para que el asistente:
- tenga la función clara y sea conciso;
- adapte sus propuestas al registro de cocina de cada chef: en la clásica, pulir dentro del canon; en la de vanguardia, ideas menos obvias con base técnica;
- diga de entrada lo que no tiene fundamento en la ciencia del sabor o no funciona, con el porqué y la alternativa, dejando la decisión al chef;
- cierre siempre con una mejora concreta de la receta;
- sea breve, pero completo al dar una técnica;
- responda en el idioma y con el trato del chef.

Después, medir con una prueba si el prompt nuevo supera al actual antes de desplegarlo.

## Problema
- El prompt actual empuja a todos los chefs hacia la vanguardia: habla de «alta cocina» (línea 3), pone ejemplos de hidrocoloides y N₂O (línea 9) y pide un tono «italiano de Marche» (línea 19).
- Mezcla tú y voseo (líneas 3-9 frente a 34-47) y no fija el idioma de respuesta, aunque la app está en español, italiano e inglés.
- Ante una idea anclada siempre pregunta primero, y cada mensaje gasta cupo: 8 Creativos y 140 Diarios cada 7 días.
- No fija los títulos de la receta. Una receta en italiano titulada «Metodo» no la reconoce el detector de «Guardar receta» (`apps/mobile/src/lib/recipe-conversation.ts:8`), que entonces manda la conversación entera a extracción.

## Decisiones
- Solo prompt, sin código. El estilo se deduce de lo que ya llega al modelo: la identidad, las notas del chef, la memoria culinaria (claves `cuisine`, `techniques` y `complexity`) y los títulos de las recetas recientes. Si no alcanza, el paso siguiente sería un campo explícito de estilo, fuera de este alcance.
- Títulos de receta: Ingredientes/Método, Ingredienti/Procedimento e Ingredients/Method. El detector acepta los seis.
- La cabecera `# Atelier` se mantiene porque la exige `apps/api/lib/__tests__/anthropic.test.ts:219`.
- Se mantiene «no añadas JSON ni bloques ocultos», ahora con su motivo: el historial puede traer bloques viejos que el cliente filtra con `stripRecipePayload`.
- El texto aprobado es el v2 de la conversación: 868 palabras, frente a las 802 del actual.

## Alcance autorizado
- `apps/api/lib/anthropic-system.md` y un test de contrato en `apps/api/lib/__tests__/anthropic.test.ts`.
- La prueba: casos, runner y calificación en `apps/api/evals/prompt-asistente/`, una configuración de vitest para evals y un script en `apps/api/package.json`.
- Ejecutar la prueba hace llamadas pagadas a Anthropic y a Gemini. Cada corrida necesita el OK explícito de Andy, con el costo estimado, el destino y las credenciales.
- Fuera de alcance: el código del chat, un campo de estilo de cocina y el detector de recetas.

## Restricciones
- TDD estricto (fuente: `~/.claude/CLAUDE.md`, «Strict TDD Mode: enabled»). Runner: `vitest run` (`pnpm -C apps/api test`).
- Conventional Commits sin atribución de IA.
- Entrega: `ask-on-risk`. Previsión: P1 unas 110 líneas y la prueba (P2-P3) unas 450, unas 560 en total. Antes del commit que supere las 400 hay que preguntar la estrategia de cadena.
- La carpeta principal está en `feat/memoria-encendida`, que trabaja otra sesión. Todo se hace en este worktree.

## Tareas
- [x] P1 — prompt v2 en `anthropic-system.md` más un test de contrato de los títulos de receta. Ruta: directa. Disparador: un archivo mecánico, porque el texto ya está aprobado, más un test pequeño; no llega al umbral de escritor.
- [x] P2 — casos de la prueba, para que Andy los apruebe. Andy los aprobó el 11-10-2026 («sí, los casos están bien, sigamos con el piloto»). Ruta: directa; son decisiones de producto del orquestador.
- [x] P3 — runner y calificación (comprobaciones deterministas más un juez) en `apps/api/evals/prompt-asistente/`. Ruta: delegada, un escritor. Disparador: dos o más archivos no triviales.
- [x] P4 — piloto pagado, con OK, y aprobación de la calificación por Andy.
- [x] P5 — corrida completa, reporte y decisión: ajustar el prompt si hace falta. Resultado: v3 aprobado.
- [x] P6 — v3 con el juez Opus en máximo: arreglar el arnés (mes en el contexto del juez, esfuerzo, cordura), hacer el mini-piloto de costo, la corrida baseline vs v3 con 3 repeticiones y el reporte. Ruta: delegada (arnés) y directa (corridas). Si el v3 gana, commitear el prompt.
- [x] P7 — decidir si la prueba queda en el repo y la estrategia de cadena (supera las 400 líneas), y cerrar con push.

## Criterios de aceptación
- P1: el prompt empieza con `# Atelier` y nombra los títulos de receta que acepta el detector en español, italiano e inglés. La suite de la API y el typecheck pasan.
- Prueba:
  - Andy aprueba los casos y, después de ver el piloto, también la calificación.
  - La corrida compara el prompt actual (`baseline`) con el nuevo (`v1`) en Creativo (Opus 5.5) y en Diario (Gemini 3.8 Flash).
  - El reporte trae el resultado de cada caso.

## Comprobaciones
- `pnpm -C apps/api test`
- `pnpm -C apps/api typecheck`

## Progreso y evidencia
- P1, test nuevo: `principios — contrato con «Guardar receta»` en `apps/api/lib/__tests__/anthropic.test.ts`. Cubre un caso por idioma.
- P1 RED, con el prompt sin cambios: fallan los 3 casos por la razón esperada. El prompt no nombra «Ingredientes», «Ingredienti» ni «Ingredients» como títulos.
- P1 GREEN:
  - `anthropic.test.ts` 31/31; `tsc --noEmit` con salida 0.
  - Suite de la API: 1172 tests pasan y 8 se omiten. Falla un archivo, `app/api/restaurant/leave/__tests__/leave.test.ts`, por *timeout* del `beforeAll` bajo carga. Aislado pasa 8/8, la rama no lo toca y ya figuraba en la auditoría del 6-10-2026.

- P1, commit `0d0af21`. RDD con base `9c54198`: riesgo medio (`executable_change` en el test), 148 líneas, `review_due: false` por `under_budget`. Queda pendiente dentro del tramo.
- P2: 18 casos en `apps/api/evals/prompt-asistente/cases.json`, sobre 6 restaurantes ficticios. `casos.md` se genera a partir de ese archivo para la revisión. `baseline-prompt.md` es la copia congelada del prompt de `9c54198` (802 palabras).
  - Cubren estilo (clásica, vanguardia, sin señales y un chef clásico que pide algo moderno), franqueza (piña con gelatina, el chef que insiste y dos trampas válidas: freír en AOVE y chocolate blanco con caviar), seguridad (pescado crudo), técnica, recetas en español, italiano e inglés, voseo, brevedad e idea anclada.
  - Estado: aprobados por Andy el 11-10-2026.
- P3: delegado a un escritor (Opus) en segundo plano, sin llamadas pagadas. Llama a `streamChat` real y simula solo `lib/ai/budget.ts`.
- P3, primera entrega del escritor:
  - `checks.ts` tiene 75 líneas, `checks.test.ts` 137 (RED 11/17 y GREEN 17/17), `judge.ts` 90, `run.eval.ts` 460 y `vitest.eval.config.ts` 15, más el script `eval:prompt`.
  - La suite de la API pasa entera: 1197 tests. El typecheck da 0.
  - Simulación oracle: 100 %. Simulación null: 0 %.
- Auditoría antes del piloto, con un workflow de 3 lentes (fidelidad, calificación, costo/seguridad) y un escéptico por hallazgo medio o alto. De 11 agentes salieron 4 hallazgos confirmados, 3 refutados y 10 bajos. Los confirmados:
  - Alto: al reanudar se reutilizaban filas viejas sin comprobar con qué prompt o calificación se hicieron. Reproducido.
  - Las negativas del modelo salían de las medias sin contarse.
  - No había guarda de alcance para las corridas pagadas.
  - Un fallo del juez tiraba la generación ya pagada.
  
  Se corrigen junto con 4 bajos: el plazo real de `EVAL_TIMEOUT_S`, un lock, `.gitignore` en la carpeta de resultados y la redacción de criterios en beurre blanc, el chef que insiste y las recetas. Se delegaron al mismo escritor.
- P3 después de la auditoría y de una segunda revisión independiente (workflow de 2 agentes):
  - La huella cubre todos los casos e incluye los bloques de sistema realmente enviados, el contexto del juez, `chatConfig` y el código del runner.
  - Hay control de comparabilidad entre `baseline/` y `v1/`.
  - El pool usa `allSettled`, así que el lock se suelta solo cuando terminó cada trabajador.
  - El juez respeta `Retry-After`. Los 4xx de Anthropic fallan sin reintentar.
  - Verificado: `run.eval.ts` tiene 652 líneas, la API pasa 1202 tests, typecheck 0, simulación oracle 100 % y null 0 %. Se reprodujeron las dos negativas: filas viejas y variantes no comparables.
- P3 completado. Lo que solo corre con la API real (juez, negativas del modelo, `deadlineAt` y reintentos) tiene typecheck y revisión; el piloto es su primera ejecución.
- P4, primer intento del piloto (12-10-2026, OK de Andy: «haz todas las pruebas que sean necesarias, tiene mi ok»). Corrida `EVAL_RUN=piloto` sobre 4 casos, con las dos variantes, usando las claves de `apps/api/.env.local`.
  - Gemini respondió: 8 generaciones guardadas en `generations/`.
  - Anthropic devolvió 401 en todas las llamadas, tanto las de Opus como las del juez. En `.env.local`, `ANTHROPIC_API_KEY` es un marcador de posición: 18 caracteres con prefijo `sk-ant-`, y `GET /v1/models` responde 401 `invalid x-api-key`.
  - Anthropic no cobró nada. Hace falta otra credencial para Anthropic.
- P4, piloto (12-10-2026). Credenciales: Andy eligió las de producción. Anthropic sale de `vercel env run -e production` con un envoltorio que solo pasa las variables de IA y descarta el resto de los secretos. `GEMINI_API_KEY` es sensible en Vercel y la CLI no la entrega, así que Gemini usa la clave de dev ya aprobada.
  - Resultados (criterios, media por caso):
    - Prompt viejo: creative 0,950 y daily 0,787.
    - Prompt nuevo: creative 1,000 y daily 0,950.
    - Títulos de receta en italiano: 0 % con el viejo y 100 % con el nuevo.
  - Gasto medido: US$0,53. Mediana por fila: Opus US$0,046, Gemini US$0,0033, juez US$0,009.
  - Todas las filas traen model, usage, latency, words y los datos del juez.
- Calibración del juez: 4 agentes recalificaron a ciegas las 16 respuestas, sin saber la variante ni el veredicto del juez. Acuerdo del 96,9 % (62/64). Los dos desacuerdos son del criterio «va al grano», uno en contra de cada variante, y se aclaró en `cases.json`: un renglón que solo nombra el plato no es preámbulo. Andy delegó la aprobación de la calificación («haz todas las pruebas que sean necesarias»).
- P5, corrida completa (`EVAL_RUN=completa`): 18 casos, 2 modos, 2 repeticiones y 2 variantes. Son 144 filas, sin errores ni negativas del modelo. Gasto medido: US$5,22. Reporte en `.claude/hillclimb/prompt-asistente-completa/report.html`.
  - Criterios (media por caso, con IC95 %):
    - Creative: 0,889 [0,83-0,94] con el prompt viejo y 0,881 [0,82-0,94] con el nuevo, es decir, plano.
    - Daily: 0,644 [0,54-0,75] con el viejo y 0,775 [0,69-0,87] con el nuevo.
  - Títulos de receta: creative 33 % → 100 %; daily 83 % → 100 %.
  - Ganancias de Daily:
    - pescado crudo 0,25 → 1,00
    - beurre blanc +0,33
    - brodetto en italiano +0,30
    - celeriac en inglés +0,40
    - voseo +0,38
  - Regresiones: daily `estilo-sin-senales` −0,25; creative, «va al grano» 86 % → 75 %.
  - La brevedad no se cumplió. Mediana de palabras: creative 441 → 446; daily 392 → 478 (+22 %).
- Lectura cualitativa: un workflow de 3 analistas leyó las transcripciones y otro agente sintetizó. Veredicto: no publicar el v1 tal cual.
  - Ganancias reales:
    - pescado crudo en Diario;
    - títulos de receta en italiano e inglés (2/6 → 6/6 en Creativo);
    - la mejora de cierre en las recetas (fallaba 9/12 con el viejo, 0/12 con el nuevo).
    
    Corregida por el ruido del juez, la ganancia de Diario queda en unos +0,08.
  - De dónde sale el largo:
    1. La línea «Cuando des una receta o un plato concreto» convierte ideas, opiniones y técnicas en fichas completas: 0/12 → 11/12 en idea anclada, cochinillo moderno y caviar, unas 3.200 palabras más.
    2. La mejora de cierre tiene una mediana de 51 palabras y a veces trae variantes que nadie pidió.
    3. «avanza con un supuesto y dilo» genera aperturas con supuestos (0 → 9).
    4. Siguen los párrafos de planteamiento y los ofrecimientos al final.
  - Bug del arnés: `judgeContext()` no pasa `currentMonth`, así que el juez puede tomar «octubre» como un dato inventado.
  - Propuesta v3: 11 ediciones con el mismo número de palabras; volver a correr con 3 repeticiones y el juez corregido. Pendiente de la aprobación de Andy.
- 12-10-2026, Andy aprobó el v3 («sí») y pidió el juez con Opus en esfuerzo máximo.
  - Aviso dado: el juez califica sus propias respuestas del modo Creativo, pero a ciegas y con las dos variantes en Opus, así que la comparación no se sesga.
  - El v3 entra en `anthropic-system.md`: 888 palabras, frente a 868 del v2 y 802 del original. Se aplicaron 9 de las 11 ediciones. No se quitó la frase que dice qué es Atelier, porque Andy pidió que la función quede clara, ni el ejemplo de «rectificar de sal».
  - `anthropic.test.ts`: 31/31.
  - El arnés se ajusta para recibir el mes en el contexto del juez, el modelo y el esfuerzo por variable de entorno, y una prueba de cordura del juez. Delegado al escritor.
  - Antes de la corrida completa: un mini-piloto para medir el costo del juez Opus en máximo y presentarle a Andy el número real, porque la estimación previa de US$8 suponía Sonnet.
- P6, ronda v3 (`EVAL_RUN=v3`): 18 casos, 2 modos, 3 repeticiones y 2 variantes, con juez `claude-opus-5-5` en esfuerzo máximo. Son 216 filas, sin errores ni negativas del modelo. Gasto medido: US$40,64, de los que el juez pesa unos US$0,14 por llamada. Reporte en `.claude/hillclimb/prompt-asistente-v3/report.html`.
  - Antes de correr:
    - Cordura del juez con respuestas malas: una vacía aprueba 0/9 criterios; «No lo sé.» y una respuesta a otra pregunta aprueban 2/9, ambos de «va al grano», que se cumple literalmente.
    - Mini-piloto de 8 filas: Andy eligió «Opus máx, 3 repeticiones» (≈ US$44).
  - Criterios:
    - Creative: 0,894 [0,84-0,95] con el prompt viejo y 0,971 [0,95-1,00] con el v3.
    - Daily: 0,764 [0,68-0,85] con el viejo y 0,881 [0,81-0,95] con el v3.
  - Mediana de palabras: creative 410 → 216 (−47 %); daily 376 → 246 (−35 %). Latencia: creative 23,9 → 17,4 s; daily 7,9 → 5,4 s. Tokens de salida de Opus: 1963 → 1396.
  - «Va al grano»: creative 89 % → 98 %; daily 67 % → 100 %. Títulos de receta: creative 0 % → 100 %; daily 89 % → 100 %.
  - Regresiones menores, todas en Daily (Gemini, razonamiento bajo):
    - pregunta rápida −0,22: el contenido del fumet sale incompleto en 2 de 3 repeticiones;
    - proporción de alginato en 1 de 3, frente a 3 de 3 con el viejo;
    - pasos de reducción en el beurre blanc en 1 de 3, frente a 3 de 3.
    
    Con la brevedad, Gemini a veces recorta datos técnicos. Queda como mejora posible.
  - Veredicto: el v3 gana en los dos modos y cumple la brevedad. Se commitea.
- P7, entrega. Andy eligió PR apilados contra `main` («apilados contra main, dale»):
  - PR 1: `feat/prompt-asistente`, con `0d0af21` y `4a791d6` (237 líneas). El prompt.
  - PR 2: `feat/prompt-asistente-2`, con los chequeos automáticos y el juez, más sus tests (unas 430 líneas).
  - PR 3: `feat/prompt-asistente-3`, con el runner, los casos, la configuración y este registro (unas 1.570 líneas, el 40 % datos de casos). Va con `size:exception`, porque el runner no corre sin los casos y no se puede partir con sentido.
  - Los resultados quedan fuera del repo, en `.claude/hillclimb/`, con un `.gitignore` propio.
- Andy pidió trabajar después en la memoria culinaria («que sea verdaderamente funcional»). Hay un mapeo en curso, de solo lectura (workflow: producción, consumo e historia, más una síntesis). Puede abrir un documento de tareas aparte.
- La prueba (P2-P4) no se commitea hasta que Andy decida si queda en el repo (paso «Make it durable» de la guía de evals). Hasta entonces vive sin commitear en este worktree.
- 13-10-2026, Diario con Gemini frente a Haiku. El modo `haiku` de la prueba (commit `6275cfa`) hace que el Diario lo responda `claude-haiku-5-5` en vez de Gemini 3.8 Flash. Usa el prompt v1 actual y la misma rama de Anthropic de `streamChat` (razonamiento adaptativo, esfuerzo medio). Producción no cambia.
  - Simulaciones sin red: oracle 100 % y null 0 % en los 22 casos de cada modo. Cada fila `haiku` queda registrada con `claude-haiku-5-5`.
  - Credenciales como en P4. Anthropic sale de `vercel env run -e production` con un envoltorio que solo pasa las variables que ya había antes de Vercel, más `EVAL_*` y `ANTHROPIC_API_KEY`. `GEMINI_API_KEY` es la de dev, y se lee solo esa línea de `.env.local`. No se usa `EVAL_ENV_FILE`, porque cargaría también el `ANTHROPIC_API_KEY` falso de `.env.local` y pisaría la clave real.
  - Mini-piloto (`EVAL_RUN=haiku-piloto`, OK de Andy por unos US$1,20): 4 casos, 1 repetición, juez Opus en esfuerzo máximo. Son 8 filas, sin errores ni negativas.
    - Gasto medido: US$1,39. La generación con Gemini costó US$0,013, la de Haiku US$0,004 y el juez US$1,37, unos US$0,17 por llamada.
    - Coste mediano por respuesta: Gemini US$0,0028 (US$0,0057 desde el 1-1-2027), Haiku US$0,0009.
    - Criterios aprobados: Gemini 16/19, Haiku 18/19.
    - Mediana de palabras: Gemini 236, Haiku 209.
    - Mediana de latencia: Gemini 6,2 s, Haiku 7,6 s. En el brodetto, Haiku tardó 18,9 s y generó 3.358 tokens de salida contando el razonamiento.
    - Seguridad alimentaria (pescado crudo): 4/4 con los dos modelos.
  - Revisión de Gentle AI (lente de fiabilidad): aprobada y confirmada. Dejó tres avisos que no bloquean:
    - Faltaba `EVAL_MODES=daily,haiku` en el comando de la corrida completa. Ya está corregido aquí; la corrida lo llevaba.
    - Nada demuestra que el modo haiku use de verdad Anthropic. Las filas lo prueban: las de `haiku` terminan en `end_turn` y escriben en la caché del prompt, y las de Gemini terminan en `STOP`.
    - `ALL_MODES` se declara después de `settings()`. Es inofensivo, porque `settings()` solo se llama dentro del test.
  - Corrida completa (`EVAL_VARIANT=v1 EVAL_MODES=daily,haiku EVAL_ALL=1 EVAL_REPS=3 EVAL_RUN=haiku-completa`, OK de Andy): 22 casos, 2 modos y 3 repeticiones, con juez Opus en esfuerzo máximo. Son 132 filas, sin errores, negativas ni respuestas cortadas. Reporte en `.claude/hillclimb/prompt-asistente-haiku-completa/report.html`.
    - Gasto medido: US$19,79. La generación con Gemini costó US$0,19, la de Haiku US$0,06 y el juez US$19,54, con una mediana de US$0,13 por llamada.
    - Criterios (media por caso, con IC95 %): Gemini 0,914 [0,86-0,97] y Haiku 0,859 [0,77-0,95]. La diferencia pareada por caso es −0,055 [−0,155; +0,031], así que no es significativa. Haiku sale mejor en 5 casos, peor en 9 e igual en 8. Criterios aprobados: 237/264 y 225/264.
    - Dónde pierde Haiku:
      - esferificación inversa 0,92 → 0,25: confunde la técnica con la directa, añade lactato cálcico y da 30-60 s de baño en vez de minutos;
      - el chef que insiste 0,92 → 0,42: propone gelatina con zumo de piña crudo, que la bromelina no deja cuajar, y en una repetición vuelve a discutir la decisión;
      - memoria de vanguardia 1,00 → 0,75: platos de 2-3 elementos frente a los 6 o más de la casa;
      - piña con gelatina 1,00 → 0,83: da las cantidades antes del aviso;
      - judiones 0,93 → 0,73 y brodetto 0,73 → 0,60;
      - idioma 98 %: en el brodetto, una respuesta en italiano lleva partes en español.
    - Dónde gana Haiku: beurre blanc 0,50 → 0,83, celeriac en inglés 0,80 → 1,00 e idea anclada 0,83 → 1,00.
    - Por etiqueta (Gemini → Haiku): franqueza 0,98 → 0,78; técnica 0,81 → 0,69; italiano 0,73 → 0,60; inglés 0,80 → 1,00; estilo 0,94 → 0,96; memoria 0,94 → 0,92; seguridad 1,00 → 1,00.
    - Seguridad alimentaria:
      - Pescado crudo: 3/3 con los dos modelos.
      - Idea anclada, al proponer ricciola cruda: Haiku avisa de la congelación por el anisakis en 3/3. Gemini lo omite en 2/3, y ese fallo existe hoy en producción.
    - Coste mediano por mensaje: Gemini US$0,0026 y Haiku US$0,0009. Con el cupo de 140 Diarios por semana, unos 607 al mes, salen US$1,59 y US$0,53 al mes. Gemini pasa a US$3,19 desde el 1-1-2027, cuando duplica su tarifa.
      - Haiku se calcula con la tarifa conservadora de `budget-policy.ts`, que cobra la lectura de caché como la entrada.
      - Son respuestas de un solo turno; con historial, el coste real por mensaje es mayor en los dos modelos.
    - Mediana de palabras: Gemini 219, Haiku 175.
    - Latencia: mediana de 5,7 s en Gemini y 7,5 s en Haiku; p90 de 9,1 s y 11,4 s.
    - Haiku genera unos 1.200 tokens de salida por respuesta, unos 950 de ellos de razonamiento.

  - Esfuerzo de Haiku (OK de Andy por unos US$6). El commit `dd8d9c6` añade un esfuerzo opcional a la config de IA; `chat.ts` lo usa y, si falta, mantiene `medium`, así que producción no cambia. La prueba lo fija con `EVAL_HAIKU_EFFORT`. TDD: RED `expected 'medium' to be 'xhigh'`, luego GREEN; la API pasa 1458 tests y el typecheck da 0. La revisión de Gentle AI lo aprobó.
    - Corridas `haiku-high` y `haiku-xhigh`: los 7 casos con mayor caída de Haiku, con 3 repeticiones, 42 filas en total.
    - Gasto medido: US$9,77 (generación US$0,08, juez US$9,68). Supera los US$6 estimados, porque son los casos largos y el juez costó unos US$0,23 por llamada en vez de US$0,14.
    - Criterios en esos 7 casos: Gemini 0,913; Haiku medium 0,623; high 0,723; xhigh 0,665.
      - xhigh no cabe en los 8.192 tokens máximos del Diario: corta el brodetto en 3 de 3 repeticiones. Sin el brodetto, xhigh queda en unos 0,78 y Gemini en unos 0,94.
      - Más esfuerzo no corrige los errores de fondo:
        - en el chef que insiste sigue proponiendo gelatina con piña cruda;
        - en la esferificación inversa refuerza con lactato y da tiempos de directa;
        - en la memoria de vanguardia sigue con platos de 2 o 3 elementos.
    - Coste por mensaje y latencia mediana (p90): Gemini US$0,0028 y 6,1 s (10,2); Haiku medium US$0,0011 y 9,5 s (16,3); high US$0,0015 y 14,1 s (20,4); xhigh US$0,0021 y 19,3 s (40,4).
    - Conclusión: subir el esfuerzo de Haiku no compensa. Mejora poco, sigue lejos de Gemini y duplica o triplica la latencia del Diario.

## Siguiente paso
- Andy decide si el Diario pasa a Haiku. Con todas las corridas, la recomendación es quedarse con Gemini.
  - Haiku cuesta un tercio que Gemini y avisa mejor del anisakis.
  - En calidad queda igual o algo por debajo, con errores técnicos claros en los casos trampa (gelatina con piña, esferificación inversa).
- Aparte del modelo, que Gemini omita el aviso del anisakis en idea anclada es un fallo de seguridad actual.

- Decisión de Andy (14-10-2026): el Diario se queda con Gemini. Se fusiona la rama con el modo Haiku y el esfuerzo opcional para futuras comparaciones. El aviso del anisakis en idea anclada no se considera relevante y se deja como está.
