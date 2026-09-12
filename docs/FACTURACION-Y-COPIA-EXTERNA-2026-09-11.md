# Facturación de Gemini y copia externa — 11 de septiembre de 2026

## Resultado comprobado

El usuario inició sesión en Google AI Studio y autorizó expresamente guardar únicamente las copias cifradas en una carpeta privada de su Google Drive, con la clave por separado.

**Copia externa completada:** carpeta [Atelier - Copias cifradas](https://drive.google.com/drive/folders/1RC5Mht61LVFcJ8G4IxJYGGRqLmt35S4F), en la unidad del titular. Se comprobó antes de subir que el acceso general era **Restringido** y que solo el propietario figuraba entre las personas con acceso. No se cambiaron permisos ni se enviaron invitaciones.

Drive confirmó dos subidas completadas: `atelier-2026-09-10T18-02-48-545Z-304264e0.atbak` y su `.atbak.json`. Posteriormente se leyeron desde la unidad de Google Drive ya instalada (`G:/Il mio Drive/Atelier - Copias cifradas`) y se comprobaron:

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `.atbak` | 1.930.797 | `513aa727ddf5229bd722282bb6981596225a48efec66016b6bb92c6a671ecb4c` |
| `.atbak.json` | 433 | `593b5da9067da946ad7056d6138ee5e05ae4fd4313a943e8da9de86168922459` |

La huella del paquete coincide con la copia local previamente descifrada y verificada. El manifiesto original conserva `offsite: false`: describe la creación local del 10 de septiembre; esta subida posterior se acredita aquí. No editar retroactivamente ese manifiesto ni confundirlo con un fallo de la subida.

**No se subió la clave.** Sigue en la carpeta local privada `output/atelier-backups/keys/recovery.key`. Se preguntó al usuario si prefiere custodiarla fuera del ordenador en su gestor de contraseñas o en una memoria USB; pendiente de respuesta. No mostrarla en mensajes ni almacenarla junto a los paquetes de Drive.

## Gemini: facturación activa y límite configurado

**Actualización del 11-09, aproximadamente 09:43 UTC:** el titular completó personalmente el vínculo desde Chrome y respondió «listo». El panel de proyectos muestra **Nivel 1 · Prepago** para `gen-lang-client-0628677395`, con gasto visible EUR 0,00. Ya no está pendiente activar la facturación.

En la página de pagos de esa cuenta se comprobó **Prepago: AI Studio**, **25,00 EUR disponibles**, agregados el 8 de septiembre, y **recarga automática desactivada**. No se compraron créditos ni se cambió ningún método de pago. El saldo de otros servicios de Google Cloud es independiente y no se ha modificado.

El clic Continuar había sido rechazado por la revisión automática porque exigía ejecución personal del titular. Se le mostró el formulario en su Chrome y él lo completó. No se eludió ese bloqueo ni se ejecutó el clic rechazado por otra herramienta.

Se configuró después el **límite mensual del proyecto en 20,00 EUR**, como protección adicional dentro del presupuesto común de 50 EUR del piloto. La pantalla Gasto confirmó **EUR 0,00 / EUR 20,00**. Es el límite experimental de Google: puede haber excedentes durante unos 10 minutos de latencia y se restablece el primer día de cada mes, según el panel en PST. No equivale al control conjunto de Atelier, que sigue pendiente de publicar; no garantiza un corte exacto de facturación ni añade otros 20 EUR al presupuesto autorizado. La recarga automática permanece desactivada. No se hizo una nueva generación de IA para validar un cambio que el propio panel ya acredita.

La consola muestra además un aviso relativo a los datos fiscales italianos del perfil. No se introdujeron ni modificaron datos fiscales; no inferirlos ni inventarlos.

## Pendientes reales

- **Completado:** vínculo de Gemini y límite de 20 EUR/mes en Google. Publicar el control conjunto de 50 EUR de Atelier con la entrega agrupada; ambos límites tienen periodos distintos.
- Custodiar la clave fuera del ordenador y por separado.
- **Completado posteriormente:** automatización «Copia diaria de Atelier» activa a las 09:00, copia y sincronización probadas; retención de todas las copias del piloto, avisos solo ante incidencias. Depende de este ordenador y Codex; primera ejecución por horario todavía no observada. [Funcionamiento y validación](COPIAS-DIARIAS-2026-09-11.md).
- Publicación agrupada de límites/cuotas, ideas sin conexión y apps: continúa pendiente; no hubo despliegue ni build durante esta tarea.

Detalle del cifrado y recuperación: [Copias y restauración](COPIAS-Y-RESTAURACION-2026-09-10.md).
