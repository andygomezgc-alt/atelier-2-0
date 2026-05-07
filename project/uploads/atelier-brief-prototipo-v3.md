# Atelier Culinaire — Brief del Prototipo (v3)

> Reemplaza al brief v2. **Cambios respecto a v2:**
> - Cuatro roles, con `admin` añadido y `rd_member` renombrado a `viewer` (solo lectura)
> - Casa rejerarquizada: menús activos como corazón, restaurante e identidad arriba, staff abajo
> - Onboarding simplificado: login → crear restaurante o unirse con código de invitación
> - Perfil completo con soporte de fotos desde cámara o galería

---

## 1. Qué es

Cuaderno creativo del chef con asistente IA integrado. **App nativa móvil** (iOS y Android, Expo). Captura ideas crudas → desarrolla con IA → guarda como receta → versiona y aprueba → compone en menús con carta exportable a PDF. Casa centraliza la identidad de la casa, los menús activos y el equipo.

Trilingüe ES / IT / EN en la interfaz. El contenido escrito por el chef queda en el idioma en que se escribió.

## 2. Qué NO entra en el prototipo

- Stripe, planes de pago, free trial, página pública de pricing
- Sección Despensa
- Auto-traducción del contenido (solo se traduce la chrome)
- Telemetría granular más allá de log mínimo de tokens y latencia
- UI de gestión multi-restaurante (el modelo lo soporta, la UI activa solo un restaurante)
- Versionado v2/v3 de recetas
- Notificaciones push, deep links, widgets nativos avanzados

## 3. Flujo de punta a punta — definition of done

Los diez pasos funcionan en mi iPhone (build Expo / TestFlight), en orden, sin bugs:

1. **Capturar idea.** Inicio → bloc de ideas → escribo *"pichón con espuma de café"* → guardar.
2. **Llevar al asistente.** Tap en la idea → abre el chat con prompt precargado.
3. **Conversar.** Chat con la IA hasta obtener una receta estructurada. Sonnet 4.6 default, toggle Opus 4.7.
4. **Guardar como receta.** Botón sobre la última respuesta → entra al banco como `draft v1`.
5. **Trabajar la receta.** Recetas → marco como prioritaria → avanzo a `en prueba`.
6. **Aprobar y mandar a menú.** Apruebo. Aparece **"Añadir a un menú"** (única puerta) → carpeta existente o creo "Menú Otoño 2026".
7. **Componer el menú.** Editar precio, elegir estilo (elegante / rústica / minimal), ver receta staff enlazada.
8. **Cambiar idioma.** ES / IT / EN, instantáneo, solo chrome.
9. **Exportar PDF.** Carta cliente con el estilo elegido, sin receta staff.
10. **Persistir.** Cerrar y abrir: todo intacto, sesión incluida.

## 4. Casa — jerarquía visual

Casa es la pantalla del hogar del equipo. Estructura de arriba abajo:

1. **Cabecera del restaurante** *(arriba, breve)*
   Nombre del restaurante, foto/escudo si la tiene, una línea de carácter (ej. *"Cocina mediterránea de raíz, técnica francesa, mano japonesa"*) y el código de invitación (visible solo para `admin` y `chef_executive`, con botón "regenerar" y "copiar").

2. **Menús activos** *(corazón de la pantalla)*
   Lista visual de las carpetas de menú vivas (ej. "Menú Otoño 2026", "Menú degustación", "Carta diaria"). Cada tarjeta muestra nombre, temporada, número de platos, fecha de última edición. Tap abre el menú. Botón "Crear menú" si tienes permisos.

3. **Staff** *(abajo)*
   Lista del equipo del restaurante: avatar, nombre, rol. El `admin` puede tocar a un miembro para cambiarle el rol o expulsarlo. Botón "Invitar miembro" muestra el código de invitación.

La biblioteca completa de recetas **no** vive en Casa — vive en la sección Recetas. Casa es la vista del estado vivo de la casa.

## 5. Roles y permisos

Cuatro roles. Permisos hardcoded para el prototipo, sin UI de administración granular.

| Rol | Aprueba recetas | Edita contenido | Edita menús | Invita / cambia roles |
|---|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ todo | ✅ | ✅ |
| `chef_executive` | ✅ | ✅ todo | ✅ | ❌ |
| `sous_chef` | ❌ | ✅ hasta `en prueba` | ✅ | ❌ |
| `viewer` | ❌ | ❌ solo lectura | ❌ | ❌ |

**Diferencia `admin` vs `chef_executive`:** ambos pueden aprobar y editar todo lo culinario. Solo el `admin` controla el grupo (genera/regenera código de invitación, cambia roles de otros, expulsa miembros, edita la identidad del restaurante). Idea: `admin` es el dueño u operador; `chef_executive` es el rol creativo-técnico de cabeza de cocina, que puede o no coincidir con la misma persona.

**Sobre el nombre `viewer`:** propuesta mía para reemplazar `rd_member`. Otras opciones: `observador`, `lector`, `invitado`. Si prefieres otro, lo cambio en una línea.

## 6. Onboarding y auth

**Flujo de primera vez:**

1. **Login** con email (magic link, sin password). Verificación rápida.
2. **Si el usuario no pertenece a ningún restaurante**, aparece una pantalla con dos opciones:
   - **"Crear mi restaurante"** → introduce nombre y línea de identidad → queda como `admin` de ese restaurante. Se genera automáticamente un código de invitación.
   - **"Unirme con un código"** → introduce el código que le pasó otro miembro → queda asociado al restaurante con rol `viewer` por defecto. El admin lo promueve después desde Casa.
3. Una vez dentro, va al **Inicio**.

**Códigos de invitación:**
- Alfanumérico corto y legible (ej. `MARCHE-A7K`).
- Reutilizable hasta que el admin lo regenere.
- Lo ve el admin (y el chef ejecutivo, en lectura) en la cabecera de Casa.

**Asunción que tomo:** el invitado entra como `viewer` por defecto (lo más seguro). El admin lo promueve a `sous_chef`, `chef_executive` o `admin` desde Casa con un tap en el miembro. Si prefieres que entre con otro rol por defecto, dímelo.

## 7. Perfil de usuario

Pantalla completa, accesible tocando el avatar en cualquier header. Contiene:

- **Foto**: subible desde cámara o galería del teléfono (`expo-image-picker`). Almacenada en blob storage (Vercel Blob o Supabase Storage). Avatar de iniciales como fallback hasta que se suba foto.
- **Nombre completo** (editable)
- **Bio breve** — una línea opcional ("Una breve descripción de ti como chef", máx. 140 caracteres)
- **Email** (visible, no editable en el prototipo)
- **Rol** (label, no editable por uno mismo — lo asigna el admin)
- **Restaurante asignado** (no editable desde aquí)
- **Idioma preferido de la interfaz** (ES / IT / EN)
- **Modelo Claude por defecto** (Sonnet 4.6 / Opus 4.7)
- **Cerrar sesión**

## 8. Navegación

**Bottom tab bar nativo, cinco íconos:** Inicio · Asistente · Recetas · Menús · Casa.

El perfil **no** está en la barra: se accede tocando el avatar en el header de cualquier pantalla.

## 9. Arquitectura

**Cliente nativo:**
- **Expo (React Native)**, una codebase iOS + Android
- Distribución: **TestFlight** (iOS) y **Expo Go** o **Play Internal Testing** (Android)
- AsyncStorage o `expo-sqlite` para caché local
- `expo-image-picker` para fotos del perfil

**Backend en la nube:**
- **Next.js API routes** en **Vercel** (reutiliza el código backend que ya tienes)
- **Postgres** en **Neon** o **Supabase** con **Prisma**
- **Auth.js / NextAuth** con magic link por email
- **Blob storage** para fotos: **Vercel Blob** (más simple si ya estás en Vercel) o **Supabase Storage** si vas con Supabase para todo
- **API Anthropic**: `claude-sonnet-4-6` default y `claude-opus-4-7` toggle, prompt caching activo

**PDF:** generación server-side (Puppeteer en Vercel) para tipografía editorial limpia.

## 10. Modelo de datos mínimo

```
Restaurant     { id, name, identity_line, photo_url?,
                 language_default, invite_code, created_at }

User           { id, email, name, photo_url?, bio?,
                 role: 'admin' | 'chef_executive' | 'sous_chef' | 'viewer',
                 restaurant_id?, language_pref, default_model, created_at }

Idea           { id, restaurant_id, author_id, text, created_at,
                 status: 'open' | 'in_chat' | 'archived' }

Conversation   { id, restaurant_id, author_id, idea_id?, model_used, created_at }

Message        { id, conversation_id, role, content, created_at }

Recipe         { id, restaurant_id, author_id, title, version, content_json,
                 state: 'draft' | 'in_test' | 'approved',
                 priority: bool, source_conversation_id?,
                 approved_by?, approved_at?, created_at }

MenuFolder     { id, restaurant_id, name, season?, created_at }

MenuItem       { id, menu_folder_id, recipe_id, price, order,
                 presentation_style: 'elegant' | 'rustic' | 'minimal' }
```

`User.restaurant_id` es opcional para soportar el estado "logueado pero sin restaurante" del onboarding.

## 11. Identidad visual — papel, madera, precisión mediterránea

**Paleta:**
- Fondo: blanco roto cálido `#f9f7f2` / papel `#fffaf2`
- Acento profundo (headers, bottom nav activo): verde petróleo `#1a3a3a`
- Acción primaria: terracota `#c47e4f`
- Tinta: marrón oscuro `#2a2520` / mute `#8b7a6f`
- Filo: `#e0d8c8`

**Tipografía:**
- Display: Iowan Old Style / Palatino *italic* para títulos y la marca "A"
- Body: SF Pro (iOS) / Roboto (Android), espaciado generoso, line-height 1.55

**Principios:**
- Una sola acción primaria por pantalla
- Espaciado editorial, no denso
- Sin gradientes saturados, sin glassmorphism, sin iconos cartoony
- Animaciones contenidas, micro-interacciones en momentos clave (guardar idea, aprobar receta)

## 12. Asistente IA — system prompt

Se reutiliza el prompt redactado en `atelier-system-prompt.md`. Construcción dinámica al iniciar conversación:

- Restaurante activo (nombre, identidad de la casa)
- Resumen breve de las últimas N recetas
- Idea o receta a la que se ancla la conversación, si la hay

**Principios no negociables:** especificidad molecular, pensamiento de chef, honestidad epistémica obligatoria, distinciones bioquímicas finas en modo Opus. Parte estática cacheada con `cache_control: { type: "ephemeral" }`.

## 13. Persistencia y offline

- **Cloud-first**: Postgres remoto es fuente de verdad
- **Caché local** (AsyncStorage / expo-sqlite) para que el último estado se vea con cobertura mala
- **Captura offline**: idea queda en cola local y sube cuando vuelve la red

## 14. Cuándo está hecho

- Los diez pasos del flujo pasan en mi iPhone (TestFlight), en orden, sin bugs
- Onboarding (crear restaurante / unirse con código) funciona
- Perfil completo: foto desde cámara, edición de nombre y bio, cambio de idioma y modelo
- Cambio de idioma instantáneo en los tres idiomas
- PDF exportado se abre y se comparte limpio desde el sheet nativo de iOS
- Reabrir la app preserva sesión y último estado
- Captura de idea offline funciona

---

## Pendientes congelados (después del prototipo)

- Stripe + planes + free trial + pricing público
- Despensa
- Auto-traducción de contenido
- Multi-restaurante con UI de gestión (cambiar entre varios restaurantes desde la app)
- Versionado v2/v3 de recetas con UI de "crear nueva versión"
- Telemetría avanzada
- Notificaciones push, widgets nativos
- Códigos de invitación de un solo uso o con caducidad
- Permisos granulares editables por el admin

## Pendiente con Claude (memoria activa)

- **Hoja de cálculo de proyección financiera** (3 escenarios mix de planes vs gastos fijos para break-even). Esperando datos reales del piloto.
