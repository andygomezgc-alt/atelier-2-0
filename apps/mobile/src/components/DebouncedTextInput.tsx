// TextInput con debounce y guardado en unmount.
//
// - State local: cada keystroke setea el state del propio componente sin
//   tocar al padre → tipear no re-renderea árboles grandes.
// - Debounce: tras N ms sin tocar, llama `onSave(local)` si cambió.
// - Save-on-unmount: si el usuario navega atrás antes del debounce, igual
//   se persiste el último valor pendiente.
// - Sync externo: si `value` cambia desde afuera (ej. otro PATCH reordena),
//   el state local se sincroniza.

import { useEffect, useRef, useState } from "react";
import { TextInput, type StyleProp, type TextStyle } from "react-native";
import { colors } from "@/src/theme";

const DEBOUNCE_MS = 600;

export type DebouncedTextInputProps = {
  value: string;
  onSave: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
};

export function DebouncedTextInput({
  value,
  onSave,
  editable = true,
  placeholder,
  style,
  multiline,
  keyboardType,
  autoCapitalize,
  maxLength,
}: DebouncedTextInputProps) {
  const [local, setLocal] = useState(value);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `value` y `onSave` accedidos desde el cleanup del unmount via ref para
  // evitar re-suscribir el effect cuando cambian.
  const valueRef = useRef(value);
  const onSaveRef = useRef(onSave);
  valueRef.current = value;
  onSaveRef.current = onSave;

  // Sync externo: si el padre recibe nuevo `value` y NO hay edición pendiente,
  // espejamos. Si hay edición pendiente, prevalece lo local hasta que se
  // guarde (evita perder lo que el usuario está tipeando si justo cae un
  // reload del padre).
  useEffect(() => {
    if (pendingRef.current === null) setLocal(value);
  }, [value]);

  // Flush en unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current !== null && pendingRef.current !== valueRef.current) {
        onSaveRef.current(pendingRef.current);
      }
    };
  }, []);

  function handleChange(next: string) {
    setLocal(next);
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current !== null && pendingRef.current !== valueRef.current) {
        onSaveRef.current(pendingRef.current);
      }
      pendingRef.current = null;
    }, DEBOUNCE_MS);
  }

  function handleBlur() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null && pendingRef.current !== valueRef.current) {
      onSaveRef.current(pendingRef.current);
    }
    pendingRef.current = null;
  }

  return (
    <TextInput
      value={local}
      onChangeText={handleChange}
      onBlur={handleBlur}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.mute}
      style={style}
      multiline={multiline}
      keyboardType={keyboardType ?? "default"}
      autoCapitalize={autoCapitalize ?? "sentences"}
      maxLength={maxLength}
      scrollEnabled={false}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
}
