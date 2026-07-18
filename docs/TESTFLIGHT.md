# TestFlight — guía operativa (iOS sin Mac ni iPhone)

Ruta decidida el 16-jul-2026: los chefs del pilot son todos iPhone; Play Store personal quedó descartada (exige 12 testers Android × 14 días). EAS compila y sube a Apple desde este PC — no hace falta Mac ni iPhone propio. Certificados: los gestiona EAS (como la keystore de Android).

## Fase 2 — Inscripción Apple (Andy, ~30 min + 1-2 días de espera)

1. Crear/usar un **Apple ID** con email real (recomendado: andygomezgc@gmail.com) en [account.apple.com](https://account.apple.com). Activar verificación en dos pasos (obligatoria).
2. Entrar en [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) → **Enroll as Individual**. Hace falta: nombre legal, DNI/pasaporte a mano (a veces piden foto), tarjeta para los **99 €/año**.
3. La verificación tarda **1-2 días** (email de "Welcome to the Apple Developer Program"). Sin esto no se puede subir nada — conviene lanzarla cuanto antes; corre en paralelo con todo lo demás.
4. Cuando llegue el welcome: entrar una vez en [appstoreconnect.apple.com](https://appstoreconnect.apple.com) para aceptar los términos.

## Fase 3 — Primer build y subida (Claude, con la cuenta de Andy)

```bash
# Desde apps/mobile (el perfil "testflight" vive en eas.json):
eas build --platform ios --profile testflight     # 1ª vez: EAS pide login Apple y crea certs/perfiles solo
eas submit --platform ios --profile testflight    # sube el .ipa a App Store Connect
```

- La primera vez, `eas build` pide las credenciales de Apple de Andy de forma interactiva (o se configura una **App Store Connect API Key** en expo.dev para no volver a teclearlas — recomendado).
- En App Store Connect hay que **crear la app** una vez (nombre "Atelier", bundle `com.atelier.app`, idioma primario español) y copiar su **Apple ID numérico** al campo `ascAppId` del bloque `submit` de `eas.json`.
- `ITSAppUsesNonExemptEncryption: false` ya va en `app.json` → no pregunta por export compliance en cada build.

## Fase 4 — TestFlight

1. El build aparece en App Store Connect → TestFlight en ~15-30 min tras el submit.
2. **Testers internos** (tu propio Apple ID + hasta 100): disponibles al instante, sin revisión.
3. **Testers externos** (los chefs): crear un grupo, añadir emails **o activar el link público**; la primera build externa pasa la **revisión beta de Apple (~1 día)**. Datos que pedirá: descripción beta, email de contacto, y si el login lo requiere, una **cuenta demo** (tenemos magic link — basta explicar el flujo o dar un email de prueba accesible).
4. Las builds de TestFlight caducan a los **90 días** (vs 14 del APK interno de Android).

## Fase 5 — Estreno controlado (primer iPhone real que toca la app)

Primer tester: chef de confianza (¿Kokoo?). Checklist de humo en su teléfono:

- [ ] Login con magic link **abriendo el email en Mail de iOS** (deep link `atelier://` de vuelta)
- [ ] Login con Google
- [ ] Foto-receta con la cámara (permiso + extracción)
- [ ] Dictado al asistente (permiso micrófono)
- [ ] Exportar/compartir un PDF (share sheet de iOS)
- [ ] Teclado en el chat y en edición de recetas (el spacer auto-medido ya contempla iOS)
- [ ] Pull-to-refresh en listas y sin red: los estados de error nuevos
- [ ] **Sentry**: verificar en sentry.io que llegan eventos del dispositivo (las primeras 48 h, mirar a diario)

## Sentry móvil — nota de configuración

El init es **guardado**: si `EXPO_PUBLIC_SENTRY_DSN` no existe o el módulo nativo no está (Expo Go), no hace nada. Para activarlo: crear un proyecto **react-native** en sentry.io (el DSN del servidor es otro proyecto) y **añadir la clave** `"EXPO_PUBLIC_SENTRY_DSN": "<dsn>"` al bloque `env` de los perfiles `pilot` y `testflight` de `eas.json`. OJO: la clave no está pre-creada vacía a propósito — **EAS rechaza el eas.json entero si una env es string vacío** (rompe hasta `build:list`). Sin DSN la app compila y corre igual — solo que a ciegas.

## App Store real (después del pilot)

Mismo pipeline (`eas build` + `eas submit`) + ficha completa en App Store Connect (capturas, descripción, política de privacidad — hará falta URL pública) + revisión completa de Apple (1-3 días). No urge para el pilot.
