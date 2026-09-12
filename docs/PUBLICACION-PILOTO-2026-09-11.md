# Publicación del servidor del piloto — 11 de septiembre de 2026

## Resultado

Publicado y promovido `dpl_FfUPJPPNuKeYbfjQFFzqDcx9TUXB`, candidato `https://atelier-2-0-g0t9ffolr-andygomezgc-alts-projects.vercel.app`. Se comprobó que `https://atelier-2-0-mu.vercel.app` resuelve al nuevo despliegue. Promoción y comprobación final alrededor de las 14:06 UTC.

El servidor aplica 140 Gemini/Diario y 8 Opus/Creativo por chef en ventanas móviles de siete días, excepción de mensajes para la cuenta principal y asignación común de 50 EUR. Incluye las llamadas GLM y conserva reservas de consumo incierto. No se modificaron tarifas, proveedores, pagos, accesos ni roles. La asignación cubre nuevas generaciones registradas desde esta versión, no reconstruye facturas anteriores. Es un único periodo de un mes desde la primera reserva; no se renueva automáticamente.

El servidor incluye también los recibos de guardado de ideas para deduplicar reintentos. El comportamiento móvil sin conexión y el indicador de presupuesto requieren las próximas compilaciones; esta publicación no genera APK ni TestFlight.

## Migraciones y validación

- Aplicadas en producción: `20260909190000_retryable_ideas`, `20260910120000_ai_pilot_budget`, `20260910150000_weekly_daily_chat`. Lectura independiente confirmó 29 migraciones terminadas, ninguna fallida, columna semanal y existencia de la cuenta principal. No se borraron recetas.
- 89 pruebas enfocadas superadas y comprobación de tipos de los cinco paquetes correcta.
- Ensayo real en QA del presupuesto: concurrencia, cuotas, caducidad semanal, excepción, corte global, liquidación idempotente, reserva incierta y ausencia de renovación. Ensayo QA de ideas con cinco solicitudes concurrentes también superado. Cero generaciones reales de IA en estas pruebas.
- Compilación de Vercel terminada. Emitió avisos de instrumentación y del detector de empaquetado Prisma. La consulta real de base de datos desde el candidato y el dominio público respondió correctamente; no se observó fallo del motor en ejecución.
- Candidato antes de promover: `/api/health` correcto, base accesible; `/api/ai-budget` devuelve 401 sin sesión. Tras promover se repitieron ambos controles en el dominio público con el mismo resultado.
- Las comprobaciones de proveedores en `/api/health` validan configuración; no equivalen a generaciones pagadas. No se hizo todavía la prueba física con cuenta principal/chef en móviles ni una lectura autenticada del indicador publicado.
- Antes de promover, `AiBudget` aún no tenía la fila `pilot`: se crea con la primera generación admitida. No se sembró ni reinició el gasto para probar en producción.

## Copia y recuperación

Copia cifrada previa a migraciones: `atelier-2026-09-11T14-02-47-754Z-d6989930.atbak`, 1.930.797 bytes, SHA-256 `e2fb3f2f1122e5809c5181cf370de5ede9dcdd9c1398c16e7983acdeaf5d5b1b`. Incluye tres objetos Blob; dos referencias externas registradas sin descargar. Archivo y manifiesto observados en Drive web mediante Chrome, estado `cloud_confirmed` registrado a las 14:05:02 UTC. Tres copias conservadas. La sesión de Drive del navegador interno había caducado; Chrome seguía conectado. No confundir esta ejecución manual con la primera ejecución por horario.

La clave sigue custodiada como `atelier-backup.invalid` en Google Password Manager, codificada en Base64; archivo original intacto y CSV temporal ya eliminado. Ver `COPIAS-DIARIAS-2026-09-11.md` para recuperar los 32 bytes.

Anterior despliegue: `dpl_9xELXJ3xMUFBLAUC6wjJ4TVGEaY7`. Conservar como referencia, pero una reversión a él retira la protección de presupuesto. No revertir ni borrar las tablas contables automáticamente; no restaurar el volcado sobre datos posteriores sin una revisión específica.

## Siguiente etapa

Actualizar Android y iPhone sobre sus aplicaciones existentes; validar Perfil del titular, acceso de un chef, chat, guardado y reintento sin conexión. Completar privacidad y pruebas finales antes de distribuir a chefs. No hubo nuevas invitaciones, compras, cambios de autenticación, commits ni eliminación de cambios locales.
