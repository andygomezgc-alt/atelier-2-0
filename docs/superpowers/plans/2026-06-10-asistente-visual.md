# Asistente — restyle visual (cuaderno editorial + animaciones) — Plan de implementación

> ✅ **HECHO (2026-07-11).** Las 7 tareas están implementadas y commiteadas en la rama `claude/lucid-haslett-9cf85d`: parser `src/lib/markdown.ts` (18 tests verde), `MarkdownText`/`TypingDots`/`SendButton`, `src/lib/haptics.ts`, y `asistente.tsx` cableado (commit `eba7ee4`). Ya entró al APK **b5f3cee7** (build desde `15b9df5`). Los checkboxes de abajo quedaron sin tildar pero el código está en HEAD. **Único pendiente: el checkpoint visual de Andy en Expo Go (Task 7 · Step 4).**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle visual de la pantalla del Asistente según el spec `docs/superpowers/specs/2026-06-10-asistente-visual-design.md`: dirección "cuaderno editorial", markdown ligero tolerante a streaming, puntitos animados, botón que despega y late, hápticas discretas. Cero cambios de comportamiento.

**Architecture:** Piezas separadas que la pantalla consume: parser puro en `src/lib/markdown.ts` (testeable con vitest-node), componentes de presentación (`MarkdownText`, `TypingDots`, `SendButton`) con reanimated v4, wrappers de hápticas en `src/lib/haptics.ts`. La pantalla `asistente.tsx` solo cambia estilos y cablea las piezas.

**Tech Stack:** React Native (Expo SDK 56), react-native-reanimated v4 (babel plugin `react-native-worklets/plugin` ya configurado), expo-haptics (a instalar), vitest 2 (environment node, SOLO `src/**/__tests__/**/*.test.ts` — no hay infra de render de componentes; los componentes se validan con typecheck + bundle + checkpoint de Andy en Expo Go).

**Working dir:** `C:\Users\Utente\Desktop\atelier-2-0\.claude\worktrees\lucid-haslett-9cf85d` (worktree, rama `claude/lucid-haslett-9cf85d`). Todos los comandos se corren desde ahí.

**Regla de oro:** NO deployar a producción en este plan. El último paso es dejar los servers locales listos para el checkpoint visual de Andy.

---

### Task 1: Parser markdown ligero tolerante a streaming (TDD)

**Files:**
- Create: `apps/mobile/src/lib/markdown.ts`
- Test: `apps/mobile/src/lib/__tests__/markdown.test.ts`

**Contrato:**

```ts
export type Span = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "title"; text: string }      // primera línea corta sin markdown (heurística actual de la pantalla)
  | { type: "heading"; text: string }    // líneas `#`, `##`, `###`
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; items: Span[][] };

export function parseInline(text: string): Span[];
export function parseAssistantMarkdown(input: string): Block[];
```

Reglas:
- `**negrita**` y `*cursiva*` inline; marcador sin cerrar = texto literal (JAMÁS throw).
- Bloques por líneas: `- ` / `* ` agrupan lista no ordenada; `1. ` (dígitos + punto) lista ordenada; `#`/`##`/`###` heading (se quitan los hashes); línea en blanco separa párrafos.
- Heurística de título (paridad con la pantalla actual, `asistente.tsx:113-119`): si NO hay headings markdown en el texto, hay >1 línea, la primera tiene 1-79 chars y NO termina en `.` o `:` → la primera línea sale como block `title`.
- Entrada vacía o solo espacios → `[]`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// apps/mobile/src/lib/__tests__/markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseAssistantMarkdown, parseInline } from "@/src/lib/markdown";

describe("parseInline", () => {
  it("texto plano produce un span simple", () => {
    expect(parseInline("hola chef")).toEqual([{ text: "hola chef" }]);
  });

  it("negrita con **", () => {
    expect(parseInline("usa **shio-koji** ligero")).toEqual([
      { text: "usa " },
      { text: "shio-koji", bold: true },
      { text: " ligero" },
    ]);
  });

  it("cursiva con *", () => {
    expect(parseInline("un toque *amaro*")).toEqual([
      { text: "un toque " },
      { text: "amaro", italic: true },
    ]);
  });

  it("negrita sin cerrar queda literal (tolerancia a streaming)", () => {
    expect(parseInline("marinar **12 min")).toEqual([{ text: "marinar **12 min" }]);
  });

  it("string vacio produce []", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseAssistantMarkdown", () => {
  it("parrafo simple", () => {
    expect(parseAssistantMarkdown("Crudo de gambero a 4°C.")).toEqual([
      { type: "paragraph", spans: [{ text: "Crudo de gambero a 4°C." }] },
    ]);
  });

  it("heading con ## y cuerpo", () => {
    const blocks = parseAssistantMarkdown("## Emplatado\nBase de agrumi.");
    expect(blocks).toEqual([
      { type: "heading", text: "Emplatado" },
      { type: "paragraph", spans: [{ text: "Base de agrumi." }] },
    ]);
  });

  it("lista no ordenada agrupa items consecutivos", () => {
    const blocks = parseAssistantMarkdown("- shio-koji\n- aceite de mandarina");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ text: "shio-koji" }], [{ text: "aceite de mandarina" }]],
      },
    ]);
  });

  it("lista ordenada con 1. 2.", () => {
    const blocks = parseAssistantMarkdown("1. marinar\n2. secar");
    expect(blocks).toEqual([
      { type: "list", ordered: true, items: [[{ text: "marinar" }], [{ text: "secar" }]] },
    ]);
  });

  it("heuristica de titulo: primera linea corta sin . ni : final", () => {
    const blocks = parseAssistantMarkdown("Gambero rosso e agrumi\nCrudo a 4°C.");
    expect(blocks[0]).toEqual({ type: "title", text: "Gambero rosso e agrumi" });
  });

  it("heuristica NO aplica si la primera linea termina en :", () => {
    const blocks = parseAssistantMarkdown("Ingredientes:\n- gambero");
    expect(blocks[0].type).not.toBe("title");
  });

  it("heuristica NO aplica con una sola linea", () => {
    expect(parseAssistantMarkdown("Hola chef")).toEqual([
      { type: "paragraph", spans: [{ text: "Hola chef" }] },
    ]);
  });

  it("heuristica NO aplica si hay headings markdown", () => {
    const blocks = parseAssistantMarkdown("Plato nuevo\n## Pasos\n- uno");
    expect(blocks[0].type).not.toBe("title");
  });

  it("vacio y solo espacios producen []", () => {
    expect(parseAssistantMarkdown("")).toEqual([]);
    expect(parseAssistantMarkdown("  \n  ")).toEqual([]);
  });

  it("streaming: ningun prefijo de un texto real lanza error", () => {
    const full =
      "Gambero rosso e agrumi\n## Pasos\n1. Marinar **12 min** en shio-koji\n2. Secar\n\n- nota: *frio* siempre\n- 4°C max";
    for (let i = 0; i <= full.length; i++) {
      expect(() => parseAssistantMarkdown(full.slice(0, i))).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/markdown.test.ts`
Expected: FAIL — "Cannot find module '@/src/lib/markdown'"

- [ ] **Step 3: Implementación mínima**

```ts
// apps/mobile/src/lib/markdown.ts
// Markdown ligero para las respuestas del sous-chef (spec 2026-06-10).
// Tolerante a streaming: cualquier prefijo de un texto válido parsea sin
// throw; marcadores sin cerrar quedan como texto literal.

export type Span = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; items: Span[][] };

// **bold** primero (no-greedy, sin * adentro), después *italic*.
const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  if (!text) return spans;
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) {
      spans.push({ text: tok.slice(2, -2), bold: true });
    } else {
      spans.push({ text: tok.slice(1, -1), italic: true });
    }
    last = m.index + tok.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

const HEADING_RE = /^#{1,3}\s+(.*)$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;

export function parseAssistantMarkdown(input: string): Block[] {
  const blocks: Block[] = [];
  if (!input || !input.trim()) return blocks;

  const lines = input.split(/\r?\n/);
  const hasMdHeading = lines.some((l) => HEADING_RE.test(l));

  // Heurística de título — paridad con la lógica vieja de asistente.tsx.
  let start = 0;
  const first = (lines[0] ?? "").trim();
  if (
    !hasMdHeading &&
    lines.length > 1 &&
    first.length > 0 &&
    first.length < 80 &&
    !/[.:]\s*$/.test(first) &&
    !UL_RE.test(first) &&
    !OL_RE.test(first)
  ) {
    blocks.push({ type: "title", text: first });
    start = 1;
  }

  let list: { ordered: boolean; items: Span[][] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    const text = para.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", spans: parseInline(text) });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    const h = line.match(HEADING_RE);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", text: h[1].trim() });
      continue;
    }

    const ul = line.match(UL_RE);
    const ol = line.match(OL_RE);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      const itemText = (ol ? ol[1] : ul![1]).trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(itemText));
      continue;
    }

    if (line === "") {
      flushPara();
      flushList();
      continue;
    }

    flushList();
    para.push(raw);
  }
  flushPara();
  flushList();
  return blocks;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `pnpm --filter mobile exec vitest run src/lib/__tests__/markdown.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/markdown.ts apps/mobile/src/lib/__tests__/markdown.test.ts
git commit -m "feat(mobile): parser markdown ligero tolerante a streaming para el Asistente"
```

---

### Task 2: Componente MarkdownText

**Files:**
- Create: `apps/mobile/src/components/MarkdownText.tsx`

Renderiza los blocks del parser con el tema. Sin tests de render (no hay infra); se valida con typecheck (Task 7) + checkpoint.

- [ ] **Step 1: Crear el componente**

```tsx
// apps/mobile/src/components/MarkdownText.tsx
// Cuerpo de las respuestas del sous-chef: markdown ligero + cantidades en
// terracota (C-05). Reemplaza a HighlightedText + heurística isTitle de la
// pantalla. Estilo cuaderno editorial (spec 2026-06-10).

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseAssistantMarkdown, type Span } from "@/src/lib/markdown";
import { highlightQuantities } from "@/src/lib/highlight-quantities";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

// Cantidades/temperaturas en terracota bold solo en texto normal; los spans
// bold/italic ya tienen su énfasis propio.
function SpanText({ span, idx }: { span: Span; idx: number }) {
  if (span.bold) {
    return (
      <Text key={idx} style={styles.bold}>
        {span.text}
      </Text>
    );
  }
  if (span.italic) {
    return (
      <Text key={idx} style={styles.italic}>
        {span.text}
      </Text>
    );
  }
  const toks = highlightQuantities(span.text);
  return (
    <Text key={idx}>
      {toks.map((tok, i) =>
        tok.type === "qty" ? (
          <Text key={i} style={styles.qty}>
            {tok.text}
          </Text>
        ) : (
          tok.text
        ),
      )}
    </Text>
  );
}

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <SpanText key={i} span={s} idx={i} />
      ))}
    </>
  );
}

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const blocks = parseAssistantMarkdown(text);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        if (b.type === "title" || b.type === "heading") {
          return (
            <Text key={i} style={styles.title}>
              {b.text}
            </Text>
          );
        }
        if (b.type === "paragraph") {
          return (
            <Text key={i} style={styles.body}>
              <Spans spans={b.spans} />
            </Text>
          );
        }
        // list
        return (
          <View key={i} style={styles.list}>
            {b.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.bullet}>{b.ordered ? `${j + 1}.` : "•"}</Text>
                <Text style={[styles.body, styles.listText]}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // Título del plato: serif itálico teal (mockup B elegido por Andy).
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodyLg + 2,
    color: colors.teal,
  },
  body: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.6,
  },
  bold: { fontFamily: fonts.serifMedium, fontWeight: "600" },
  italic: { fontFamily: fonts.serifItalic },
  qty: { color: colors.terracota, fontWeight: "700" },
  list: { gap: spacing.xs },
  listItem: { flexDirection: "row", gap: spacing.sm },
  bullet: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.terracota,
    lineHeight: fontSizes.body * 1.6,
  },
  listText: { flex: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/MarkdownText.tsx
git commit -m "feat(mobile): MarkdownText — cuerpo enriquecido del sous-chef"
```

---

### Task 3: Componente TypingDots

**Files:**
- Create: `apps/mobile/src/components/TypingDots.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// apps/mobile/src/components/TypingDots.tsx
// Tres puntos escalonados mientras el sous-chef prepara la respuesta (A-05).
// Reemplaza el "pensando •••" estático.

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, spacing } from "@/src/theme";

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })),
        -1,
      ),
    );
    return () => cancelAnimation(v);
  }, [v, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + v.value * 0.65,
    transform: [{ translateY: -3 * v.value }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export function TypingDots() {
  return (
    <View style={styles.row}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mute,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/TypingDots.tsx
git commit -m "feat(mobile): TypingDots animados para el estado pensando del Asistente"
```

---

### Task 4: Hápticas (instalar expo-haptics + wrappers)

**Files:**
- Create: `apps/mobile/src/lib/haptics.ts`
- Modify: `apps/mobile/package.json` (lo toca `expo install`)

- [ ] **Step 1: Instalar la versión correcta para SDK 56**

Run: `pnpm --filter mobile exec expo install expo-haptics`
Expected: agrega `expo-haptics` a dependencies sin errores de peer.

- [ ] **Step 2: Crear los wrappers**

```ts
// apps/mobile/src/lib/haptics.ts
// Wrappers finos sobre expo-haptics. Fallo SILENCIOSO: emuladores y web no
// tienen vibrador y un feedback jamás debe tirar la app.

import * as Haptics from "expo-haptics";

// Al enviar un mensaje.
export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Cuando llega el primer delta de la respuesta (más suave que un impacto).
export function selection() {
  Haptics.selectionAsync().catch(() => {});
}
```

- [ ] **Step 3: Verificar que la suite sigue verde (el lockfile cambió)**

Run: `pnpm --filter mobile test`
Expected: 41+15 tests PASS (los 41 viejos + los 15 del parser de Task 1)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/haptics.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): hapticas discretas (expo-haptics + wrappers con fallo silencioso)"
```

---

### Task 5: Componente SendButton (despega + late)

**Files:**
- Create: `apps/mobile/src/components/SendButton.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// apps/mobile/src/components/SendButton.tsx
// Botón de enviar del Asistente (opción C elegida por Andy):
//  - al enviar, la flecha "despega" (sube y desaparece, entra otra desde abajo)
//  - mientras streaming=true el botón late despacio (anillo que respira)
// En RN no hay box-shadow animable → el pulso es un View anillo con scale/opacity.

import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

const SPRING = { damping: 14, stiffness: 170, mass: 0.8 };

type Props = {
  disabled: boolean;
  streaming: boolean;
  onPress: () => void;
};

export function SendButton({ disabled, streaming, onPress }: Props) {
  const flyY = useSharedValue(0);
  const flyOpacity = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (streaming) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [streaming, pulse]);

  const handlePress = () => {
    // Despegue: sube y se desvanece (230ms), teletransporte abajo, vuelve con spring.
    flyY.value = withSequence(
      withTiming(-26, { duration: 230, easing: Easing.in(Easing.quad) }),
      withTiming(26, { duration: 0 }),
      withSpring(0, SPRING),
    );
    flyOpacity.value = withSequence(
      withTiming(0, { duration: 230 }),
      withTiming(1, { duration: 260 }),
    );
    onPress();
  };

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: flyOpacity.value,
    transform: [{ translateY: flyY.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.45 * pulse.value }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Pressable
        style={[styles.btn, disabled && styles.btnDisabled]}
        onPress={handlePress}
        disabled={disabled}
        accessibilityLabel="send"
      >
        <Animated.View style={arrowStyle}>
          <Ionicons name="send" size={16} color={colors.paper} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  btnDisabled: { opacity: 0.4 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/SendButton.tsx
git commit -m "feat(mobile): SendButton con despegue de flecha y pulso durante streaming"
```

---

### Task 6: Restyle editorial + cableado en asistente.tsx

**Files:**
- Modify: `apps/mobile/app/(tabs)/asistente.tsx`

Cambios puntuales (la pantalla tiene 782 líneas; tocar SOLO esto):

- [ ] **Step 1: Imports nuevos y limpieza**

En el bloque de imports (líneas 1-40):
- Sumar:

```tsx
import Animated, { Easing, withSpring, withTiming } from "react-native-reanimated";
import { MarkdownText } from "@/src/components/MarkdownText";
import { TypingDots } from "@/src/components/TypingDots";
import { SendButton } from "@/src/components/SendButton";
import { selection, tapLight } from "@/src/lib/haptics";
```

- Borrar el import de `highlightQuantities` (línea 38) — ahora vive dentro de MarkdownText.
- `Ionicons` se sigue usando (header, chip, save) — NO borrarlo.

- [ ] **Step 2: Borrar HighlightedText y simplificar Bubble (líneas 70-135)**

Borrar entero el componente `HighlightedText` (líneas 70-87). Reemplazar el cuerpo del `Bubble` así (la heurística de título ahora vive en el parser; el wrap del asistente pierde la tarjeta y gana la regla terracota; entra animado solo si `animate`):

```tsx
// Entrada "con más vida" (spec): fade + sube 14px + scale desde 0.97, spring
// con mini rebote. Worklet custom porque FadeInDown no trae scale.
const messageEntering = () => {
  "worklet";
  const SPRING = { damping: 14, stiffness: 170, mass: 0.8 };
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 14 }, { scale: 0.97 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateY: withSpring(0, SPRING) },
        { scale: withSpring(1, SPRING) },
      ],
    },
  };
};

// A-03 — Bubble memoizada (igual que antes). `animate` solo es true para
// mensajes que llegan en vivo; el historial carga quieto.
const Bubble = memo(function Bubble({
  m,
  eyebrowLabel,
  animate,
}: {
  m: ChatMessage;
  eyebrowLabel: string;
  animate: boolean;
}) {
  const Wrapper = animate ? Animated.View : View;
  const entering = animate ? messageEntering : undefined;

  if (m.role === "user") {
    return (
      <Wrapper entering={entering} style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{m.content}</Text>
        </View>
        <Text style={styles.userTime}>{formatTime(m.createdAt)}</Text>
      </Wrapper>
    );
  }
  return (
    <Wrapper entering={entering} style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{eyebrowLabel}</Text>
      <View style={styles.assistantRule} />
      <View style={styles.assistantBody}>
        <MarkdownText text={stripRecipePayload(m.content).trim()} />
      </View>
    </Wrapper>
  );
});
```

Nota TypeScript: `Wrapper` con prop `entering` condicional — si `tsc` protesta por la union View/Animated.View, separar en dos returns (uno con `Animated.View entering={messageEntering}` y otro con `View`), repitiendo el JSX interno. Preferir eso antes que un `as any`.

- [ ] **Step 3: Gate de animación — ids precargados**

Dentro de `AsistenteScreen`, junto a los otros refs (cerca de la línea 181):

```tsx
// Los mensajes presentes al cargar la conversación NO se animan; solo los
// que llegan en vivo. Set de ids conocidos al momento del load.
const preloadedIds = useRef<Set<string>>(new Set());
```

En el effect de carga (líneas 199-241), en los DOS lugares donde se hace `setMessages(...)` tras un fetch (`setMessages(msgs)` línea 213 y `setMessages(conv.messages)` línea 230), agregar justo antes:

```tsx
preloadedIds.current = new Set(msgs.map((m) => m.id));
```

(en el segundo: `new Set(conv.messages.map((m) => m.id))`). Y en el reset inicial del mismo effect (línea 200-203) agregar `preloadedIds.current = new Set();`.

En `renderItem` (líneas 413-416):

```tsx
const renderItem = useCallback(
  ({ item }: { item: ChatMessage }) => (
    <Bubble
      m={item}
      eyebrowLabel={assistantEyebrow}
      animate={!preloadedIds.current.has(item.id)}
    />
  ),
  [assistantEyebrow],
);
```

- [ ] **Step 4: Hápticas en enviar y primer delta**

En `handleSend` (línea 302), tras el guard `if (!text || streaming) return;`:

```tsx
tapLight();
```

En `runStream`, en el callback de delta (líneas 272-275), disparar `selection()` SOLO en el primer chunk:

```tsx
(delta) => {
  if (acc === "") selection();
  acc += delta;
  setStreamBuf(acc);
},
```

- [ ] **Step 5: ListHeaderComponent — streaming editorial + TypingDots**

Reemplazar el bloque de líneas 517-528 por:

```tsx
ListHeaderComponent={
  streaming && streamBuf ? (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{assistantEyebrow}</Text>
      <View style={styles.assistantRule} />
      <View style={styles.assistantBody}>
        <MarkdownText text={stripRecipePayload(streamBuf)} />
      </View>
    </View>
  ) : awaitingFirstDelta ? (
    <View style={styles.assistantWrap}>
      <Text style={styles.assistantEyebrow}>{assistantEyebrow}</Text>
      <View style={styles.assistantRule} />
      <TypingDots />
    </View>
  ) : null
}
```

(La key i18n `chat_thinking` queda sin uso en esta pantalla; NO borrarla de los paquetes i18n.)

- [ ] **Step 6: Composer — usar SendButton**

Reemplazar el Pressable de enviar (líneas 571-578) por:

```tsx
<SendButton
  disabled={!input.trim() || streaming}
  streaming={streaming}
  onPress={handleSend}
/>
```

- [ ] **Step 7: Estilos — cuaderno editorial**

En `styles` (línea 585+):

1. `messages` (líneas 701-705): cambiar `gap: spacing.lg` → `gap: spacing.xl` (más aire entre turnos; el spec decía md→lg con baseline equivocada — el actual ya es lg, el salto real es lg→xl).
2. Reemplazar `assistantBubble` (líneas 738-745), `assistantTitle` (746-751), `assistantBody` (752-757), `qtyHighlight` (758-761) y `thinking` (764-770) por:

```tsx
// ── Mensaje del asistente: cuaderno editorial (sin tarjeta) ──────────
assistantRule: {
  width: 28,
  height: 2,
  borderRadius: 1,
  backgroundColor: colors.terracota,
  marginTop: 2,
  marginBottom: spacing.xs,
},
assistantBody: {
  maxWidth: "94%",
},
```

(`assistantWrap` y `assistantEyebrow` quedan como están. Los estilos de título/cuerpo/qty ahora viven en MarkdownText.)

- [ ] **Step 8: Verificación estática + suite**

Run: `pnpm --filter mobile exec tsc --noEmit 2>&1 | tail -5` (si el paquete no tiene script typecheck, este comando directo)
Expected: sin errores.

Run: `pnpm -r test`
Expected: todo verde (348 viejos + 15 del parser; el detector `hooks-order.test.ts` DEBE seguir verde — no se agregó ningún hook después de un early return).

- [ ] **Step 9: Commit**

```bash
git add "apps/mobile/app/(tabs)/asistente.tsx"
git commit -m "feat(mobile): Asistente cuaderno editorial — entrada con vida, TypingDots, SendButton, hapticas"
```

---

### Task 7: Verificación end-to-end local (sin deploy)

- [ ] **Step 1: Bundle real compila**

Con Metro corriendo (si no: `pnpm --filter mobile start` con CI=true en background y esperar `/status` = running):

Run: `curl -s -o /dev/null -w "%{http_code}" -m 240 "http://127.0.0.1:8081/apps/mobile/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable"`
Expected: `200`

Si Metro ya estaba corriendo de antes de estos cambios, reiniciarlo (mata el proceso en :8081 y relanza) para que tome expo-haptics nuevo.

- [ ] **Step 2: API local arriba**

Run: `curl -s -X POST http://localhost:3000/api/mobile/auth/dev-login -H "Content-Type: application/json" -d "{}"` 
Expected: JSON con `"restaurantName":"Koko"`. Si :3000 está caído, relanzar `pnpm --filter api dev` (sin ANTHROPIC_API_KEY en el shell) desde el worktree.

- [ ] **Step 3: Push de respaldo**

```bash
git push origin claude/lucid-haslett-9cf85d
```

- [ ] **Step 4: Checkpoint de Andy en Expo Go (BLOQUEANTE)**

Avisar a Andy: cerrar y abrir Expo Go. Qué mirar: mensajes del sous-chef sin tarjeta con regla terracota; títulos en cursiva teal; negritas/listas renderizadas; cantidades en terracota; puntitos animados al preguntar; mensajes nuevos entran con rebote suave; historial viejo abre QUIETO; flecha despega al enviar; botón late durante la respuesta; vibración sutil al enviar y al llegar respuesta. **Nada se da por terminado sin su OK visual.** NO deployar a prod en este plan.

---

## Self-review del plan (hecho)

- **Cobertura del spec:** parser+streaming (T1), MarkdownText (T2), TypingDots (T3), hápticas (T4), SendButton (T5), restyle editorial + gate historial + cableado (T6), validación y checkpoint (T7). Tokens de motion: el spring vive como constante local en los dos archivos que lo usan (SendButton, asistente.tsx) — con dos usos no amerita token de theme todavía (YAGNI; el spec lo marcaba condicional).
- **Sin placeholders:** todo el código está completo en los steps.
- **Consistencia de tipos:** `Span`/`Block` de T1 son los que consume T2; props de `SendButton` (T5) coinciden con el uso en T6 paso 6; `animate` de `Bubble` coincide entre T6 pasos 2 y 3.
- **Divergencia documentada con el spec:** gap de mensajes lg→xl (el spec decía md→lg con baseline desactualizada; el valor real actual es lg).
