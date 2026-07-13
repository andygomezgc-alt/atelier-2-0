# Configurar Stripe para Atelier — Guía paso a paso

Esta guía te lleva de la mano para crear tu cuenta de Stripe (la plataforma que procesa los cobros de Atelier) y dejar todo listo para cobrarle a **Kokoo**, el primer restaurante piloto. No hace falta saber programar: son todo clics en una página web.

Vas a necesitar a mano:
- Tu email y los datos fiscales de tu actividad en Italia (partita IVA, dirección, etc.)
- El IBAN de la cuenta donde querés que caiga la plata
- Un documento de identidad (para la verificación)
- 20-30 minutos

---

## Paso 1 — Crear la cuenta en stripe.com

1. Entrá a **https://stripe.com** y hacé clic en **"Sign up"** / "Empezar ahora".
2. Completá con tu email, un nombre y una contraseña. Confirmá el email que te llega.
3. Stripe te va a pedir datos del negocio:
   - País: **Italia**.
   - Datos fiscales: tu **partita IVA** (o los datos que uses como autónomo/ditta individuale) y la dirección de tu actividad.
   - **IBAN**: la cuenta bancaria donde Stripe deposita la plata que cobrás. Te lo pueden pedir en este paso o más adelante, en "Configuración de pagos".
4. Confirmá. Ya tenés la cuenta creada.

Aclaración: **abrir la cuenta es gratis**. Stripe no cobra nada por tenerla ni por mes. Lo que cobra es una comisión por cada pago que te hacen: aproximadamente **1,5%-2,5% + 0,25€ por transacción** (varía según el tipo de tarjeta). Esa comisión se descuenta sola antes de que te llegue la plata — vos no tenés que hacer nada para pagarla.

---

## Paso 2 — Activar los pagos (verificación de identidad)

Antes de poder cobrar de verdad, Stripe te pide verificar quién sos. Es una exigencia legal antifraude que le hacen a todo el mundo, no algo particular de Atelier.

1. En el panel de Stripe vas a ver un aviso o una barra de progreso, algo como **"Completa tu perfil"** / **"Activate payments"**.
2. Te va a pedir subir una foto de tu **documento de identidad**.
3. Puede pedirte confirmar también el IBAN y algún dato más del negocio.
4. Una vez enviado, Stripe revisa todo (a veces es automático y en minutos, a veces tarda 1-2 días). Te llega un email cuando queda aprobado.

Hasta que esto no esté aprobado no podés cobrar en serio, pero podés seguir preparando todo lo demás (pasos 3, 4 y 5) mientras esperás.

---

## Paso 3 — Crear los productos

Acá definimos los dos precios que vende Atelier.

1. En el menú de la izquierda, andá a **Catálogo de productos** ("Product catalog") → **Productos**.
2. Hacé clic en **"+ Añadir producto"**.
3. Primer producto:
   - Nombre: **Atelier Pro**
   - Precio: **49,00 €**
   - Tipo de cobro: **Recurrente / Suscripción**, frecuencia **Mensual**.
   - Impuestos: elegí que el precio **no incluye impuestos** ("tax exclusive" / precio sin IVA). Así el 49€ queda limpio y, si corresponde cobrar IVA, Stripe lo suma aparte en vez de descontarlo de los 49€.
   - Guardá.
4. Segundo producto:
   - Nombre: **Atelier Socio Fundador**
   - Precio: **24,50 €**
   - Tipo de cobro: **Recurrente / Suscripción**, frecuencia **Mensual**.
   - Impuestos: igual que arriba, **precio sin IVA incluido**.
   - Guardá.

Nota: el precio anual (490€/año) todavía no lo creamos — es una opción para más adelante, no hace falta para cobrarle a Kokoo ahora.

---

## Paso 4 — Crear el Payment Link del Fundador (el que le mandás a Kokoo)

Un **Payment Link** es una página de pago ya lista que Stripe genera con un solo link: se la mandás a alguien por WhatsApp, la persona pone su tarjeta ahí, y queda suscripta. No hay que programar nada.

1. Andá a **Payment Links** en el menú de la izquierda → **"+ Nuevo"**.
2. Elegí el producto **Atelier Socio Fundador (24,50€/mes)** que creaste en el paso anterior.
3. Dejá el link **sin período de prueba** ("free trial"): este es el link para Kokoo, una venta directa, no una prueba gratis. (Los links públicos que armemos más adelante para otros restaurantes sí van a llevar 14 días de prueba — pero ese es otro link, no este.)
4. Creá el link. Stripe te va a mostrar una URL parecida a `https://buy.stripe.com/xxxxxxxxxxxx`.
5. **Paso clave**: a esa URL le agregás al final, tal cual, esto:

   ```
   ?client_reference_id=cmq7wxcnh00017kvgdqueol5l
   ```

   Entonces el link completo que le mandás a Kokoo queda así:

   ```
   https://buy.stripe.com/xxxxxxxxxxxx?client_reference_id=cmq7wxcnh00017kvgdqueol5l
   ```

   (reemplazando la parte `xxxxxxxxxxxx` por la que te haya generado Stripe a vos — el `?client_reference_id=...` de atrás va igual, sin cambiarlo).

   **¿Por qué hace falta esto?** Ese código (`cmq7wxcnh00017kvgdqueol5l`) es el identificador interno del restaurante "Kokoo" dentro del sistema de Atelier. Cuando Kokoo paga a través de ese link, ese código le indica a nuestro sistema exactamente **qué restaurante** pagó, para activar automáticamente a ese restaurante y no a otro.

6. Mandale ese link completo a Kokoo por WhatsApp.

---

## Paso 5 — Configurar el webhook

Un **webhook** es un aviso automático: cada vez que pasa algo importante en Stripe (alguien paga, cancela una suscripción, etc.), Stripe le manda un mensaje a nuestro servidor para que se entere y reaccione — por ejemplo, activando el restaurante que pagó.

1. Andá a **Developers** ("Desarrolladores") → **Webhooks** → **"+ Add endpoint"** ("Añadir destino").
2. En **"Endpoint URL"** pegá exactamente:

   ```
   https://atelier-2-0-mu.vercel.app/api/stripe/webhook
   ```

3. En la lista de eventos a escuchar, buscá y marcá estos tres:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Guardá / creá el endpoint.
5. Stripe te va a mostrar un **"Signing secret"**: una clave que empieza con `whsec_...`.
   - **Copiala entera.**
   - **Pegásela a Claude en el chat.** Claude la sube al servidor (Vercel) y verifica que quedó bien conectada.

Aclaración de seguridad: ese `whsec_...` es una clave chica pensada para vivir en el servidor, y solo sirve para confirmar que los avisos son realmente de Stripe — no es la clave general de tu cuenta. La clave grande de la cuenta (la que empieza con `sk_live_...`) **no hace falta compartirla ahora, ni con Claude ni con nadie**.

---

## Paso 6 — Qué pasa después de que alguien paga (el circuito completo)

Para que tengas el panorama de lo que ya queda funcionando solo, sin que vos tengas que tocar nada:

1. El chef (por ejemplo, Kokoo) hace clic en tu link y paga con tarjeta.
2. Stripe le avisa automáticamente a nuestro servidor (el webhook del Paso 5).
3. El restaurante queda **activado** en Atelier automáticamente.
4. La plata te llega a tu IBAN **cada semana** (es el calendario de pago estándar de Stripe).
5. Los **recibos/facturas al cliente** los manda Stripe solo, por email — no tenés que hacer nada vos.

---

## Paso 7 — Nota fiscal (fattura elettronica / SDI)

Si el cliente es una empresa italiana (B2B) y necesita **fattura elettronica** con envío al **SDI**, eso corre por fuera de Stripe: es un tema para charlar con tu **commercialista**. Existen integraciones para conectar Stripe con sistemas de facturación electrónica italianos, pero cuál usar (y si hace falta ya desde el primer cobro a Kokoo) es una decisión para tomar con él, no algo que resolvemos acá.

---

## Checklist final

- [ ] Cuenta de Stripe creada y verificada (pagos activados)
- [ ] Productos creados: **Atelier Pro** (49€/mes) y **Atelier Socio Fundador** (24,50€/mes)
- [ ] Payment Link del Fundador armado, con `?client_reference_id=cmq7wxcnh00017kvgdqueol5l` pegado al final, y mandado a Kokoo
- [ ] Webhook configurado en `https://atelier-2-0-mu.vercel.app/api/stripe/webhook` con los 3 eventos
- [ ] Signing secret (`whsec_...`) copiado y pegado a Claude en el chat
