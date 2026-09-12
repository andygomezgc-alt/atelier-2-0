# Preparación del piloto — 10 de septiembre de 2026

## Alcance confirmado

El usuario prepara Atelier para chefs en **Android e iPhone**, con cuenta Apple/app iOS existentes. Acuerdo actualizado: unos **cinco chefs**, **50 EUR para un mes** del conjunto, **140 Gemini y 8 Opus por chef en ventanas móviles de siete días**, utilizables juntos. La cuenta principal queda sin cuotas de mensajes, dentro del presupuesto compartido. Control implementado y probado localmente, pendiente de publicación. Mantener simplicidad. [Implementación y pruebas](CONTROL-GASTO-IA-2026-09-10.md).

**Aclaración posterior del usuario:** mantener el acceso iPhone que ya funciona. Android permanece con Google; iPhone conserva Apple y Google. El login móvil actual no ofrece correo. No retirar Apple, no reabrir el registro por email ni migrar cuentas para preparar el piloto.

## Estado comprobado

- El servidor público respondió `status: ok` con comprobaciones de base, Anthropic, Gemini, Z.AI y Resend correctas. Esta salud técnica no verifica envío a un nuevo destinatario ni una receta completa con cada modelo.
- Android disponible: versión 3, build `2361ab2e-d4ff-457c-b4b9-a7f8055c239a`, incluye Nuevo chat.
- Último build iOS consultado en EAS: `9bffed12-a5b8-4a43-bdc5-c10ada51dd4d`, `FINISHED`, versión 0.1.0/build 8, creado el 30 de julio. Es anterior a las mejoras recientes. No se verificó aquí el grupo ni la disponibilidad actual en App Store Connect.
- Ideas sin conexión: corrección probada, pendiente de publicación de API/migración y ambas apps.
- Copias: respaldo real cifrado, los tres archivos Blob y copia externa en Drive comprobados. Rutina diaria activa a las 09:00 desde Codex; recorrido probado, preserva copias y avisa ante incidencias. Depende de este ordenador; primera ejecución por horario aún no observada. Ensayo de restauración: 28 tablas/53 filas sintéticas y 29 migraciones en QA. Falta custodia externa separada de la clave. [Detalle](COPIAS-DIARIAS-2026-09-11.md).

## Orden de cierre

| Prioridad | Trabajo | Criterio para darlo por cerrado |
| --- | --- | --- |
| 1 | Verificación final de acceso y equipo | Mantener los accesos existentes. Confirmado en código: el creador queda admin; los invitados entran como lector y el admin los cambia desde Casa → Staff → miembro. Probar ese recorrido en ambas versiones finales. |
| 2 | IA y gasto | Condiciones de uso y facturación de Gemini resueltas; límite efectivo del gasto del piloto definido y aplicado; generación completa con ambos chats y extracción comprobadas. |
| 3 | Datos y privacidad | Copia reciente de producción, ejecución periódica y custodia externa; archivos externos cubiertos; política coherente con Anthropic, Google y Z.AI, memoria y borrado. |
| 4 | Prueba funcional final | En ambos teléfonos: idea/chat nuevo/historial, receta guardada y reabierta, costes kg/l, alérgenos, menú/PDF, escaneo de restaurantes distintos y cortes de conexión. Verificar también una ejecución real del cron de memoria. |
| 5 | Publicación coherente | Servidor y migraciones primero; después APK y actualización iOS. Instalar sobre la versión anterior sin pérdida de cuenta/datos. Acceso a la beta iOS verificado. |
| 6 | Entrega y seguimiento | Instrucciones breves de instalación y primera receta, restaurante/código/rol preparados, canal para incidencias y comprobación de recepción de errores técnicos. Versión de código identificada y recuperación del despliegue documentada. |

## Hallazgos concretos que atender

**Correo de acceso — no bloquea el piloto actual:** el formulario móvil ya no ofrece email. La ruta heredada `apps/api/app/api/mobile/auth/request/route.ts` espera `emails.send()` pero no revisa el resultado; el SDK puede devolver `error` sin lanzar una excepción. Conservar como pendiente si se reactiva ese método. La revisión inicial lo clasificó incorrectamente como requisito del alta móvil. No se enviaron correos ni se modificaron rutas de acceso. El backend y deep link antiguos siguen existiendo; no describirlos como desactivados.

**Invitados:** `apps/api/app/api/restaurant/join/route.ts` asigna `viewer`. La matriz de permisos no permite a ese rol capturar ideas, editar recetas o gestionar productos. No es autorización para elevar automáticamente a todos: preparar el rol de cada participante y explicar al administrador el paso existente.

**Creador del restaurante:** `POST /api/restaurant` crea el restaurante y asigna `admin` al creador en una transacción. La respuesta incluye el rol y la app lo aplica inmediatamente. No requiere otra función ni una elevación manual. El cambio de categoría de otros miembros ya existe en `StaffMemberSheet` y la API lo reserva al administrador del mismo restaurante.

Revisión de accesos y roles del 10-09: 46 pruebas de Apple/Google, identidad, invitación y miembros, más 9 de sesión móvil, superadas. Las 8 pruebas heredadas de correo agotaron el arranque en la ejecución conjunta y pasaron aisladas; usan un proveedor simulado, no envían emails. Total: 63. Sin cambios de código ni publicación y sin nueva prueba física en iPhone.

**Gemini:** facturación activa comprobada el 11-09 como **Nivel 1 · Prepago**, tras vincularla personalmente el titular. Crédito observado 25 EUR y recarga automática desactivada. Límite adicional de Google guardado en **20 EUR/mes**, confirmado en pantalla; permite excedentes por latencia de unos 10 minutos y tiene reinicio mensual propio. Forma parte de los 50 EUR comunes, no los amplía. [Detalle](FACTURACION-Y-COPIA-EXTERNA-2026-09-11.md). El vínculo resuelve el requisito de proyecto con facturación activa señalado en las [condiciones de Gemini API](https://ai.google.dev/gemini-api/terms), apartados Use Restrictions y Paid Services, para el piloto europeo. No se compraron créditos.

**Presupuesto implementado, publicación pendiente:** 50 EUR/140 Diario por siete días/8 Creativo por siete días; titular sin cuota de mensajes dentro del gasto común. Reserva transaccional antes de cada generación, incluidas memoria y llamadas del escaneo, margen conservador y retención de costes inciertos. Migraciones solo QA, 555 pruebas y tipos correctos; las exportaciones Hermes anteriores a este ajuste semanal fueron correctas. Aviso al 75 % en Perfil del titular, sin push/email ni automatización. Estos límites de Atelier todavía no están publicados, aunque la facturación Gemini y su tope propio sí están activos. [Informe](CONTROL-GASTO-IA-2026-09-10.md).

**iPhone:** usar la app y firma existentes. Preparar y verificar la actualización en TestFlight; si se distribuye a testers externos, comprobar el estado de revisión y el grupo. Fuente: [TestFlight de Apple](https://developer.apple.com/testflight/). No se creó un build ni se enviaron invitaciones.

**Fidelidad del menú:** probar documentos de más de un restaurante con GLM real. Los diseños sintéticos y la lectura de Koko no garantizan copia exacta de fuentes, logos o composición en cualquier documento. Corregir los problemas que aparezcan sin convertir el flujo en un editor complejo.

## Lo que puede esperar

Versiones avanzadas de recetas, analítica extensa, más modelos y nuevas pantallas. Suscripciones/cobros pueden esperar si el piloto es gratuito. La paginación se prioriza si el volumen previsto supera las listas actuales; no es requisito automático para un grupo pequeño.

Tras cerrar los puntos anteriores, distribuir a un grupo pequeño y ampliar según resultados de uso. Recoger fricciones y errores antes de ampliar funciones. No se promete fecha cerrada hasta completar la validación en iPhone y resolver la configuración operativa.
