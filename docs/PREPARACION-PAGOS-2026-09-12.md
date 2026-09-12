# Preparación técnica de pagos — 12 de septiembre de 2026

## Estado

Implementación local, sin publicación ni llamadas reales a Stripe, sin crear productos/cupones y sin activar cobros. La landing sigue invitando a solicitar acceso al piloto por correo. No se modifican APK, TestFlight, acceso de los chefs ni presupuesto de IA.

Decisión comercial vigente: propuesta Pro de 49 €/mes más IVA; descuento fundador del 50% durante los primeros tres meses de suscripción, y tarifa normal desde el cuarto. No hay descuento de por vida ni nueva prueba gratuita acordada.

## Implementado

- `POST /api/stripe/checkout`: cerrado salvo `BILLING_CHECKOUT_ENABLED=1`. Exige autenticación y administrador del restaurante. El servidor fija restaurante, precio, descuento y URLs; ignora esos valores si llegan del cliente. Protección de origen para cookies y limitación de intentos por proceso.
- Valida el precio: EUR, 49 euros, mensual, unidad, uso no medido e impuestos aparte. Valida el cupón: 50%, tres meses, aplicable al producto. La elegibilidad fundador se decide mediante una lista de restaurantes autorizados en el servidor, y no se repite para un cliente que ya tuvo suscripción.
- Creación de cliente con clave de idempotencia, bloqueo por restaurante y reutilización de checkout abierto. No crea otra compra si hay una suscripción no terminada o si no puede revisar todo el historial disponible. Los clientes históricos sin asociación validada necesitan conciliación antes de usar el flujo nuevo.
- `POST /api/stripe/portal`: mismo control de administrador. Usa exclusivamente el cliente del restaurante y una configuración explícita de Stripe con cancelación al final del período, sin cambios de plan en el portal.
- Webhook: conserva firma e idempotencia atómica, comprueba sesión pagada y asociación del cliente/restaurante/precio, y consulta la suscripción actual después de bloquear la fila del restaurante. No aplica snapshots antiguos ni usa el customer como atajo para enlazar otra suscripción. Un fallo de Stripe o DB devuelve error para permitir reintento.
- `checkout.session.async_payment_succeeded` completa pagos que no estaban confirmados al recibir `checkout.session.completed`.
- Los Payment Links históricos con solo `client_reference_id` ya no activan restaurantes. Es una restricción deliberada del código nuevo; antes de publicarlo debe confirmarse que no queden enlaces o suscripciones comerciales dependientes del flujo anterior.
- `/gracias`: distingue activo, pendiente, caducado, inactivo y no verificable. No modifica datos ni devuelve información personal. Solo confirma activo si coinciden pago, suscripción vigente y activación en la base de datos. Sin sesión válida no muestra éxito. Página dinámica, sin indexación y con meta de no enviar referente.
- La etiqueta fundador vuelve a Pro al sincronizar la suscripción cuando el descuento ha terminado; el importe cobrado lo controla Stripe, no esta etiqueta.

## Validación

Antes de corregir el webhook se reprodujo el fallo: un checkout con `payment_status=unpaid` activaba el restaurante. La prueba de regresión falló con el código anterior.

Tras los cambios: 62 pruebas locales específicas pasan (34 de facturación, 18 del webhook, 10 de autorización/origen). Se simulan Stripe y Prisma: no son una compra real ni una prueba de concurrencia contra PostgreSQL. TypeScript de API también pasa.

La ruta local `/gracias` se compiló y se comprobó por HTTP (200) y visualmente en navegador: sin `session_id` muestra «Consulta tu plan en Atelier», sin afirmar que se haya pagado. El grafo de código se actualizó sin uso de IA.

## Próximo paso antes de vender

1. Preparar productos y cupón en Stripe **de prueba**, con origen de retorno y portal de prueba. Valores descritos en `.env.example`; mantener producción desactivada.
2. Completar el recorrido web autenticado del administrador y su acceso desde la aplicación. Los endpoints están preparados, pero la landing pública no ofrece botones de contratar/cancelar. No cambiar las formas de inicio de sesión existentes de los chefs para resolver este recorrido.
3. Comprobar en sandbox con base de datos aislada: compra Pro, fundador, reintento y doble clic concurrente, pago asíncrono, caducidad, impago, cancelación al final del mes y recuperación. Usar reloj de prueba de Stripe para comprobar tres meses de descuento y tarifa normal en el cuarto.
4. Revisar configuración de impuestos y facturación, importes y condiciones definitivas, límites comerciales de IA/equipo, y el recorrido permitido en cada plataforma. La configuración de impuestos automáticos en el código no certifica obligaciones fiscales ni registros de la cuenta.
5. Conciliar cualquier enlace/suscripción Stripe previo antes de reemplazar el webhook publicado. Configurar los cuatro eventos manejados y validar el flujo con la versión de API de la cuenta. No anunciar contratación disponible hasta completar estas comprobaciones.

No se aplicó ninguna migración. Las consultas de Stripe dentro de las transacciones tienen timeout y serializan solo el restaurante afectado; las pruebas de integración deben comprobar tiempos y reintentos bajo concurrencia antes de activar ventas.

## Referencias oficiales consultadas

- [Cupones de suscripción y duración](https://docs.stripe.com/billing/subscriptions/coupons)
- [Creación de Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Confirmación de pagos y estados pendientes](https://docs.stripe.com/checkout/fulfillment)
- [Entrega de webhooks](https://docs.stripe.com/webhooks)
- [Sesiones del portal de cliente](https://docs.stripe.com/api/customer_portal/sessions/create)

La guía antigua `STRIPE-SETUP.md` es histórica y no debe ejecutarse.
