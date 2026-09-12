# Nuevo chat e historial — 9 de septiembre de 2026

## Problema confirmado

La pestaña Asistente conserva su estado al salir y volver, pero no había ninguna acción para iniciar una conversación independiente. El historial solo permitía volver a chats existentes, y los chats sin idea anclada mostraban todos el mismo texto genérico.

El usuario confirmó primero que el problema de guardado de recetas estaba resuelto y solicitó revisar este flujo.

## Cambio

- Botón visible «Nuevo chat» junto a «Historial», con área táctil de 48 dp y textos en español, italiano e inglés.
- Mantener el chat al cambiar de pestaña sigue siendo deliberado. La nueva acción limpia mensajes, texto y referencia a la idea anterior; conserva el modelo elegido y la memoria culinaria del restaurante.
- Abrir un chat vacío no crea registros ni llama a IA. La conversación se crea al enviar el primer mensaje.
- El historial muestra la idea anclada o los primeros 140 caracteres del primer mensaje del chef. Se calcula con reglas y no consume tokens. Conserva el alcance por restaurante y el límite existente de 50 conversaciones; no se han añadido borrado ni paginación.
- Solo se pide confirmación al abandonar texto sin enviar, un chat local todavía no guardado o un envío fallido. Una conversación guardada y terminada se deja en un toque.
- Durante generación, dictado o extracción de receta, las acciones de cambio quedan desactivadas para no interrumpir el trabajo en curso.
- Cargar un chat muestra espera y, si falla, permite reintentar; impide enviar mensajes a una conversación cuya carga falló. El historial también muestra el error de red en lugar de aparentar estar vacío.
- Generaciones de sesión invalidan resultados antiguos al navegar; cambiar de idioma ya no reinicia el chat.

## Verificación

- 129 pruebas de móvil superadas en la ejecución final, incluidas las nueve nuevas de navegación.
- Nueve pruebas nuevas montan la pantalla real con transporte y componentes nativos sustituidos: abrir desde chat guardado/anclado, chat sin ID en URL, recuperación desde historial, borrador, preview, carga tardía, fallo/reintento, generación y dictado en curso, envío fallido. No usan IA ni datos reales.
- Cuatro pruebas de API verifican nombres acotados, idea anclada, chats vacíos, aislamiento por restaurante y creación de chats independientes.
- Cinco pruebas de idiomas superadas; tipos de móvil y API correctos. Total de pruebas ejecutadas para esta entrega: 138.
- Exportación Android/Hermes correcta: 2292 módulos, bundle de 6,7 MB en `tmp/chat-android-export`. Grafo actualizado y `git diff --check` sin errores en los archivos modificados de esta tarea.
- Se añadió `react-test-renderer` 19.2.3 solo para pruebas. React avisa que este renderizador está obsoleto; los casos no sustituyen una prueba física de navegación, teclado o accesibilidad en Android.
- Sin migraciones ni modificación de recetas/conversaciones del usuario durante la comprobación.

## Publicación

Compilación Android completada. Tras el bloqueo inicial de revisión automática, el usuario respondió «Si autorizo» a la petición expresa de subir esta corrección a Expo EAS (cuenta `andygome`, proyecto `atelier`) y Vercel (proyecto `atelier-2-0`). Autorización recibida; no volver a solicitarla para completar esta publicación.

Vercel publicado: `dpl_9xELXJ3xMUFBLAUC6wjJ4TVGEaY7`, https://atelier-2-0-odrgbnlsy-andygomezgc-alts-projects.vercel.app. Compilación Linux correcta, salud del candidato verificada y promoción completada. Dominio público https://atelier-2-0-mu.vercel.app/api/health con `status: ok` a las 17:27 UTC del 9 de septiembre. Despliegue anterior recuperable: `dpl_ChoCyN7j4mruneQ7pqvN6YijnVvi`.

APK terminado: EAS `2361ab2e-d4ff-457c-b4b9-a7f8055c239a`, estado `FINISHED`, finalizado el 9 de septiembre a las 18:40:26 UTC. Perfil `pilot`, Android `versionCode: 3` (anterior: 2), firma remota existente conservada, SDK 56. [Página del build](https://expo.dev/accounts/andygome/projects/atelier/builds/2361ab2e-d4ff-457c-b4b9-a7f8055c239a).

[Descargar APK con Nuevo chat](https://expo.dev/artifacts/eas/JLApXEBBVGj_k2_IbwKod0APLaFTVv6k-A94dmQkWJs.apk). Enlace verificado: HTTP 200, 111.355.754 bytes. EAS informa caducidad de esta distribución el 23 de septiembre de 2026. No crear otro build para entregar esta corrección.

La demora anterior fue la cola gratuita de Expo, confirmada en la ficha pública. No se compró prioridad ni se creó una automatización. La consulta posterior, al revisar los pendientes de la app, confirmó la finalización; ya no queda seguimiento de compilación pendiente.

El APK anterior instalado sigue funcionando con el nuevo servidor, pero el botón aparece al instalar esta actualización. Instalar sobre la versión anterior. La instalación física y la prueba de uso quedan a cargo del usuario; no se ha instalado remotamente en su teléfono.

Prueba física recomendada: enviar un mensaje, tocar Nuevo chat, comprobar pantalla vacía, abrir Historial y recuperar la conversación anterior. Probar también cancelar al dejar texto sin enviar y salir/volver de otra pestaña.
