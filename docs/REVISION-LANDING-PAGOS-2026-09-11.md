# Revisión de la landing y pagos de Atelier

Fecha: 11 de septiembre de 2026. Revisión sin activar cobros ni modificar precios o código de producto.

## Decisión posterior del usuario e implementación local

El usuario acepta preparar la landing para presentar Atelier y solicitar acceso al piloto. Aclara expresamente que el descuento fundador debe durar **como máximo tres meses**, no de por vida.

- La propuesta mantiene los importes existentes: 24,50 €/mes más IVA en los primeros tres meses de suscripción; desde el cuarto, 49 €/mes más IVA. Se muestra como propuesta de lanzamiento, no como venta abierta ni como precio ya configurado en Stripe.
- `/` y `/pro` comparten una landing con explicación de uso, tres beneficios, un plan por restaurante, preguntas frecuentes y acceso al piloto mediante correo. No generan enlaces de pago, ni siquiera si el servidor tiene configuradas las variables de Payment Links.
- El ejemplo visual tiene contenido de demostración y está identificado como tal. No es una captura de la aplicación; queda pendiente sustituirlo por una captura representativa autorizada antes de la presentación comercial definitiva.
- Se elimina de la presentación la promesa de descuento permanente y de uso ilimitado. La oferta tampoco anuncia diez plazas sin comprobar disponibilidad.
- La guía `STRIPE-SETUP.md` queda marcada como histórica. No se han cambiado productos, cupones, suscripciones ni webhooks de Stripe.
- Los apartados que siguen conservan los hallazgos de la revisión de la página anterior. Esta decisión posterior prevalece sobre la oferta de por vida descrita en ese estado observado.

### Validación local completada el 12 de septiembre

- Comprobación TypeScript de API correcta y rutas `/` y `/pro` compiladas y verificadas en navegador.
- Inspección de escritorio y móvil; anchuras de prueba 320, 390 y 768 px sin desbordamiento horizontal del documento.
- Navegación al acceso al piloto y apertura de preguntas frecuentes verificadas. Destinos de correo inspeccionados sin enviar mensajes. No hay enlaces de checkout en la nueva landing.
- La sección de límites en términos se actualiza al funcionamiento semanal del piloto y su presupuesto compartido; los términos comerciales completos siguen pendientes antes de cobrar.
- Vista local: `http://127.0.0.1:3011/`. No se ha publicado esta propuesta en producción ni se han activado pagos. La configuración del vencimiento del descuento en Stripe queda pendiente para la fase de contratación.

## Estado observado

- Página pública revisada: https://atelier-2-0-mu.vercel.app/pro. Inspección visual en escritorio y lectura del código. No se ha realizado una prueba de compra ni una validación visual en móvil.
- Identidad coherente: fondo crema, verde oscuro, acentos cálidos y tipografía con personalidad. Conviene conservarla.
- Dos tarjetas: Pro a 49 €/mes más IVA y Socio fundador a 24,50 €/mes más IVA, anunciado para siempre y para los primeros diez restaurantes.
- Actualmente ambos botones «Escribinos» abren correo electrónico; en la página pública observada no llevan a un checkout de Stripe.
- La página muestra tarifas y una lista breve, pero no enseña la aplicación ni un ejemplo concreto de su utilidad durante el trabajo.
- La portada de la web menciona TestFlight y no presenta la disponibilidad Android.
- El acceso comercial desde el perfil móvil está restringido en código a administradores Android que no tengan un plan fundador/Pro activo. Esto no sustituye una autorización en el servidor del proceso de compra.

## Propuesta de presentación

Mantener una página corta, pensada para verla desde el teléfono. Evitar convertirla en un catálogo de gestión de cocina.

1. Cabecera: «Tus ideas, recetas y equipo, en un mismo lugar».
2. Texto de apoyo provisional: «Guarda tus ideas, desarrolla recetas con ayuda de IA y consulta su coste con los precios de tu restaurante. Atelier te acompaña dentro y fuera de la cocina».
3. Una captura real de la aplicación, con contenido de demostración o autorizado. Mostrar receta, coste y acceso al chat sin llenar la página de pantallas.
4. Tres beneficios concretos: recuperar una idea cuando hace falta; crear y guardar recetas; compartirlas con el equipo y consultar costes cuando hay precios disponibles.
5. Un plan principal por restaurante. Presentar la oferta de fundador como una condición de lanzamiento del mismo plan, evitando que parezcan dos productos diferentes.
6. Explicar la IA en términos de uso diario y creativo, sin depender de nombres de modelos que puedan cambiar. Definir expresamente si los límites comerciales son por persona o por restaurante.
7. Cuatro preguntas frecuentes: dispositivos compatibles, incorporación del equipo, uso incluido de IA y cancelación/acceso a los datos.
8. Durante esta etapa, usar una llamada a solicitar acceso al piloto. Mantener el pago desactivado hasta cerrar sus condiciones y comprobar el flujo completo.

Los precios actuales son datos observados, no una recomendación validada. Medir consumo y tamaño de equipo en el piloto antes de comprometer precio definitivo, equipo sin límite o descuento perpetuo. Los límites del piloto —140 mensajes cotidianos y 8 creativos por persona cada siete días— no deben trasladarse automáticamente a una oferta comercial ilimitada en miembros.

## Pendientes técnicos antes de activar cobros

**Actualización 12 de septiembre:** la preparación local de checkout, portal, webhook y confirmación está descrita en [PREPARACION-PAGOS-2026-09-12.md](PREPARACION-PAGOS-2026-09-12.md). Aún faltan configuración y prueba integral en Stripe de prueba, recorrido web autenticado y revisión antes de publicar. Los puntos siguientes son los hallazgos iniciales que motivaron el trabajo.

- Asociación y autorización: la landing incorpora el parámetro `r` como `client_reference_id` del enlace de pago. El webhook utiliza esa referencia para actualizar el restaurante. Preparar un checkout creado por servidor que autentique al administrador y controle restaurante, precio y plan; revisar también reintentos y suscripciones duplicadas.
- Confirmación: `/gracias` muestra «Tu plan ya está activo» de forma incondicional. Sustituirlo por un estado verificado, contemplando pago pendiente y retraso del webhook.
- Eventos: existe una advertencia en el webhook sobre eventos recibidos fuera de orden. Verificar que un evento antiguo no sobrescriba el estado reciente de la suscripción.
- Cancelación: no se encontró una ruta de portal de cliente en la búsqueda realizada en el código de API y móvil. Definir y comprobar cómo cancela el administrador y hasta cuándo mantiene acceso.
- Oferta fundador: el límite de diez restaurantes aparece como texto. Comprobar o implementar su cumplimiento en el sistema de contratación antes de anunciarlo como condición real.
- Condiciones: corregir la referencia actual a un límite diario; acordar límites comerciales, renovación, impuestos y conservación de datos. Revisar que las condiciones publicadas correspondan al negocio y sus mercados.
- Validación final: compra de prueba, activación del restaurante correcto, fallo/reintento, cancelación, factura y lectura móvil; revisar el recorrido comercial previsto para cada plataforma antes del lanzamiento.

## Orden recomendado

Primero acordar texto y estructura, conservando la identidad visual. Después montar la landing de presentación sin cobros. Con los datos del piloto, cerrar oferta y límites. Finalmente completar y probar la contratación antes de abrir ventas.

## Archivos revisados

- `apps/api/app/pro/page.tsx`
- `apps/api/app/page.tsx`
- `apps/api/app/gracias/page.tsx`
- `apps/api/app/terminos/page.tsx`
- `apps/api/app/api/stripe/webhook/route.ts` (revisión parcial del manejo de eventos)
- `apps/mobile/src/components/ProfileSheet.tsx`

Esta revisión no certifica el funcionamiento completo de Stripe ni la configuración de su cuenta; identifica lo visible y los puntos que requieren comprobación antes de vender.
