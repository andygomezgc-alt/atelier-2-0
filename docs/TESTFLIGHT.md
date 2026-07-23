# TestFlight — guía operativa (iOS sin Mac ni iPhone)

Ruta decidida el 16-jul-2026: los chefs del pilot son todos iPhone; Play Store personal quedó descartada (exige 12 testers Android × 14 días). EAS compila y sube a Apple desde este PC — no hace falta Mac ni iPhone propio.

## Identificadores (todo esto ya existe — 20-jul-2026)

| Qué | Valor |
|---|---|
| Apple Team ID | `TU6284T7J8` (Andy Gomez, Individual) |
| Bundle ID iOS | **`com.atelierchef.app`** (id Apple `FD526HNWKW`) |
| Package Android | `com.atelier.app` — **distinto a propósito, no tocar** |
| Certificado distribución | `MYZJSNWHGZ`, caduca **2027-07-20** |
| Perfil App Store | `BK3U9TASAS` |
| ASC API Key | `HSXXXG7WT5`, issuer `f784947a-a4b8-4be3-8797-7294fb17cace` |
| Secretos en disco | `C:\Users\Utente\Desktop\atelier-secretos\` (`.p8`, `dist.p12`, `dist.key`, `.mobileprovision`, `NOTAS-ios.txt`) |

⚠️ **`com.atelier.app` NO estaba disponible en Apple** (los bundle ID son únicos mundialmente; ya pertenece a otra cuenta). De ahí el cambio a `com.atelierchef.app` solo en iOS. El **cliente OAuth "Atelier iOS" de Google Cloud** se actualizó a ese bundle — si algún día vuelve a cambiar, hay que actualizarlo también o el login con Google falla solo en iPhone.

## Sign in with Apple — preparación obligatoria antes del próximo build

El acceso con Apple necesita dos elementos distintos: la **capacidad de la app iOS** y una **clave privada del servidor**. La ASC API Key que ya se usa para subir builds a App Store Connect no necesariamente está habilitada para Sign in with Apple y no debe darse por válida solo porque también sea un archivo `.p8`.

### 1. Activar la capacidad y renovar el perfil

1. En [Apple Developer → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list), abrir el App ID explícito **`com.atelierchef.app`**.
2. Activar **Sign in with Apple**, configurarlo como App ID principal y guardar.
3. Crear una **Key nueva y dedicada** con Sign in with Apple habilitado y asociarla a `com.atelierchef.app`. Anotar su Key ID y descargar el `.p8`: Apple permite descargarlo una sola vez.
4. Regenerar el perfil **App Store** de `com.atelierchef.app` con el certificado de distribución vigente. El perfil actual se creó antes de activar esta capacidad y, por tanto, no la contiene.
5. Reemplazar `C:\Users\Utente\Desktop\atelier-secretos\atelier.mobileprovision` por el nuevo. `scripts/rebake-mobile.sh` lo copiará a `apps/mobile/certs/atelier.mobileprovision` durante el siguiente horneado. No subir al repositorio ni el perfil ni el `.p8`.

### 2. Configurar los secretos del servidor

Agregar estas variables en el entorno del servidor (Vercel Production y cualquier Preview donde se vaya a probar). Son secretos del backend: **ninguna** debe llevar el prefijo `EXPO_PUBLIC_` ni entrar en el bundle móvil.

| Variable | Qué contiene |
|---|---|
| `APPLE_CLIENT_ID` | `com.atelierchef.app` |
| `APPLE_TEAM_ID` | `TU6284T7J8` |
| `APPLE_KEY_ID` | El ID de la Key dedicada a Sign in with Apple |
| `APPLE_PRIVATE_KEY` | El contenido completo del `.p8`, conservando sus saltos de línea (o usando `\n` si el proveedor lo exige) |
| `APPLE_TOKEN_ENCRYPTION_KEY` | Una clave nueva, aleatoria e independiente de 32 bytes en base64, usada para cifrar los tokens de Apple almacenados |

El `.p8` dedicado debe quedar también en `atelier-secretos` como copia local protegida, pero no sustituye a la ASC API Key: ambas cumplen funciones diferentes. Después de cargar o cambiar estas variables hay que volver a desplegar el servidor.

## Fase 2 — Inscripción Apple (hecha)

1. **Apple ID** en [account.apple.com](https://account.apple.com) con verificación en dos pasos.
2. [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) → **Enroll as Individual**, 99 €/año. Verificación 1-2 días.
3. Al llegar el welcome: entrar en [appstoreconnect.apple.com](https://appstoreconnect.apple.com) y aceptar términos.

## Fase 3 — Build (⚠️ leer esto antes de tocar credenciales)

**La lección cara de esta fase:** `eas-cli` **nunca** se autentica contra Apple desde una shell sin TTY. En `build/commandUtils/flags.js`, `isNonInteractiveByDefault()` devuelve `true` si `!process.stdin.isTTY`; y en `build/credentials/context.js`, `bestEffortAppStoreAuthenticateAsync()` hace `if (this.nonInteractive) return;` **antes** de mirar la ASC API Key. Resultado: `Distribution Certificate is not validated for non-interactive builds` pase lo que pase, con o sin `EXPO_ASC_*`. No perder tiempo peleando con flags.

**Solución adoptada: credenciales locales.** Se fabricaron contra la API REST de App Store Connect (script en el scratchpad, `asc/provision.mjs`) y se le pasan hechas a EAS:

```
apps/mobile/credentials.json          <- gitignoreado
apps/mobile/certs/dist.p12            <- gitignoreado (pass: ver NOTAS-ios.txt)
apps/mobile/certs/atelier.mobileprovision
```

con `"credentialsSource": "local"` en el perfil `testflight` de `eas.json`. Eso salta `SetUpDistributionCertificate`, que era donde moría.

```bash
# Desde el CLON de horneado (nunca desde el worktree anidado):
cd C:/Users/Utente/atelier-bake && git pull && pnpm install
cd apps/mobile
npx expo export --platform ios                                    # valida el bundle ANTES de encolar
npx eas-cli build --platform ios --profile testflight --non-interactive --no-wait
```

Si hay que **regenerar** credenciales (certificado caducado en 2027, o pérdida de `dist.key`): revocar en Apple y volver a correr `provision.mjs` (crea bundle ID si falta, certificado y perfil; es idempotente para el bundle ID, **no** para el certificado). Dos trampas del entorno ya resueltas dentro del script: el `fetch` de node **no conecta** con `api.appstoreconnect.apple.com` en este Windows (usa `curl`), y `curl` necesita `-g` porque los corchetes de `filter[identifier]` los interpreta como glob.

### Submit sin TTY (lección final)

Las variables `EXPO_ASC_*` NO sirven para `eas submit` en modo no interactivo (`App Store Connect API Keys cannot be set up in --non-interactive mode`): la API key va en el propio perfil `submit` de `eas.json` (`ascApiKeyPath/ascApiKeyId/ascApiKeyIssuerId`, ya configurados). Comando que funcionó:

```bash
npx eas-cli submit --platform ios --profile testflight --id <buildId> --non-interactive
```

### Crear la app en App Store Connect

`eas submit` la crea sola si no existe. Si se hace a mano: [appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → **+** → iOS, nombre "Atelier", bundle `com.atelierchef.app`, SKU `atelier-pilot`; luego copiar su **Apple ID numérico** a `submit.testflight.ios.ascAppId` en `eas.json`. `ITSAppUsesNonExemptEncryption: false` ya está en `app.json` → no pregunta por export compliance en cada build.

## Fase 4 — TestFlight

1. El build aparece en App Store Connect → TestFlight en ~15-30 min tras el submit.
2. **Testers internos** (tu propio Apple ID + hasta 100): disponibles al instante, sin revisión.
3. **Testers externos** (los chefs): crear un grupo, añadir emails **o activar el link público**; la primera build externa pasa la **revisión beta de Apple (~1 día)**. Datos que pedirá: descripción beta, email de contacto y una explicación clara de que el acceso se hace con Apple o Google. Si Apple exige una cuenta demo, hay que preparar una accesible al revisor en vez de mencionar el antiguo magic link, que ya no aparece en la pantalla.
4. Las builds de TestFlight caducan a los **90 días** (vs 14 del APK interno de Android).
5. ⚠️ **DSA / operador comercial:** App Store Connect muestra un aviso de la normativa europea — antes de distribuir en la UE hay que declarar el *trader status*. Para TestFlight normalmente no bloquea; para publicar en la App Store sí. Enlaza con la partita IVA pendiente. Es una declaración legal de Andy: nadie la rellena por él.

## Fase 5 — Estreno controlado (primer iPhone real que toca la app)

Primer tester: chef de confianza (¿Kokoo?). Checklist de humo en su teléfono:

- [ ] Login con Google
- [ ] Primer login con Apple eligiendo **Compartir mi correo**: entra en la cuenta correcta y conserva el nombre recibido
- [ ] Primer login con Apple eligiendo **Ocultar mi correo**: entra correctamente con la dirección privada de retransmisión de Apple
- [ ] Cerrar sesión y hacer un **segundo login con Apple** en ambos casos: debe funcionar aunque Apple ya no vuelva a enviar el nombre
- [ ] Cancelar voluntariamente el diálogo de Apple: vuelve al login sin mostrar un error engañoso ni dejar la pantalla bloqueada
- [ ] Eliminar desde la app una cuenta creada con Apple: termina la sesión, borra la cuenta y permite volver a autorizar Apple después
- [ ] Foto-receta con la cámara (permiso + extracción)
- [ ] Dictado al asistente (permiso micrófono)
- [ ] Exportar/compartir un PDF (share sheet de iOS)
- [ ] Teclado en el chat y en edición de recetas (el spacer auto-medido ya contempla iOS)
- [ ] Pull-to-refresh en listas y sin red: los estados de error nuevos
- [ ] **Sentry**: verificar en sentry.io que llegan eventos del dispositivo (las primeras 48 h, mirar a diario)

## Sentry móvil — nota de configuración

**Ya configurado** (18-jul): proyecto `atelier-mobile` (plataforma React Native) creado en la organización `atelier-xm` de sentry.io — el del servidor es `atelier-api`, otro proyecto distinto. Su DSN está en el `env` de los perfiles `pilot` y `testflight` de `eas.json`, así que **el próximo horneo de cualquiera de los dos ya reporta crashes**. El DSN es público por diseño (va dentro del bundle del cliente), como los client IDs de Google.

Detalles para el futuro:

- El init es **guardado**: si `EXPO_PUBLIC_SENTRY_DSN` no existe o el módulo nativo no está (Expo Go), no hace nada.
- ⚠️ **EAS rechaza el `eas.json` entero si una env es string vacío** (rompe hasta `build:list`) — nunca dejar claves placeholder con `""`.
- `SENTRY_DISABLE_AUTO_UPLOAD: "true"` sigue en ambos perfiles a propósito: sin `SENTRY_AUTH_TOKEN` la subida de source maps/símbolos rompe el build (mordió antes, commit 5f7485a). Consecuencia: llegan los crashes, pero los stack traces salen sin desminificar. Para tenerlos legibles hay que crear un auth token en sentry.io → Settings → Auth Tokens, guardarlo como secreto de EAS (`eas secret:create --name SENTRY_AUTH_TOKEN`) y quitar el flag.

## Mantener las apps actualizadas (automatización)

**Un solo comando** reconstruye y re-publica ambas plataformas:

```bash
bash scripts/rebake-mobile.sh          # iOS (auto-submit a TestFlight) + APK Android
bash scripts/rebake-mobile.sh ios      # solo iOS
bash scripts/rebake-mobile.sh android  # solo APK Android
```

Hace: sincroniza el clon de horneado con `origin/main` → `pnpm install` → repone las credenciales locales iOS desde `atelier-secretos` → valida el bundle con `expo export` → `eas build` con `--auto-submit` en iOS (sube solo a TestFlight al terminar) y APK en Android.

**Por qué NO es totalmente desatendido (cloud):** las claves de firma iOS (`dist.p12`, `dist.key`) viven SOLO en el disco local a propósito — nunca en el repo ni en los servidores de EAS. Un agente en la nube no las tiene, así que el rebuild se dispara a mano con el script (que ya tiene todo a un comando). Cada vez que aterrice código móvil en `main`, corre el script y en ~20 min tienes TestFlight + APK al día.

## Testers (configurado 20-jul)

- **Link público (chefs iPhone):** https://testflight.apple.com/join/kY83jmnk — grupo externo "Chefs". ⚠️ Los externos solo pueden instalar DESPUÉS de que Apple apruebe la primera build en la **revisión beta** (falta el teléfono de contacto para poder enviarla).
- **Grupo interno "Equipo" (Andy):** disponible YA sin revisión — instala con TestFlight usando el Apple ID de la cuenta.
- Info beta en italiano y contacto de la revisión: cargados vía API (email andygomezgc@gmail.com; `demoAccountRequired:false`). Antes del próximo envío, actualizar la nota para explicar el acceso actual con Apple/Google; ya no debe decir “login por código”.

## App Store real (después del pilot)

Mismo pipeline (`eas build` + `eas submit`) + ficha completa en App Store Connect (capturas, descripción, política de privacidad — hará falta URL pública) + revisión completa de Apple (1-3 días). No urge para el pilot.
