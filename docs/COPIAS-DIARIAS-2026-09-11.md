# Copias diarias de Atelier — 11 de septiembre de 2026

## Estado

Automatización de Codex **activa**, nombre «Copia diaria de Atelier», ID `copia-diaria-de-atelier`, ligada a esta tarea. Programada cada día a las **09:00, hora de Italia**. Creada y consultada mediante la herramienta de automatizaciones, sin tareas alternativas de Windows ni cron adicional.

El recorrido completo fue probado manualmente antes de programarlo: nueva copia de producción, cifrado, transferencia por Google Drive para escritorio, observación de ambos archivos en Drive web y confirmación registrada. La primera ejecución disparada por el horario aún no se ha observado.

**Depende de este ordenador:** debe estar encendido, con Codex ejecutándose, acceso a Internet, la unidad de Google Drive disponible y sesión válida para comprobar Drive web. El respaldo es código determinista y no llama a Gemini, Opus ni GLM; el seguimiento programado sí utiliza Codex y su cuota. No es una tarea alojada independientemente del ordenador. [Documentación oficial de tareas programadas](https://learn.chatgpt.com/docs/automations?surface=app).

## Funcionamiento

- `scripts/backup-daily.mjs` reutiliza una copia completa del mismo día en Europe/Rome. Si no existe, ejecuta `backup-production.mjs`, de solo lectura sobre producción. Cada copia conserva su propia instantánea, archivos y cifrado.
- `scripts/lib/backup-sync.mjs` admite únicamente `.atbak` válidos de la carpeta autorizada `archives` y su manifiesto. Comprueba formato cifrado, tamaños y SHA-256; rechaza archivos fuera de la carpeta, enlaces simbólicos, cambios de destino, datos dañados y archivos de destino distintos. Nunca incluye claves ni volcados sin cifrar.
- Destino: [Atelier - Copias cifradas](https://drive.google.com/drive/folders/1RC5Mht61LVFcJ8G4IxJYGGRqLmt35S4F), privado y solo del titular. La carpeta local correspondiente es `G:/Il mio Drive/Atelier - Copias cifradas`. Un marcador `.atelier-backup-target.json`, sin secretos, permite detectar un cambio accidental de destino. La configuración privada contiene su identificador.
- Se reintenta la transferencia de todas las copias locales pendientes. La creación exclusiva evita sobrescribir archivos existentes. Una segunda ejecución del mismo día no crea otro volcado ni duplica archivos ya correctos.
- La escritura y lectura en G: solo se registra como `awaiting_cloud_confirmation`. La automatización debe observar el archivo exacto y su manifiesto en Drive web antes de invocar `--confirm-cloud`. Ese paso registra una comprobación del operador; el script por sí solo no consulta una API remota de Drive.
- `output/atelier-backups/last-daily.json` recoge resultado, fecha, nombre, tamaño, huella y confirmación. `daily.lock` impide solapamientos, además del bloqueo del exportador. No retirar un bloqueo sin comprobar primero que no existe una ejecución activa.
- **Retención del piloto:** conservar todas las copias, sin borrado automático local ni remoto. Revisar espacio y política al ampliar el piloto.
- La automatización tiene instrucciones de permanecer en silencio cuando todo sea correcto y avisar ante fallo, subida sin confirmar o intervención necesaria. No se envían correos ni notificaciones a terceros. Si el ordenador o Codex están apagados, tampoco puede emitirse un aviso en ese momento.

## Validación

- **10 pruebas superadas:** 3 de cifrado y 7 de sincronización. Incluyen corrupción, texto sin cifrar con metadatos falsos, destino distinto, no sobrescritura, recuperación de manifiesto ausente, exclusión de claves y archivos externos, e idempotencia.
- Copia real: `atelier-2026-09-11T09-54-37-171Z-89adfb01.atbak`, **1.930.797 bytes**, SHA-256 `1252d8c3a070a2abb37c6c2f8c1e28465b91cce3e53dd27544e075c62a892ce8`.
- Drive web mostró ese paquete y su manifiesto de 433 bytes. Estado `cloud_confirmed` registrado a las 09:56 UTC. Una ejecución posterior devolvió `newBackupCreated: false` y `newlyStagedArchives: 0`, conservando las dos copias existentes.
- No hubo escrituras en producción, nuevas generaciones de IA de Atelier, cambios de facturación, despliegues ni builds.
- Grafo actualizado con AST sin llamadas de IA: 3.116 nodos, 7.050 relaciones y 228 comunidades.

## Comandos

Desde la raíz del proyecto, con la configuración privada existente:

```powershell
& 'C:/Program Files/nodejs/node.exe' scripts/backup-daily.mjs output/atelier-backups/config.json
```

Solo después de observar el paquete exacto y su manifiesto en la carpeta autorizada de Drive web:

```powershell
& 'C:/Program Files/nodejs/node.exe' scripts/backup-daily.mjs output/atelier-backups/config.json --confirm-cloud NOMBRE_EXACTO.atbak
```

También disponibles `pnpm backup:daily`, `pnpm test:backup-sync` y `pnpm test:backup-encryption`. No mostrar archivos de entorno, claves ni contenidos del volcado al revisar fallos. Para modificar o pausar la programación, usar la automatización existente por su ID; no crear duplicados.

## Custodia externa de la clave: completada

El 11-09-2026 el titular importó la clave existente en Google Password Manager de `andygomezgc@gmail.com`. Se observó el nuevo registro **atelier-backup.invalid** en la lista de contraseñas guardadas en la cuenta de Google, después de su verificación de identidad. Usuario del registro: `recuperacion-atelier-base64`. Es una etiqueta para localizar la clave, no una web de acceso.

La clave se importó como contraseña en Base64. Antes y después de preparar el CSV se verificó que correspondía exactamente a los 32 bytes del archivo original. No se mostró el secreto ni se exportó la bóveda. La presencia del registro se verificó visualmente; no se volvió a revelar ni comparar el valor almacenado por Google. Las notas del CSV no se han comprobado en Google.

El archivo temporal `output/atelier-backups/keys/google-recovery-import.csv` fue eliminado tras comprobar el registro. La clave original `output/atelier-backups/keys/recovery.key` se conserva sin cambios y no se ha subido a Drive. La recuperación del gestor y de Drive depende del acceso a la misma cuenta de Google.

### Cómo recuperar la clave

Buscar **atelier-backup.invalid** en el Gestor de contraseñas de Google. Su campo de contraseña contiene la clave codificada en Base64; no es una contraseña de acceso a Atelier. En un equipo de confianza, decodificar ese valor de Base64 a un archivo binario nuevo `recovery.key`: debe tener exactamente 32 bytes. No guardar los 44 caracteres de Base64 directamente como archivo de clave. Usarlo con el procedimiento de `backup-unpack.mjs` descrito en `COPIAS-Y-RESTAURACION-2026-09-10.md`. No sobrescribir otra clave ni regenerarla. Mantener el valor fuera de chats, repositorios, logs y carpetas de Drive. Una restauración futura debe verificar la autenticación del archivo cifrado antes de usar sus datos.

## Pendiente

Observar la primera ejecución disparada por el horario. Continúan pendientes la publicación del control común de gasto/cuotas y la entrega móvil agrupada; esta automatización no los despliega. La retención propia de Neon tampoco se ha verificado.