# Copias y restauración — 10 de septiembre de 2026

## Resultado y alcance

**Actualización de las 18:02 UTC: primera copia cifrada real de producción completada y verificada**, incluyendo los tres archivos del almacén Blob. Archivo local: `output/atelier-backups/archives/atelier-2026-09-10T18-02-48-545Z-304264e0.atbak`, 1.930.797 bytes, SHA-256 `513aa727ddf5229bd722282bb6981596225a48efec66016b6bb92c6a671ecb4c`. Se descifró en una carpeta privada nueva, se verificaron el volcado nativo y las huellas de los tres archivos; después se eliminó esa carpeta temporal. No se restauraron datos reales en ninguna base.

Producción observada: PostgreSQL **18.6**, 24 tablas públicas y 26 migraciones aplicadas; lectura sin modificar datos. Dos referencias externas (por ejemplo, avatares externos) quedan registradas en el manifiesto, pero sus archivos no pertenecen a Blob y no se descargan. La copia no incluye secretos del entorno, firmas Android/iOS ni roles globales.

El ensayo actualizado de restauración usa datos sintéticos en dos bases temporales de QA: **29 migraciones, 28 tablas y 53 filas**, con huellas idénticas tras recuperar, y rechazo de corrupción/destino ocupado/origen. Limpieza completada; cero llamadas de IA. El ensayo anterior de 27 migraciones/25 tablas/51 filas es histórico.

**Actualización del 11-09: almacenamiento externo y rutina diaria configurados.** El usuario autorizó Google Drive; paquete y manifiesto subidos a una carpeta privada, solo propietario, y hashes comprobados desde Drive. Automatización activa a las 09:00; recorrido completo probado manualmente, conservando todas las copias del piloto y avisando ante incidencias. Depende del ordenador y Codex; aún no se observó la primera ejecución por horario. [Rutina diaria](COPIAS-DIARIAS-2026-09-11.md). **Pendiente: custodia externa separada de la clave.** Gemini quedó vinculado por el titular, comprobado como Nivel 1 · Prepago, y se configuró un límite adicional de 20 EUR/mes dentro de los 50 EUR comunes del piloto. No hubo compras ni despliegue de API/APK/iOS.

## Copia cifrada de producción

- `scripts/backup-production.mjs` lee únicamente `DATABASE_URL` y `BLOB_READ_WRITE_TOKEN` del archivo local existente `.env.prod-check`, sin descargarlos de Vercel ni mostrarlos. Comprueba el host de producción y el almacén Blob configurados y usa conexión PostgreSQL directa.
- Una transacción de solo lectura exporta una instantánea. El volcado usa `pg_dump --snapshot` y las referencias de fotos/menús se leen en esa misma instantánea. Se incluyen todos los objetos de Blob enumerados y se comprueba que ninguna referencia Blob de esa instantánea falte. Un archivo ausente o incompleto invalida el resultado; nunca declara completa una copia parcial.
- El paquete TAR interno contiene el `.dump`, su manifiesto y los archivos con sus URL originales, tipos y SHA-256. Después se cifra con **AES-256-GCM**, nonce aleatorio de 96 bits por copia y clave de 256 bits. Se comprueba descifrado y equivalencia exacta antes de guardar el resultado. Los temporales se eliminan al terminar; se conservan copias anteriores en caso de fallo.
- Carpeta `output/atelier-backups/` excluida de Git y de los paquetes de despliegue. ACL Windows restringida al propietario y SYSTEM, heredada por los archivos. La clave está en `keys/recovery.key`, separada de `archives`; nunca se muestra por pantalla. **Todavía debe custodiarse fuera del ordenador y separada de las copias cifradas. Perder esa clave impide recuperar los paquetes.**
- `last-run.json` registra éxito/fallo sin contenido de recetas ni credenciales. `running.lock` impide copias simultáneas; si un proceso muere dejando el bloqueo, comprobar que ya no está ejecutándose antes de retirarlo. Aún no envía avisos automáticos.
- Límite operativo actual: 128 MiB de archivos Blob y 256 MiB de TAR antes del cifrado en memoria. Si se supera, falla conservando la copia previa; ampliar con procesamiento por flujo cuando el tamaño real lo requiera.
- `scripts/backup-unpack.mjs` descifra solo en una carpeta nueva cuyo directorio padre debe estar protegido. Comprueba integridad criptográfica, rutas, ausencia de enlaces, manifiesto de PostgreSQL y cada archivo. No modifica ninguna base de datos. El usuario de recuperación decide después la base nueva y vacía para `db-restore.mjs`.

Comandos, desde la raíz y con Node 24 en este equipo:

```powershell
node scripts/backup-production.mjs output/atelier-backups/config.json
$env:PG_BIN_DIR = (Resolve-Path 'output/postgresql18-tools/pgsql/bin').Path
node scripts/backup-unpack.mjs RUTA_COPIA output/atelier-backups/keys/recovery.key CARPETA_PRIVADA_NUEVA
```

No volver a ejecutar `output/prepare-production-backup.mjs`: ya creó la configuración y la clave y usa escritura exclusiva. Para otra copia usar el comando de producción anterior. Los nuevos clientes oficiales **18.6** están en `output/postgresql18-tools/pgsql/bin`; solo se extrajeron `pg_dump`, `pg_restore`, `psql` y sus DLL, sin instalar servidor. El ZIP de 344 MB fue eliminado. Los clientes 17.11 anteriores se conservan, pero no sirven para volcar un servidor 18.

Validación: tres pruebas de cifrado (binario/UTF-8/vacío, clave incorrecta/corrupción/truncado, rechazo de claves inválidas), comprobación sintáctica de ambos scripts, copia real/descifrado y ensayo de restauración QA actualizado superados. Las pruebas no equivalen a una recuperación ante pérdida del ordenador mientras falte custodia externa.

## Qué cambió

- `scripts/db-backup.mjs` usa `pg_dump --format=custom`, que obtiene una instantánea coherente y conserva datos, tipos, índices, relaciones, funciones, triggers y migraciones. El exportador anterior leía las tablas de forma independiente y no incluía la estructura necesaria para reconstruirlas.
- El archivo comprimido `.dump` se acompaña de un manifiesto `.dump.json` con tamaño, SHA-256, versión de la herramienta y origen sin credenciales. Se usan nombres únicos, archivos temporales y renombrado al completar. El restaurador exige ambos archivos y valida la integridad.
- `scripts/db-restore.mjs` necesita **RESTORE_DATABASE_URL**; no utiliza DATABASE_URL por defecto. Sin `--apply`, solo verifica. Rechaza el origen y cualquier destino con objetos de usuario. No usa `--clean` ni `--create` y restaura en una sola transacción.
- Las contraseñas se pasan por variables de entorno del proceso PostgreSQL, no por argumentos ni registros. No se publican mensajes PostgreSQL que puedan incluir contenido. Los volcados y herramientas descargadas se excluyen de Git/EAS/Vercel.
- Comandos disponibles también como `pnpm db:backup`, `pnpm db:restore` y `pnpm test:backup`. El ensayo requiere expresamente el endpoint QA conocido; rechaza otros hosts antes de escribir.

La elección y los límites se contrastaron con la documentación oficial de [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html) y [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html). PostgreSQL 17.11 fue observado en QA. Se usaron herramientas portátiles 17.11 del [distribuidor enlazado por PostgreSQL](https://www.postgresql.org/download/windows/), disponibles en [EDB](https://www.enterprisedb.com/download-postgresql-binaries), sin instalar un servidor ni cambiar Windows.

## Validación realizada

Se creó el esquema completo de la app mediante sus 27 migraciones, se insertaron datos sintéticos en los 24 modelos y se respaldó también `_prisma_migrations`. Se compararon cantidad y SHA-256 de todas las filas ordenadas tras restaurar.

- Restaurantes, usuarios, cuentas y sesiones ficticias; ideas y recibos de reintento; conversaciones y mensajes; recetas y productos relacionados; precios, rendimientos y alérgenos; menús, secciones, platos y estilos; memoria, sus registros y uso de IA; auditoría y eventos Stripe ficticios.
- Precisión decimal, caracteres acentuados, saltos de línea, arrays y JSON. Se verificó expresamente que un `null` JSON sigue siendo distinto de un `NULL` SQL.
- La restauración conserva el estado de memoria y, al editar una receta recuperada, el trigger incrementa su revisión como corresponde.
- La verificación sin `--apply` no crea tablas. Se rechazan restauraciones sobre el origen, sobre un destino ocupado y archivos alterados.
- Ensayo adicional superado: un archivo truncado, con cabecera aún legible y huella ajustada deliberadamente para alcanzar el error nativo, falla durante la recuperación y revierte todas las tablas. Se comprobó también que un esquema no vacío llamado `pgfixture` no se confunde con un esquema interno de PostgreSQL.

Artefactos de prueba: `output/backup-qa/`. Contienen exclusivamente datos sintéticos, nunca claves reales. Script reproducible: `scripts/check-db-backup.mjs`.

## Uso operativo

Requiere `pg_dump`, `pg_restore` y `psql` en PATH o **PG_BIN_DIR**. Usar una versión de `pg_dump` igual o posterior a la del servidor; la recuperación se prueba con una versión compatible. En este equipo usar los clientes 18.6 de `output/postgresql18-tools/pgsql/bin`.

Ejemplo PowerShell desde la raíz, con las conexiones correspondientes ya cargadas de forma segura en el entorno:

```powershell
$env:PG_BIN_DIR = (Resolve-Path 'output/postgresql18-tools/pgsql/bin').Path
node scripts/db-backup.mjs 'C:/Users/Utente/Desktop/ATELIER-BACKUPS/db'

# RESTORE_DATABASE_URL debe apuntar a una base NUEVA y VACÍA, sin app conectada.
node scripts/db-restore.mjs 'ruta/copia.dump'
node scripts/db-restore.mjs 'ruta/copia.dump' --apply
```

La ruta anterior conserva el destino histórico de la herramienta. No se utilizó ese directorio para el ensayo; los resultados sintéticos se escribieron dentro del proyecto. En Neon usar una conexión directa para operaciones de copia y recuperación. El script cubre la base completa, aunque la URL contenga un parámetro Prisma `schema`.

Para repetir el ensayo QA, con el archivo local que actualmente contiene la conexión de pruebas:

```powershell
$env:PG_BIN_DIR = (Resolve-Path 'output/postgresql18-tools/pgsql/bin').Path
node --env-file=apps/api/.env.local scripts/check-db-backup.mjs
```

No ejecutar contra datos reales un dump recibido de terceros. Una copia nativa contiene SQL ejecutable del origen; SHA-256 detecta daños accidentales, no demuestra la autenticidad de un archivo si también se alteró su manifiesto.

## Pendiente para protección operativa completa

1. **Completado localmente:** copia de producción cifrada del 10-09-2026 y verificación. Los JSON históricos se conservan y no se convierten automáticamente.
2. **Rutina diaria configurada el 11-09:** automatización de Codex activa, preserva todas las copias y avisa solo ante incidencias. Recorrido probado; primera ejecución programada todavía no observada. Verificar también la retención real de Neon. [Detalle](COPIAS-DIARIAS-2026-09-11.md).
3. **Copia externa inicial completada el 11-09 en Google Drive.** Falta custodiar la clave por separado fuera del ordenador. El `.dump` interno no está cifrado; el paquete completo `.atbak` sí. Nunca subir la carpeta `keys` junto a los archivos cifrados.
4. **Completado para los archivos subidos:** los tres objetos Blob están dentro del paquete y se verificaron. Las URL externas ajenas a Blob se conservan como referencias, sin prometer su recuperación. El manifiesto del `.dump` sigue indicando que el volcado por sí solo no contiene archivos; el manifiesto del paquete enumera los que lo acompañan.
5. El dump no incluye secretos del entorno, firma Android ni roles globales del clúster. La cuenta de destino crea los objetos restaurados, sin reinstalar propietarios/permisos del origen. Validar permisos y flujos de la app antes de cambiar su conexión a una base recuperada.

No se añadieron pantallas ni tareas para el chef.
