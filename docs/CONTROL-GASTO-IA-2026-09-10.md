# Control de gasto y cuotas de IA — 10 de septiembre de 2026

> **Actualización del 11-09-2026, 14:06 UTC:** servidor y las tres migraciones de ideas/cuotas/presupuesto ya publicados en producción (`dpl_FfUPJPPNuKeYbfjQFFzqDcx9TUXB`). Dominio público y salud verificados. Pendientes las compilaciones Android/iPhone, el indicador en el teléfono y la prueba física. Clave externa ya custodiada en Google Password Manager; copia previa a esta publicación confirmada en Drive. Este estado sustituye las menciones históricas de «solo QA», «sin publicar» y «custodia pendiente» que siguen abajo. Detalle: [Publicación del piloto](PUBLICACION-PILOTO-2026-09-11.md).


## Resultado y publicación

Implementado y probado localmente. Migraciones `20260910120000_ai_pilot_budget` y `20260910150000_weekly_daily_chat` aplicadas **solo en QA** (29 migraciones en esa base). No se ha publicado servidor, APK ni TestFlight, ni cambiado facturación o comprado servicios. Publicar junto con el resto de pendientes del piloto: migraciones/servidor primero, móviles después.

Configuración solicitada por el usuario:

- Gemini/Diario: **140 solicitudes de generación por chef en una ventana móvil de siete días** (20 × 7), utilizables juntas. Sustituye los veinte diarios por petición posterior del usuario. Cada uso libera su plaza exactamente siete días después; no hay reinicio a medianoche, el lunes ni al cambiar de mes.
- Opus/Creativo: **8 en una ventana móvil de siete días**, utilizables juntas. No se reinicia por cambiar de restaurante o abrir otro chat.
- Cuenta principal indicada por el usuario: **sin cuotas de mensajes**, incluida la antigua cuota general. La excepción se consulta por el correo de la cuenta autenticada guardado en el servidor; ser administrador de un restaurante no la concede. El cliente no envía ni decide esa excepción.
- **50 EUR para el conjunto del piloto**, incluyendo el consumo de la cuenta principal y los tres proveedores. La excepción se interpreta como mensajes ilimitados dentro del presupuesto común previamente autorizado, no autorización para gasto ilimitado.
- El mes empieza con la primera reserva de generación y termina un mes natural después, conservando hora UTC y ajustando al último día cuando haga falta. La fila no se reinicia al desplegar, cerrar sesión, borrar una cuenta o cambiar el mes calendario. **No renueva automáticamente el periodo ni realiza recargas.**

Las cuotas cuentan intentos admitidos para generar, no garantizan resultados correctos si un proveedor falla después de arrancar. Un rechazo por falta de saldo/cuota no reserva otra generación ni consume la nueva cuota específica. Se retiró el antiguo tope de 120/día de los chats normal y previo al restaurante: habría impedido usar las 140 juntas. Ese tope se conserva para acciones técnicas; el chat mantiene registros de generación y telemetría de tokens sin incrementar el contador de acciones técnicas.

Ejemplo: si un chef utiliza 60 Gemini un martes, conserva 80 disponibles durante los siguientes días. Esas 60 plazas se recuperan el martes siguiente, a medida que cada uso cumple siete días. No se acumulan bolsas de semanas anteriores ni se reinician al abrir un nuevo chat, cambiar de restaurante o reinstalar la app.

## Protección y límites concretos

`apps/api/lib/ai/budget.ts` reserva saldo en PostgreSQL **antes** de contactar al proveedor. Una fila global bloqueada en transacción serializa las reservas entre usuarios e instancias; otra fila protege la cuota del usuario. El gasto real confirmado libera la parte sobrante una sola vez. El coste de razonamiento ya está incluido en salida y no se suma dos veces; las escrituras de caché de Opus de cinco minutos y sus lecturas usan tarifas separadas.

La reserva cubre salida máxima configurada, sin recortar la capacidad creativa de Opus. Texto: cota conservadora basada en bytes UTF-8, multiplicados por dos, más 8.192 para el formato. Visión GLM: reserva una cota de 2.097.152 tokens de entrada, porque el tamaño base64 no predice el consumo visual. Si el consumo confirmado rebasa las cotas, se registra completo y se bloquean nuevas generaciones para revisión. Un modelo sin tarifa conocida se rechaza antes de generar.

Una desconexión o una respuesta sin consumo final fiable **conserva la reserva completa**. No se libera automáticamente por caducidad: primero hay que verificar consumo con el proveedor. Un fallo de liquidación tampoco debe borrar una receta válida; retiene el saldo y deja diagnóstico técnico. El caso conocido de cancelación antes de arrancar el proveedor liquida cero.

La contabilidad utiliza **1 USD de tarifa API = 1,25 EUR de presupuesto**, un margen conservador para cambio/impuestos/comisiones. El indicador muestra ese consumo con margen y reservas pendientes; **no es la factura del proveedor ni una garantía frente a cambios de tarifa externos o gastos realizados fuera de Atelier**. GLM también consume la asignación interna aunque lo cubra el paquete prepagado. No se consultó ni modificó hoy su saldo.

Tarifas verificadas en la decisión anterior: Gemini 0,75/3,75 USD por millón de entrada/salida hasta el 31-12-2026 y 1,50/7,50 desde el 01-01-2027; Opus 5/25, caché 6,25 escritura y 0,50 lectura; GLM 0,15/0,50 y 0,03 lectura. Configuración en `budget-policy.ts`. Fuentes: [Google](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [Z.AI](https://docs.z.ai/guides/overview/pricing).

La estimación anterior basada en veinte días de trabajo no describe el máximo de las bolsas semanales: ahora un chef puede aprovechar la cuota de los siete días aunque concentre el trabajo en pocos días. La asignación de 50 EUR se mantiene y puede agotarse antes de consumir todas las cuotas; estas quedan subordinadas al saldo global. La cuenta principal no tiene máximo de mensajes, pero sigue incluida en ese saldo.

## Cobertura y experiencia del chef

Ambos adaptadores centrales (`ai/chat.ts` y `ai/glm.ts`) realizan la reserva. Incluye chat normal y previo a crear restaurante, extracción de texto/imagen/PDF, cada análisis/generación/reparación/refinamiento de estilo y memoria desde el cron. El escaneo reutilizado desde caché no genera ni consume otra reserva. Si el refinamiento opcional no obtiene saldo pero ya existe un tema válido, conserva ese tema, como hace con otros fallos del refinamiento.

Las rutas de extracción y estilo devuelven códigos específicos de presupuesto. El chat los transmite por su flujo de errores. Traducciones ES/IT/EN mantienen disponible Diario al agotar Creativo, sin cambiar de proveedor automáticamente. El guardado manual, las recetas existentes y el cálculo de costes no pasan por este control.

En **Perfil**, la cuenta principal ve el indicador del presupuesto y el aviso a partir del 75 %. `GET /api/ai-budget` devuelve `budget: null` a otros usuarios y exige autenticación; no permite modificar el límite. No añade una pantalla ni controles a los chefs. El aviso aparece al consultar el perfil y se registra en el servidor (`ai_pilot_budget_75_percent`); **no se creó una notificación push, email ni automatización de avisos**.

## Archivos y comprobaciones

- Nuevos `apps/api/lib/ai/budget-policy.ts`, `budget.ts`, sus pruebas y `apps/api/app/api/ai-budget/route.ts`.
- Nuevos modelos `AiBudget`, `AiGeneration`, `AiChatQuota`; el registro de gasto sobrevive a la eliminación de una cuenta, con usuario nulo.
- La migración semanal añade `dailyAt` y reconstruye los usos recientes desde `AiGeneration`, sin vaciar el historial ni tocar la cuota Opus. Conserva `day`/`dailyCount` antiguos para compatibilidad de despliegue; ya no se usan para limitar chats. Desplegar API junto con la migración; no mantener un servidor antiguo escribiendo cuotas diarias después de activar la nueva versión.
- Integrados adaptadores, excepción en `ai-quota.ts`, identidad autenticada en la ruta de mensajes y errores en extracción/estilo. Tipos de uso separan `cacheWriteTokens`.
- Nuevo `PilotBudget.tsx` integrado en `ProfileSheet.tsx`, prueba de carga diferida, umbral e aislamiento de respuestas tardías. Contratos y traducciones actualizados.
- Validación actual de las cuotas semanales: **149 pruebas API, 148 móviles, 253 compartidas y 5 de idiomas: 555 superadas**. Tipos API/móvil correctos. Incluye 140 usos en un día, rechazo del 141, recuperación exacta a siete días, ausencia de reinicios de calendario, independencia de modos, chat sin tope diario antiguo, reintentos e identificación del error semanal en ES/IT/EN. Los proveedores están simulados en estas suites; no son una prueba culinaria real.
- `apps/api/scripts/check-ai-budget.ts`: prueba real en QA con cinco solicitudes concurrentes, límite 140/8, caducidad semanal exacta, excepción principal, separación de cuota técnica/telemetría, corte global incluso para el propietario, reservas inciertas, liquidación concurrente idempotente, mes sin renovación y bloqueo ante uso inesperado. Datos sintéticos limpiados, cero llamadas reales a IA. Los mensajes de bloqueo/75 % emitidos por este ensayo eran esperados. La migración también pasó una prueba con tablas temporales del esquema anterior: conserva solo los usos recientes del mismo chef y mantiene Opus.

- Exportaciones Hermes de la tarea anterior (cuota diaria): Android 2.293 módulos (`output/ai-budget-android`) e iOS 2.214 (`output/ai-budget-ios`). No se regeneraron APK/IPA ni esas exportaciones para este ajuste del servidor y traducciones; la próxima compilación debe incluirlo. Sin publicación ni prueba física.

## Operación pendiente antes de distribuir

1. Publicar migración y servidor con las comprobaciones de despliegue habituales; actualizar Android/iOS para mostrar las traducciones y el indicador. Mantener firmas y acceso iPhone actuales.
2. Comprobar la facturación Gemini y las condiciones del piloto dentro de los 50 EUR; el código no activa Cloud Billing. La copia operativa de producción y privacidad siguen pendientes.
3. Verificar el perfil con la cuenta principal en el teléfono y un chef normal. Las pruebas de componente/compilación no equivalen a una prueba visual física de Android/iPhone, tamaño de texto y orientación.
4. Antes de cambiar modelo/precio, revisar `modelRate` y su margen. Antes de liberar reservas inciertas o ampliar/reabrir el periodo, reconciliar con el proveedor y la autorización del usuario. No borrar `AiBudget` para reiniciar el gasto.
