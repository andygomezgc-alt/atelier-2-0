# Auditoría de seguridad — Atelier 2.0

**Fecha:** 2026-07-16 · **Modo:** solo lectura (no se modificó código ni base de datos) · **Alcance:** `apps/api`, `apps/mobile`, `packages/*`, dependencias y git.

---

## Resumen para el chef (sin tecnicismos)

La app está **bien construida en lo que más importa**: un restaurante no puede ver ni tocar los datos de otro, no hay contraseñas ni claves escondidas en el código que se instala en el móvil, y todo lo que el usuario escribe se valida antes de guardarlo. No hay ningún agujero por el que un extraño entre.

**No hay hallazgos P0** (nada crítico explotable por un extraño o que filtre secretos al público).

Hay **3 cosas P1 que conviene arreglar antes de invitar a más chefs**, y varias mejoras P2. La más importante: hoy un miembro con permisos de solo-lectura ("viewer") puede, llamando directo a la API, cambiar el precio, las porciones y los ingredientes de una receta (incluso de una ya aprobada). No es un extraño —tiene que ser alguien a quien tú invitaste— pero rompe la regla de "solo mirar".

---

## Respuestas directas a tus preguntas

1. **¿Secretos en el código o en el repositorio?** No en GitHub. El código está limpio. **Pero** hay copias de tus llaves reales de producción guardadas **en tu PC** (un `git stash` viejo y un archivo `.env.production.pull`) — ver P1-2. Ninguna clave privada de servidor se compila dentro del APK (verificado).
2. **¿Un no-admin puede ejecutar acciones sensibles llamando a la API?** **Sí, una:** editar campos de recetas (precio/porciones/ingredientes/alérgenos/prioridad y revertir el estado) sin tener el permiso — ver **P1-1**. Todo lo demás (borrar menús, expulsar miembros, cambiar roles, editar el restaurante) **sí está bien protegido en el servidor**, no solo ocultando botones.
3. **¿Aislamiento entre restaurantes?** **Sólido.** Revisados los ~60 endpoints: todos comprueban que el recurso pertenezca a tu restaurante antes de leerlo o tocarlo. No se encontró ni un solo hueco cruzado.
4. **¿Validación de entradas?** **Buena.** Casi todo se valida con esquemas estrictos (zod) con límites de tamaño y tipo. Sin inyección SQL (todo pasa por Prisma parametrizado). Pequeñas mejoras en P2.
5. **¿Dependencias?** El escáner automático (`pnpm audit`) **no funciona** hoy (P1-3). Revisión manual de los paquetes sensibles: **todos al día**, ninguno con versión vulnerable conocida.

---

## P0 — Crítico (explotable ya por un extraño)

**Ninguno.** No hay acceso sin autenticar a datos privados, ni fuga de datos entre restaurantes, ni secretos embebidos en la app cliente, ni inyección SQL. El perímetro está bien.

---

## P1 — Importante (arreglar antes de ampliar el piloto)

### P1-1 · Un miembro "viewer" puede editar recetas por la API sin permiso
- **Qué es:** el endpoint que edita recetas (`PATCH /api/recipes/[id]`) comprueba que estés logueado y que la receta sea de tu restaurante, pero **no comprueba tu rol** para varios campos. Solo controla el título, el contenido y las transiciones de estado a "en prueba"/"aprobada". Quedan sin candado: **precio de venta, porciones, ingredientes, alérgenos manuales, prioridad, y revertir el estado a borrador** — incluso sobre una receta ya **aprobada**.
- **Dónde:** [apps/api/app/api/recipes/[id]/route.ts:59](apps/api/app/api/recipes/[id]/route.ts) (usa `requireAuth(req)` sin permiso; el gating parcial está en las líneas siguientes). Esquema del body: [packages/shared/src/api-contract.ts:282](packages/shared/src/api-contract.ts).
- **Por qué es un riesgo (en simple):** el rol "viewer" existe para que alguien solo **mire** (su único permiso legítimo es exportar PDF). Con este hueco, esa persona puede cambiar el precio o los ingredientes de un plato desde fuera de la app (con una herramienta simple), sin que la interfaz se lo permita y sin dejar de estar "aprobada" la receta. No es un extraño —tiene que ser alguien de tu restaurante— pero es una fuga de autorización real.
- **Cómo se arregla:** exigir el permiso `edit_recipe` como mínimo para cualquier cambio de receta (igual que ya hace el endpoint de crear). Autorizar por **presencia del campo** (`campo !== undefined`, no por "si tiene valor"). Definir explícitamente qué se puede tocar en una receta aprobada; si cambian ingredientes/alérgenos/precio, exigir admin o volver la receta a "no aprobada". Añadir tests por rol y por campo.
- *Nota:* Codex lo clasificó como P0 por ser explotable ahora; lo dejo en P1 porque el atacante debe ser un miembro ya invitado a tu restaurante (mismo inquilino), no un extraño. Es el hallazgo más importante del informe.

### P1-2 · Llaves reales de producción guardadas en tu PC (no en GitHub)
- **Qué es:** un `git stash` viejo y el archivo `apps/api/.env.production.pull` (en disco, no versionado) contienen tus claves reales: base de datos, clave de IA (Anthropic), secreto de sesión (AUTH_SECRET), clave que descifra las claves propias de tus usuarios (BYOK), Resend y el token de Blob.
- **Dónde:** stash de git (objeto local `2469bfb`) + `apps/api/.env.production.pull` + `apps/api/.env.local`. **Verificado que NO llegaron a GitHub** (ninguna rama ni remoto los contiene).
- **Por qué es un riesgo (en simple):** son las llaves maestras del negocio. Están en texto claro dentro de tu carpeta de proyecto. Si esa carpeta se sincroniza con OneDrive/Google Drive, se respalda a la nube, o alguien accede a tu equipo, se filtran todas de golpe.
- **Cómo se arregla:** borra el/los stash que las contengan (`git stash list` → `git stash drop`), purga los objetos (`git reflog expire --expire=now --all && git gc --prune=now`), y borra `apps/api/.env.production.pull` (se regenera con `vercel env pull` cuando lo necesites). Rotar las claves solo si esa carpeta está sincronizada/respaldada a la nube; si no, no es urgente porque nunca salieron de tu PC.

### P1-3 · El escáner de vulnerabilidades de dependencias no funciona
- **Qué es:** `pnpm audit` falla (`HTTP 410`) porque tu versión de pnpm (9.15) usa un endpoint que npm retiró. No se pueden listar CVEs automáticamente.
- **Por qué es un riesgo (en simple):** es tu "alarma de humo" de librerías con fallos conocidos, y hoy está apagada. La revisión manual dice que todo está al día **hoy**, pero sin el escáner no te enterarás cuando aparezca una vulnerabilidad nueva.
- **Cómo se arregla:** actualizar pnpm a 10.x, o correr `osv-scanner` / `pnpm dlx audit-ci` contra `pnpm-lock.yaml` (idealmente en CI, que corra solo en cada cambio).

---

## P2 — Mejoras (defensa en profundidad, sin urgencia)

- **P2-1 · Fotos de perfil/restaurante sin verificación de contenido real.** `me/photo` y `restaurant/photo` ([apps/api/lib/blob.ts:11](apps/api/lib/blob.ts) `validatePhoto`) miran solo el tipo declarado, no los "magic bytes" como sí hacen las subidas de recetas. Alguien podría subir un archivo que no es una imagen haciéndolo pasar por JPG. Impacto bajo (no se ejecuta). Fix: llamar a `fileMatchesMime` también aquí.
- **P2-2 · Exportar CSV es vulnerable a "inyección de fórmulas".** [products/export/csv/route.ts:18](apps/api/app/api/products/export/csv/route.ts): un nombre de producto que empiece por `= + - @` se ejecuta como fórmula al abrir el CSV en Excel. Fix: anteponer un apóstrofo cuando el valor empiece por esos caracteres. *(Los datos exportados sí están correctamente limitados a tu restaurante — verificado, no hay fuga cruzada.)*
- **P2-3 · Exports sin candado de permiso explícito.** `recipes/export/pdf`, `products/export/pdf` y `products/export/csv` usan `requireAuth(req)` sin `export_pdf`. Los datos están bien acotados a tu restaurante, y la matriz ya permite a "viewer" exportar, así que no es una fuga; conviene añadir el permiso por consistencia y para rechazar automáticamente a usuarios sin restaurante.
- **P2-4 · Tokens de móvil de larga vida (30 días) y un hueco teórico de revocación.** Si un token viejo no trajera el marcador de versión (`tv`), esquivaría la revocación. Verificado que **todos** los tokens que emite la app hoy sí lo traen ([verify](apps/api/app/api/mobile/auth/verify/route.ts:71), [google](apps/api/app/api/mobile/auth/google/route.ts:69), [dev-login](apps/api/app/api/mobile/auth/dev-login/route.ts:55)), así que es teórico. Fix defensivo: rechazar cualquier token sin `tv`, y considerar acortar los 30 días.
- **P2-5 · Sin garantía de "último admin".** Al cambiar roles ([restaurant/staff/[userId]/route.ts](apps/api/app/api/restaurant/staff/[userId]/route.ts)) no se comprueba que quede al menos un admin. No es escalada (un no-admin no llega ahí — verificado), pero dos admins podrían, en peticiones simultáneas, dejar el restaurante sin ninguno. Fix: comprobar el invariante dentro de una transacción.
- **P2-6 · Borrar el restaurante entero no exige rol admin.** `restaurant/leave` permite a cualquier miembro que sea el **último** borrar todo el restaurante ([restaurant/leave/route.ts](apps/api/app/api/restaurant/leave/route.ts)). En el flujo normal un viewer no puede quedarse solo, pero para una acción irreversible conviene exigir admin + confirmación. Decide si es el comportamiento deseado ("el último miembro es el dueño de facto").
- **P2-7 · `next-auth` en versión beta.** `5.0.0-beta.31` es preview (es lo estándar hoy para App Router). Seguir sus avisos y migrar a la versión final cuando salga.
- **P2-8 · dev-login.** Está bien cerrado (devuelve 404 fuera de `NODE_ENV=production`, y Vercel pone ese valor solo en producción). Mejora opcional: cerrarlo también con una variable propia por si algún día se despliega con otra configuración.

---

## Lo que está BIEN (para tu tranquilidad)

- **Aislamiento entre restaurantes: sólido.** Los ~60 endpoints verifican pertenencia (`recurso.restaurantId === tu restaurante`) antes de leer o escribir. El restaurante y el rol se leen **de la base de datos**, no del token (un token manipulado no sirve para hacerse pasar por admin).
- **Autorización real en el servidor** para todas las acciones destructivas menos la de recetas (P1-1): borrar menús = solo admin, expulsar/roles = solo admin, editar restaurante = solo admin, borrar productos = permiso de productos. No son solo botones ocultos.
- **Nada secreto se instala en el APK:** solo la URL de la API y los IDs públicos de Google. Las claves de servidor viven exclusivamente en `apps/api`.
- **Validación estricta** con zod en casi todos los endpoints; límites de precio, porciones, longitudes y tamaños de archivo. Subidas de recetas y de estilo verifican el contenido real del archivo (magic bytes + tope de páginas PDF).
- **Sin inyección SQL** (Prisma parametrizado en todo; el único SQL crudo es un `SELECT 1` del health check). El HTML de los PDF escapa el texto del usuario.

---

## Cómo se verificó (reproducible)

- Equipo de agentes en modo solo-lectura para recopilar: secretos/`.env`/git, inventario completo de endpoints con su control de acceso, validación de entradas y dependencias.
- Análisis adversarial de autorización y aislamiento con Codex (gpt-5.6) sobre el código servido inline.
- Verificación manual final de los puntos que decidían la gravedad: esquemas `PatchMeRequest`/`PatchRecipeRequest`, alcance de las consultas de export, emisión de tokens y cierre de `dev-login`.
- Pendiente operativo: rehabilitar `pnpm audit` (P1-3) para escaneo automático continuo.
