// Input autocompletable para ingredientes de receta.
//
// Comportamiento:
//  - TextInput común que captura el rawText (ej. "200g harina 00").
//  - Mientras el chef tipea, debounce 250ms y consulta /api/products?q=<text>
//    para sugerir productos del banco.
//  - Sugerencias aparecen en un dropdown debajo: hasta 5 resultados +
//    una opción "+ Crear nuevo producto: '<text>'" al final.
//  - Tap sobre sugerencia → set { rawText: producto.name, productId: producto.id }
//    y cierra dropdown.
//  - Tap sobre "+ Crear nuevo" → deja productId=null por ahora; el form padre
//    crea el draft al guardar la receta.
//
// El matching fuzzy (Levenshtein con threshold) NO se hace acá — el form
// padre lo dispara en batch al momento de guardar, así el usuario solo ve
// el ConfirmMatchSheet cuando hay decisiones que tomar.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listProducts, type Product } from "@/src/api/products";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 5;

export type IngredientValue = {
  rawText: string;
  productId: string | null;
};

type Props = {
  value: IngredientValue;
  onChange: (next: IngredientValue) => void;
  placeholder?: string;
  // Cuando el chef tapea fuera del input sin haber elegido sugerencia, le
  // damos la chance al padre de hacer matching en batch al guardar.
  onBlur?: () => void;
  // Hook opcional para que el padre quite la fila del array.
  onRemove?: () => void;
};

export function IngredientAutocomplete({
  value,
  onChange,
  placeholder,
  onBlur,
  onRemove,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce timer ref. Reseteamos en cada keystroke.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el chef ya enlazó un producto pero después modifica el rawText, lo
  // desconectamos: el texto nuevo puede referirse a otro producto distinto.
  // El re-match va a correr al guardar.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChangeText(text: string) {
    onChange({
      rawText: text,
      // Si el chef edita después de elegir, despegamos el producto.
      productId: text === value.rawText ? value.productId : null,
    });

    // Debounce de las sugerencias.
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!text.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const list = await listProducts({ q: text.trim() });
        // Solo mostramos activos y borradores; archivados no aplican como sugerencia.
        setSuggestions(
          list.filter((p) => p.estado !== "archivado").slice(0, MAX_SUGGESTIONS),
        );
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function handlePickSuggestion(p: Product) {
    onChange({ rawText: p.name, productId: p.id });
    setSuggestions([]);
    setFocused(false);
  }

  // No abrimos un sub-flow de "Crear nuevo" inmediato — solo dejamos el
  // texto como rawText sin productId. El form padre, al guardar, va a:
  // (a) intentar matching fuzzy contra el banco, (b) si sale 'none' crear
  // un draft de producto automáticamente.
  function handleAcceptText() {
    setSuggestions([]);
    setFocused(false);
    onBlur?.();
  }

  const isLinked = value.productId !== null && value.rawText.length > 0;
  const showDropdown = focused && value.rawText.trim().length > 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <View style={styles.inputBox}>
          {isLinked ? (
            <Ionicons name="link" size={12} color={colors.teal} style={styles.linkIcon} />
          ) : null}
          <TextInput
            value={value.rawText}
            onChangeText={handleChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // Damos un beat para que el tap en sugerencia se registre antes
              // de cerrar el dropdown.
              setTimeout(() => {
                setFocused(false);
                onBlur?.();
              }, 150);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.mute}
            style={[styles.input, isLinked && styles.inputLinked]}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAcceptText}
          />
        </View>
        {onRemove ? (
          <Pressable hitSlop={8} onPress={onRemove} style={styles.removeBtn}>
            <Ionicons name="close" size={14} color={colors.mute} />
          </Pressable>
        ) : null}
      </View>

      {showDropdown ? (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.dropdownLoading}>
              <ActivityIndicator size="small" color={colors.terracota} />
            </View>
          ) : suggestions.length === 0 ? (
            <Text style={styles.dropdownEmpty}>—</Text>
          ) : (
            suggestions.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => handlePickSuggestion(p)}
                style={styles.suggestionRow}
              >
                <Ionicons name="link" size={11} color={colors.teal} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  inputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.sm,
  },
  linkIcon: { marginRight: 4 },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    paddingVertical: spacing.sm + 2,
  },
  inputLinked: { color: colors.ink },
  removeBtn: { padding: spacing.xs },
  dropdown: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    marginTop: 2,
    paddingVertical: spacing.xs,
  },
  dropdownLoading: { paddingVertical: spacing.xs, alignItems: "center" },
  dropdownEmpty: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontStyle: "italic",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  suggestionText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
    flexShrink: 1,
  },
});
