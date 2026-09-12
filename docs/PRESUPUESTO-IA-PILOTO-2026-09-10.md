# Presupuesto de IA del piloto — 10 de septiembre de 2026

## Acuerdo y estado

El usuario confirma aproximadamente **cinco chefs**, acepta **50 EUR para un mes** de IA del conjunto del piloto y propone subir Opus de cinco a **ocho mensajes por chef y semana**. Se interpreta semana porque es el periodo de la propuesta inmediatamente anterior; no son ocho mensajes diarios. Se mantiene como base propuesta Gemini con quince mensajes por chef y día. No inferir renovación de suscripciones, recargas automáticas o nuevas compras.

Este documento conserva la **estimación inicial con quince Gemini**. Después el usuario pidió veinte diarios y finalmente **140 Gemini (20 × 7) por siete días**, junto con 8 Opus por siete días y excepción de mensajes para su cuenta principal. Las bolsas pueden concentrarse en un solo día; la estimación histórica de veinte días de trabajo no representa su uso máximo. El control está implementado y validado en QA, **pendiente de publicación**, sin activar facturación. Para estado y comportamiento vigentes prevalece [Control de gasto](CONTROL-GASTO-IA-2026-09-10.md).

## Cálculo verificable

Tarifas estándar consultadas hoy, USD por millón de tokens de entrada/salida, sin descuentos por caché:

- Gemini 3.8 Flash: **0,75 / 3,75**, incluyendo razonamiento en salida, tarifa introductoria hasta el 31-12-2026. Google publica **1,50 / 7,50** a partir del 01-01-2027. [Google](https://ai.google.dev/gemini-api/docs/pricing).
- Opus 5: **5 / 25**. La escritura/lectura de caché tiene tarifas distintas; no usar una sola tarifa de entrada para liquidar consumo real. [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing).
- GLM 5.3 Flash: **0,15 / 0,50**; no reutilizar la promoción anterior. El paquete prepagado registrado puede cubrir consumo mientras esté disponible, pero no se consultó hoy su saldo. [Z.AI](https://docs.z.ai/guides/overview/pricing).

Escenario ilustrativo, no medición ni máximo garantizado: cinco chefs, veinte días activos de Gemini y cuatro semanas de Opus. Cada respuesta Gemini supone 4.000 tokens de entrada y 1.500 de salida; Opus, 6.000 de entrada y 6.000 de salida. Entrada incluye instrucciones, contexto e historial; salida incluye razonamiento facturable.

| Chat | Respuestas del grupo | USD/respuesta supuesto | Total USD |
| --- | ---: | ---: | ---: |
| Gemini | 5 × 20 × 15 = 1.500 | 0,008625 | 12,9375 |
| Opus | 5 × 4 × 8 = 160 | 0,18 | 28,80 |
| Total de chats | 1.660 | — | **41,7375** |

Referencia BCE del 09-09-2026: 1 EUR = 1,1652 USD. Conversión orientativa: **35,82 EUR antes de impuestos, comisiones y GLM**; no es el cambio garantizado de la tarjeta. [BCE](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.hr.html).

No equiparar mes con cuatro semanas. Con veintidós días activos y cinco lotes de ocho respuestas de Opus por chef, el mismo consumo medio da **50,23 USD / 43,11 EUR antes de extras**. Si las 160 respuestas Opus del escenario base alcanzaran su máximo configurado de 16.384 tokens de salida, manteniendo el supuesto de entrada, solo los chats sumarían **83,27 USD**. Las cuotas de mensajes por sí solas no garantizan los 50 EUR.

## Requisitos de la propuesta inicial (ver implementación en el informe enlazado)

1. Techo común para toda la IA del piloto; conservar 50 EUR como presupuesto total del usuario, con margen para conversión, impuestos/comisiones aplicables y consumo pendiente. El coste de API antes de impuestos no debe presentarse como importe final de factura. Definir la fecha de inicio del mes piloto al activarlo y no reiniciar el saldo por desplegar o reinstalar.
2. Gemini: quince respuestas diarias por usuario. Opus: ocho en siete días, utilizables juntos; preferir ventana móvil para evitar duplicar la cuota alrededor de un reinicio semanal. Sujeto siempre al presupuesto global restante, no garantizar que todas las cuotas puedan consumirse completas.
3. Reservar saldo de forma atómica **antes** de cada generación, incluida concurrencia entre usuarios/instancias. Liquidar con consumo confirmado; conservar una reserva prudente si hay corte, error o falta la lectura final. Contar razonamiento una sola vez y separar tarifas de caché. Rechazar modelos sin tarifa configurada.
4. Cubrir ambos chats y cada llamada GLM: extracción, análisis de estilo, generación/refinamiento/reparación de tema y cron de memoria. Una subida de menú puede disparar varias generaciones aunque hoy reserve una sola solicitud del contador general. El cron de memoria no pasa por ese contador de usuario; debe entrar en el presupuesto global.
5. GLM en cuota separada del chat; conservar caché de escaneos, memoria semanal elegible y costes/guardado deterministas. El paquete prepagado no convierte su capacidad ni vigencia en ilimitadas.
6. Aviso al responsable al 75 % del presupuesto y bloqueo de nuevas generaciones antes de exceder el saldo, sin impedir abrir recetas, guardar cambios manuales o calcular costes. Mantener dos modos de chat; no cambiar silenciosamente de proveedor al agotar Opus ni añadir pantallas al recorrido del chef.
7. Probar simultaneidad, reinicios diarios/semanales y cambio de mes, cancelaciones/consumo incierto, errores antes y después de llamar, caché, cron y múltiples llamadas por escaneo. Validar tarifas y datos de facturación reales antes de anunciar una protección operativa de 50 EUR.

## Próximo paso

Los controles se implementaron y validaron en QA en la tarea posterior. Resolver la facturación pendiente de Gemini dentro del presupuesto autorizado y publicar junto con los pendientes del piloto. No volver a preguntar presupuesto o participantes. Consultar el informe actualizado antes de retomar estos requisitos históricos.
