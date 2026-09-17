# Ronda móvil y permisos — 15 al 17 de septiembre de 2026

Registro de la ronda completa: pruebas de integración en CI, despliegues de Vercel, el cierre al arrancar en iPhone, el arranque obligatorio y la revisión de permisos por rol. [Estado actual](ESTADO-ACTUAL.md) prevalece para el estado vigente; este documento conserva el detalle y los identificadores.

## Lo que quedó publicado

| Pieza | Estado | Identificadores |
| --- | --- | --- |
| Servidor | Desplegado desde `main` (`e305004`), salud 200 | Solo `main` despliega (`git.deploymentEnabled`) |
| iPhone | Build **12** subida a Apple, **sin revisión externa pedida**; el enlace público sigue en la **11** | EAS `30031daf-f36c-49b8-9505-7295276f341c`; build 11 = EAS `8f42657e…`, Apple `a6b96744…` |
| Android | APK **versionCode 6** | EAS `63734b36-9f7e-4157-8b89-c4021821daef` · [APK](https://expo.dev/artifacts/eas/bt8AcEIWIYTadfOiTt-AY5nbBVVRwMqcPzygyy5voAA.apk) (111.361.686 bytes) |
| TestFlight | Enlace inalterado | https://testflight.apple.com/join/kY83jmnk (grupo externo «Chefs», id `2e8fc706-fb85-4543-b841-5b5a6628def9`) |

## 1. El cierre al abrir en iPhone (builds 7 a 9)

La app se cerraba al abrirla en iPhone desde la build 7, siempre, sin llegar a pintar nada. El enlace de TestFlight nunca fue el problema.

- **Causa:** `apps/mobile/src/hooks/useAuth.ts` hacía `await import("react-native")` solo para leer `Platform`. Metro lo compila a `metroImportAll`, que copia todas las exportaciones del paquete y al recorrerlas evalúa el getter obsoleto `PushNotificationIOS`; ese módulo construye un `NativeEventEmitter` sin módulo nativo y React Native lanza un `invariant` **solo en iOS**. Android nunca hizo esa comprobación, y por eso el APK funcionaba.
- **Evidencia:** Sentry (org `atelier-xm`, proyecto `atelier-mobile`, región `de.sentry.io`), issue 136149866: 27 eventos, 4 personas, fatal, primera vez dos meses antes en la release `0.1.0 (7)` — cuando entró Sign in with Apple. App Store Connect no tenía informes porque nadie pulsó «Compartir».
- **Arreglo:** import nombrado más `apps/mobile/src/lib/__tests__/react-native-imports.test.ts`, que falla si alguien reintroduce un import dinámico o de espacio de nombres de `react-native`.
- **Confirmado en dispositivo** el 16-09 con la build 10; Sentry no registró ningún cierre posterior.

## 2. Arranque obligatorio (revierte A-12)

Un chef sin restaurante caía en Inicio, donde `/api/ideas` responde 403 y la pantalla lo pintaba como «Sin conexión». La auditoría de julio (A-12) había quitado el paso obligatorio de crear o unirse.

Restaurado el 16-09: sin restaurante se va a `(auth)/choose-flow`. La regla salió del componente a `apps/mobile/src/lib/auth-route.ts`, con pruebas, porque ya había cambiado una vez sin que se notara.

Caso real que lo destapó: Gaia entró con Sign in with Apple y «Ocultar mi correo», lo que creó un usuario nuevo (`cmu4e2b770000l1047tuti7k4`, correo `@privaterelay.appleid.com`, rol Lector, sin restaurante). Su cuenta real es la de Google (`cmrv8z6fe0000i504os8xs79a`, chef ejecutivo en Kokoo). **Pendiente:** que salga y entre con Google; la cuenta duplicada vacía sigue existiendo.

## 3. Permisos por rol (decisión del 17-09)

Matriz en `packages/shared/src/permissions.ts`, exigida también en el servidor:

| Puede… | Admin | Chef ejecutivo | Sous-chef | Lector |
| --- | :--: | :--: | :--: | :--: |
| Exportar PDF (receta, recetario, menú, productos) | ✓ | ✓ | — | — |
| Chat Creativo (`use_creative_chat`, permiso nuevo) | ✓ | ✓ | — | — |
| Chat Diario | ✓ | ✓ | ✓ | — |
| Ver y abrir recetas | ✓ | ✓ | ✓ | ✓ |
| Crear y editar recetas | ✓ | ✓ | ✓ | — |
| Crear y editar menús | ✓ | ✓ | — | — |
| Aprobar recetas | ✓ | ✓ | — | — |
| Banco de productos | ✓ | ✓ | ✓ | — |
| Administración (miembros, roles, código, restaurante) | ✓ | — | — | — |

Sin cambios: crear restaurante da admin, unirse con código da Lector, y solo el admin cambia roles (`change_role`).

Tres cosas que hubo que tocar aparte de la matriz:

- Los PDF de receta y del recetario colgaban solo de `view_staff_recipe`; ahora comprueban `can(ctx.role, "export_pdf")`. Sin eso, el Lector habría ganado la exportación justo al ganar la lectura.
- `GET /api/restaurant/culinary-memory` pasó a exigir `capture_idea`, para que el Lector siga sin ver «Nuestra cocina» como antes.
- En el móvil hay que ocultar a mano lo que la matriz no cubre sola: botones de exportar (receta, recetario, tarjeta de menú, productos) y el selector del Creativo más su preferencia en Perfil, que ignora una preferencia antigua si el rol ya no lo permite.

## 4. CI, escáner y pruebas de integración (PR #5)

- Los 11 grupos de integración de memoria culinaria que vivían en `tmp/` pasaron al repositorio: `apps/api/lib/culinary-memory/memory.integration.test.ts`, 15 casos. No corren en `pnpm test`; CI los ejecuta contra su PostgreSQL con `CULINARY_MEMORY_IT=1`. Solo aceptan bases en localhost o un host de pruebas escrito expresamente en `CULINARY_MEMORY_IT_ALLOW_HOST`; nunca producción.
- `osv-scanner.toml` acepta siete avisos conocidos con motivo y caducidad **15-12-2026** (vitest, vite, deepmerge-ts, extract-zip, image-size: herramientas de build y pruebas, sin arreglo compatible). Actualizar vitest a la 3 elimina dos. Un aviso nuevo vuelve a poner CI en rojo.
- CI estaba roto desde antes: el job `verify` fallaba al instalar con Node 20. El cambio a Node 24 lo arregló.

## 5. Vercel

- Plan **Hobby** con **Fluid Compute** y límite de **300 s** por función, Node 24: el cron de memoria dispone de sus 300 segundos.
- Las vistas previas de ramas fallaban desde julio porque el entorno Preview no tiene `DATABASE_URL` (se cortaban en `prisma migrate deploy`, sin tocar ninguna base). Ahora **solo `main` despliega**.
- Preview ya no guarda variables: las cinco `APPLE_*` quedaron solo en Production y `BLOB_READ_WRITE_TOKEN` en Production y Development. El valor del almacén se comprobó intacto por huella antes y después del cambio.
- **Pendiente opcional:** `BLOB_READ_WRITE_TOKEN` sigue en Development, así que el desarrollo local puede escribir en el almacén de fotos de producción.

## 6. Gasto de IA

- Presupuesto interno del piloto **sin estrenar**: 50,00 € de 50 €, tabla `AiBudget` vacía. El mes arranca con la primera reserva de generación y dura un mes natural, sin renovación automática. Contabilidad con margen: 1 USD de API descuenta 1,25 € del presupuesto.
- **Anthropic: 3,84 USD de créditos y recarga automática desactivada** (17-09). La clave de producción «atellier2.0» pertenece a esa misma organización, así que el chat Creativo se queda sin servicio al agotarse. La estimación del piloto pedía unos 29 USD al mes solo para el Creativo. Gemini y Z.AI siguen sin consultar.

## 7. Receta de entrega móvil (medida el 16 y 17 de septiembre)

```bash
bash scripts/rebake-mobile.sh both     # o ios / android
```

Después, para que el enlace público sirva la build nueva, con la clave de App Store Connect de `eas.json` (`submit.testflight.ios`):

1. `POST /v1/builds/{ascBuildId}/relationships/betaGroups` con el grupo «Chefs» → 204.
2. `POST /v1/betaAppReviewSubmissions` con ese build → 201, estado `WAITING_FOR_REVIEW`.
3. Comprobar `GET /v1/builds?filter[app]=…&filter[version]=N&include=buildBetaDetail,betaGroups` hasta `externalBuildState = IN_BETA_TESTING`.

Tiempos reales: compilar iOS 7-10 min, Android 10-50 min, **cola de envío de EAS 1 h 30 a 1 h 45 (el cuello de botella)**, procesado de Apple ~7 min, revisión beta externa ~1 min. Subir a App Store Connect desde Windows sin EAS no es viable: exige Transporter, que es de macOS.

## Cierre de los pendientes (comprobado el 17-09 en producción, solo lectura)

- **Primer arranque real: hecho.** Mariasole Ricci entró el 16-09 con el código y el admin la subió a sous-chef; Eugenio Sanchote entró el 17-09 y quedó como Lector. Kokoo tiene cinco miembros.
- **Gaia con Google: hecho** (sesión del 16-09, 21:44). Su cuenta duplicada con Apple sigue existiendo, vacía; borrarla es opcional.
- **Créditos de Anthropic: cargados**, 23,84 USD. Recarga automática todavía desactivada.
- **Presupuesto del piloto en marcha:** periodo 16-09 a 16-10-2026, 0,01 € gastados de 50 €, tres generaciones (dos del Diario, una extracción GLM).
- **Sigue pendiente: la revisión externa de la build 12.** Con el servidor aplicando los permisos nuevos y Mariasole como sous-chef, la build 11 le muestra botones que responden «no tienes permiso».
- Aparcado: la coordinación del aprendizaje nocturno creció en vez de simplificarse (`worker.ts` 77→299 líneas, 8 columnas nuevas). Recomendación: dejarla mientras funcione.
- Recordatorio: revisar las excepciones de `osv-scanner.toml` antes del 15-12-2026.
