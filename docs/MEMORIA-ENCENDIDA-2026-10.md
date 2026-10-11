# Memoria encendida — octubre de 2026

Entrega 3 de la memoria culinaria. Rama `feat/memoria-encendida`. Plan y evidencia en `odd/tasks/memoria-encendida.md`. Estado: implementada en la rama, sin fusionar con `main` y sin desplegar.

## Qué cambió

- **Memoria encendida por defecto.** Los restaurantes nuevos nacen con la memoria encendida. La migración la enciende también en los restaurantes que nunca guardaron una decisión.
- **Ciudad o zona.** Campo opcional en «Nuestra cocina» y al crear el restaurante. Se guarda en `Restaurant.city` (80 caracteres como máximo).
- **Nombre y mes para el asistente.** El asistente recibe el nombre de perfil de quien escribe, la ciudad o zona si existe y el mes actual. El nombre y el mes van en un bloque dinámico, fuera del prefijo cacheado que comparte el equipo.
- **Recetas cargadas.** Las que llegan de PDF, Word, foto o Google Docs quedan **aprobadas si las carga un administrador** y **en prueba si las carga el chef ejecutivo o el sous-chef**. La memoria aprende de la receta poco después de la carga, sin esperar a la semana: espera unos 3 minutos de calma tras la última carga y aprende una sola vez con todas (ver «Aprendizaje agrupado»).
- **Ingredientes frecuentes.** La memoria cuenta, sin IA, en cuántas recetas en prueba o aprobadas aparece cada ingrediente, y añade los más repetidos (como máximo 10, presentes en al menos 2 recetas). Se excluyen los básicos (sal, pimienta, agua, aceite).
- **Botón «Memoria» en el chat.** Botón verde (encendida) o gris (apagada) en la fila de acciones del chat. Abre «Nuestra cocina», donde se enciende o se apaga. Sin restaurante seleccionado no aparece.

Commits de la rama: E1 `7744427` (cimientos), E2 `bf64a66` (nombre, ubicación y mes), E3 `66d3228` (ingredientes frecuentes), E4 `9372f6e` (memoria al crear el restaurante), E5 `54495d4` (cargas y aprendizaje al momento), E6 `5d94a58` (origen de las cargas en la app), E7 `2b14c87` (botón «Memoria»), E8 `03d398b` (ciudad en la app), E9 (este documento y la privacidad).

## Para quién

- **Restaurantes nuevos:** nacen con la memoria encendida.
- **Restaurantes que nunca decidieron:** la migración la enciende. Se rehace su contexto preparado en el siguiente mensaje.
- **Restaurantes que la apagaron:** siguen apagados. La migración no toca las filas existentes con `enabled = false`.
- **Administradores y chefs:** las cargas de un administrador quedan aprobadas; las del chef ejecutivo y el sous-chef, en prueba. Así el chef ejecutivo no queda bloqueado por la edición de recetas aprobadas, que solo puede hacer el administrador (también el precio de venta y los alérgenos).
- **Apps antiguas:** siguen funcionando con el servidor nuevo, con tres diferencias. Guardan las cargas como borrador (no envían `origin`), no muestran el botón «Memoria» y no muestran el campo de ciudad.

## Coste

- Nombre y mes: unos **25 tokens más por mensaje**, dentro del prefijo que se cachea con el hilo.
- Ingredientes frecuentes: **hasta unos 80 tokens** más, dentro del bloque de memoria cacheado.
- Aprendizaje: **una llamada a GLM por restaurante** en el primer cron después del despliegue (05:00 UTC), con un coste inferior a 1 céntimo. Después, el aprendizaje sigue la cadencia semanal, salvo en las cargas, que aprenden unos 3 minutos después de la última de una ráfaga, con una sola llamada.

## Cómo volver atrás

- **Apagar la memoria de un restaurante:** Perfil → Nuestra cocina, o el botón «Memoria» del chat. No hace falta tocar el código ni la base de datos.
- **Revertir el código:** revertir los commits de la rama (E9 primero, después E8 hasta E1). La migración es aditiva: la columna `city` y el valor por defecto `true` quedan en la base, y el código anterior los ignora. Las filas que la migración encendió siguen encendidas hasta que alguien las apague.
- Revertir no borra las tendencias ya guardadas; se borran desde «Nuestra cocina» o al borrar la memoria.

## Orden de entrega

1. **Servidor primero:** fusionar la rama con `main` y dejar que Vercel aplique la migración. Solo `main` despliega.
2. **Después, los binarios Android e iPhone.** Las apps nuevas necesitan el servidor nuevo para enviar `origin`, la ciudad y el botón «Memoria».

Nada de esto se fusiona ni se despliega sin decisión de Andy.

## Estado (11-10-2026)

En producción desde el 11-10-2026: servidor (PR #14 a #20), Android versionCode 8 e iPhone build 14 en TestFlight.

## Aprendizaje agrupado (12-10-2026)

Antes, cada receta cargada lanzaba su propia llamada de pago a la IA: 20 cargas seguidas eran unas 20 llamadas. Ahora:

- Cada carga recibe un número (ticket) en la misma transacción que la receta y espera unos 170 s; cada 15 s mira si llegó otra carga después. Si llegó, se retira (`debounced`); solo la última aprende, una vez, con todas las recetas nuevas.
- Si la espera no deja tiempo para una corrida completa dentro del límite de Vercel (300 s), no empieza a pagar (`deferred`) y deja una marca.
- Si Vercel corta la última espera, la marca queda guardada y el cron diario la aprende una sola vez.
- Cargas separadas más de unos 3 minutos siguen aprendiendo cada una, como antes.
- En los registros, una ráfaga se ve como N−1 `debounced` y 1 `completed` en `culinary_memory_import_run`, con `elapsedMs`.

Vuelta atrás: revertir los commits de `feat/aprendizaje-agrupado`; la migración (`importTicket`, `importPendingAt`) es aditiva y puede quedarse.
