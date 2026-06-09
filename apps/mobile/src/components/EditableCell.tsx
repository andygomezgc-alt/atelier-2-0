// Celda numérica inline-editable, estilo Excel.
//
// Comportamiento:
// - Siempre es un TextInput: tap → focus → keyboard.
// - Auto-save on blur (no botón "guardar"). Si Enter, dispara blur también.
// - Visual feedback:
//     idle:    valor formateado, sin chrome extra
//     editing: borde inferior terracota (cell en foco)
//     saving:  spinner chico al costado
//     success: check verde discreto ~1.5s, después idle
//     error:   borde inferior rojo + tono rojo en texto; el valor escrito
//              NO se pierde (el chef puede corregir + reintentar)
//
// Para "sin precio" (value=0) y un placeholder definido, muestra el
// placeholder en lugar de "0,00". Al hacer tap, el input arranca vacío y
// el chef tipea el valor real.
//
// Error de red: el catch del onSave deja el componente en estado "error"
// con el input retenido. El callerNO necesita reaccionar — la UX queda
// auto-contenida (el chef ve el error y puede reintentar tipeando + blur).

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Status = "idle" | "saving" | "success" | "error";

type Props = {
  value: number;
  format: (v: number) => string;
  parse: (input: string) => number | null;
  onSave: (v: number) => Promise<void>;
  // Texto a mostrar cuando value es exactamente 0. Si está set, el input
  // arranca vacío y el placeholder es lo que ve el chef en idle.
  placeholderForZero?: string;
  textAlign?: "left" | "right" | "center";
  width?: number;
  readOnly?: boolean;
};

export function EditableCell({
  value,
  format,
  parse,
  onSave,
  placeholderForZero,
  textAlign = "right",
  width,
  readOnly,
}: Props) {
  // Compute string a mostrar cuando NO se está editando.
  const idleText = value === 0 && placeholderForZero !== undefined ? "" : format(value);

  const [input, setInput] = useState(idleText);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<TextInput>(null);

  // Sync con cambios externos del value (refetch, otra mutación). Solo
  // sincronizamos cuando estamos en idle y sin foco — durante "saving" o
  // "error" RETENEMOS el input que escribió el chef (regresión confirmada
  // 2026-05-15: el save falla con red caída → padre revierte el value
  // optimista → este useEffect pisaba el input con el valor original →
  // el chef perdía lo que había tipeado).
  //
  // Cuando vuelve a "idle" (después del check verde de éxito, o cuando el
  // chef corrige y un nuevo save sale OK), recién ahí sincronizamos.
  useEffect(() => {
    if (editing) return;
    if (status === "saving" || status === "error") return;
    setInput(value === 0 && placeholderForZero !== undefined ? "" : format(value));
  }, [value, editing, status, format, placeholderForZero]);

  // El check verde se borra a los 1.5s.
  useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [status]);

  if (readOnly) {
    return (
      <View style={[styles.container, width ? { width } : null]}>
        <Text style={[styles.text, { textAlign }]}>
          {value === 0 && placeholderForZero ? placeholderForZero : format(value)}
        </Text>
      </View>
    );
  }

  async function commit() {
    setEditing(false);
    // Si el input quedó vacío y el placeholder cubre el 0, asumimos "sin
    // cambio respecto a 0" — no save.
    if (input.trim() === "") {
      if (value === 0) {
        setStatus("idle");
        return;
      }
      // Si había un valor previo y ahora está vacío, el chef quiere "borrar".
      // No soportamos borrado (el precio no es nullable; sería poner 0). Lo
      // tratamos como cambio a 0.
    }
    const parsed = parse(input);
    if (parsed === null) {
      setStatus("error");
      // No reabrimos editing automáticamente — el chef puede tocar de nuevo
      // para corregir. El input mantiene su valor inválido visible.
      return;
    }
    if (parsed === value) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    try {
      await onSave(parsed);
      setStatus("success");
    } catch {
      // Error de red u otro. Retenemos el input para que el chef no pierda
      // lo que escribió. El status pinta borde rojo; tocar reintenta.
      setStatus("error");
    }
  }

  return (
    <View style={[styles.container, width ? { width } : null]}>
      <TextInput
        ref={inputRef}
        value={input}
        onChangeText={(t) => {
          setInput(t);
          if (status === "error") setStatus("idle"); // limpia error al tipear
        }}
        onFocus={() => {
          setEditing(true);
          if (status === "success") setStatus("idle");
        }}
        onBlur={() => void commit()}
        onSubmitEditing={() => inputRef.current?.blur()}
        keyboardType="decimal-pad"
        selectTextOnFocus
        placeholder={value === 0 ? placeholderForZero : undefined}
        placeholderTextColor={colors.mute}
        style={[
          styles.text,
          { textAlign },
          editing && styles.editing,
          status === "error" && styles.error,
        ]}
        returnKeyType="done"
      />
      {status === "saving" ? (
        <ActivityIndicator size="small" color={colors.terracota} style={styles.feedback} />
      ) : status === "success" ? (
        <Ionicons
          name="checkmark"
          size={12}
          color={colors.teal}
          style={styles.feedback}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    minWidth: 48,
    // Sin border default: se ve como texto plano hasta el focus.
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  editing: {
    borderBottomColor: colors.terracota,
  },
  error: {
    borderBottomColor: colors.danger,
    color: colors.danger,
  },
  feedback: {
    position: "absolute",
    right: -4,
    top: -8,
  },
});
