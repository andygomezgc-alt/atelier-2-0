// Entrega A.5 — Fase 6: Modal "Estado 3" para pezzatura pendiente.
//
// Dispara cuando:
//   - El chef confirma (blur) un ingrediente con unit ∈ ("piezas", "unidad").
//   - El producto enlazado existe y tiene pezzaturaMode = null.
//   - La categoría del producto admite pezzatura (resolvePezzaturaMode ≠ null).
//   - El productId no está en el set de "saltados esta sesión".
//
// UX (spec sección 5):
//   - Modal pequeño centrado, backdrop semi-transparente.
//   - TextInput con autoFocus.
//   - "Guardar" → PATCH /api/products/[id] con pezzaturaInput. Cierra.
//   - "Después" → cierra, marca skip para este productId en esta sesión.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  parsePezzatura,
  resolvePezzaturaMode,
  type ProductCategory,
} from "@atelier/shared";
import { useI18n } from "@/src/hooks/useI18n";
import { patchProduct } from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { StatusBadge } from "@/src/components/StatusBadge";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

type Props = {
  open: boolean;
  product: { id: string; name: string; category: ProductCategory } | null;
  onClose: (action: "saved" | "later") => void;
};

export function PezzaturaPendienteModal({ open, product, onClose }: Props) {
  const { t } = useI18n();
  const kb = useKeyboardHeight();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setValue("");
      setError(null);
      setSaving(false);
      // Pequeño delay para que el modal termine la animación de fade antes
      // de pedir focus — sin esto el teclado a veces no aparece en Android.
      const tm = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(tm);
    }
  }, [open]);

  if (!product) return null;

  const mode = resolvePezzaturaMode(product.name, product.category);
  if (!mode) return null;

  const hint =
    mode === "pz_per_kg"
      ? t("producto_form_pezzatura_hint_pz_per_kg")
      : t("producto_form_pezzatura_hint_g_per_piece");

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      // Vacío = lo mismo que "Después". Sin error.
      onClose("later");
      return;
    }
    // Validar client-side para feedback inmediato. El server vuelve a
    // parsear para defensa en profundidad.
    const parsed = parsePezzatura(trimmed, product.category, product.name);
    if (!parsed) {
      setError(t("producto_form_pezzatura_error"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await patchProduct(product.id, { pezzaturaInput: trimmed });
      onClose("saved");
    } catch (err) {
      showToast(apiErrorMessage(err, t));
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onClose("later")}
    >
      <Pressable style={[styles.backdrop, { paddingBottom: kb }]} onPress={() => onClose("later")}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {t("pezzatura_pendiente_title", { name: product.name })}
          </Text>
          <Text style={styles.body}>{t("pezzatura_pendiente_body")}</Text>
          <TextInput
            ref={inputRef}
            style={[styles.input, error && styles.inputError]}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (error) setError(null);
            }}
            placeholder={hint}
            placeholderTextColor={colors.mute}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.select({ ios: "default", default: "default" })}
            onSubmitEditing={handleSave}
            returnKeyType="done"
            maxLength={100}
          />
          {error ? <StatusBadge level="warning" label={error} /> : null}
          <View style={styles.actions}>
            <Pressable
              style={styles.btnSecondary}
              onPress={() => onClose("later")}
              disabled={saving}
            >
              <Text style={styles.btnSecondaryText}>
                {t("pezzatura_pendiente_later")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.paper} size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {t("pezzatura_pendiente_save")}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 420,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifMd,
    color: colors.ink,
    lineHeight: fontSizes.serifMd * 1.3,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.4,
  },
  input: {
    marginTop: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  inputError: { borderColor: colors.terracota },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnSecondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  btnSecondaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
  btnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.paper,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.5 },
});
