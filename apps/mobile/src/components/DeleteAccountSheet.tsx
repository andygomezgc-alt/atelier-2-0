// Perfil — Sheet "Eliminar cuenta" con los 4 casos del preflight.
//
// Al abrir, hace GET /api/me/delete-preflight para saber qué variante rendear
// sin disparar acciones (mismo patrón que LeaveRestaurantSheet). Después:
//   A:    la cuenta se borra pero el restaurante sigue → confirm por email.
//   B:    bloqueado (único admin con otros miembros) → solo Cerrar.
//   C:    último miembro → borrar la cuenta borra TODO el restaurante →
//         advertencia fuerte + confirm por email.
//   none: sin restaurante → borrado simple + confirm por email.
//
// El DELETE NUNCA se llama en caso B — el preflight ya filtró. En A/C/none
// solo se llama cuando el email tipeado matchea el de la cuenta.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { BottomSheet } from "./BottomSheet";
import { StatusBadge } from "./StatusBadge";
import { showToast } from "./Toast";
import { deleteAccount, deletePreflight, type DeletePreflight } from "@/src/api/auth";
import { ApiError } from "@/src/api/client";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Status =
  | { kind: "loading" }
  | { kind: "ready"; preflight: DeletePreflight }
  | { kind: "error"; message: string };

export function DeleteAccountSheet({ open, onClose }: Props) {
  const { t } = useI18n();
  const { state, signOut } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  // Confirm-by-typing del email exacto de la cuenta.
  const [typedEmail, setTypedEmail] = useState("");

  const email =
    state.status === "signed-in" || state.status === "needs-restaurant"
      ? state.user.email
      : "";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus({ kind: "loading" });
    setSubmitting(false);
    setTypedEmail("");
    deletePreflight()
      .then((preflight) => {
        if (!cancelled) setStatus({ kind: "ready", preflight });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: apiErrorMessage(err, t) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  // El botón rojo solo se habilita cuando el tipeo matchea el email de la
  // cuenta (trim + case-insensitive: el email no distingue mayúsculas).
  const emailMatches =
    email.length > 0 && typedEmail.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (submitting) return;
    if (status.kind !== "ready") return;
    // Solo A, C y none ejecutan el DELETE; el caso B no tiene botón de acción.
    if (status.preflight.case === "B") return;
    if (!emailMatches) return;

    setSubmitting(true);
    try {
      // Mandamos el email CANÓNICO de la cuenta, no el tipeado: el server
      // compara byte a byte y el gate local es case-insensitive — si mandáramos
      // el tipeo, "Chef@x.com" habilitaría el botón y el server lo rebotaría
      // con confirm_mismatch en loop.
      await deleteAccount(email);
      onClose();
      await signOut();
    } catch (err) {
      // 409 (last_admin / case_changed) → la situación cambió con la hoja
      // abierta. NO ejecutamos nada: re-pedimos el preflight y re-mostramos el
      // caso nuevo para que el chef vuelva a decidir.
      if (err instanceof ApiError && err.status === 409) {
        showToast(apiErrorMessage(err, t));
        setTypedEmail("");
        try {
          const preflight = await deletePreflight();
          setStatus({ kind: "ready", preflight });
        } catch (e) {
          setStatus({ kind: "error", message: apiErrorMessage(e, t) });
        } finally {
          setSubmitting(false);
        }
        return;
      }
      showToast(apiErrorMessage(err, t));
      setSubmitting(false);
    }
  }

  // Counts de contenido creado por el usuario (solo se muestran los > 0).
  const authoredLines =
    status.kind === "ready"
      ? (
          [
            ["delete_account_authored_recipes", status.preflight.authored.recipes],
            ["delete_account_authored_ideas", status.preflight.authored.ideas],
            [
              "delete_account_authored_conversations",
              status.preflight.authored.conversations,
            ],
            [
              "delete_account_authored_yield_tests",
              status.preflight.authored.yieldTests,
            ],
          ] as const
        ).filter(([, count]) => count > 0)
      : [];

  const restaurantName =
    status.kind === "ready" ? (status.preflight.restaurantName ?? "") : "";

  const emailConfirmBlock = (
    <>
      <Text style={styles.typingHint}>
        {t("delete_account_typing_hint", { email })}
      </Text>
      <TextInput
        value={typedEmail}
        onChangeText={setTypedEmail}
        placeholder={t("delete_account_email_placeholder")}
        placeholderTextColor={colors.mute}
        style={styles.typingInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!submitting}
      />
      <View style={styles.actions}>
        <Pressable onPress={onClose} style={styles.btnGhost} disabled={submitting}>
          <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          disabled={!emailMatches || submitting}
          style={[styles.btnDanger, (!emailMatches || submitting) && styles.btnDisabled]}
        >
          <Text style={styles.btnDangerLabel}>
            {submitting ? "…" : t("delete_account_confirm")}
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        {status.kind === "loading" ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.terracota} />
          </View>
        ) : status.kind === "error" ? (
          <>
            <StatusBadge level="error" label={t("error_network")} />
            <Text style={styles.body}>{status.message}</Text>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.btnGhost}>
                <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
              </Pressable>
            </View>
          </>
        ) : status.preflight.case === "A" ? (
          <>
            <StatusBadge level="warning" label={t("confirm_destructive_badge")} />
            <Text style={styles.title}>{t("delete_account_title")}</Text>
            <Text style={styles.body}>
              {t("delete_account_case_a_body", { name: restaurantName })}
            </Text>
            {authoredLines.length > 0 ? (
              <View style={styles.authoredList}>
                <Text style={styles.authoredIntro}>
                  {t("delete_account_authored_intro")}
                </Text>
                {authoredLines.map(([key, count]) => (
                  <Text key={key} style={styles.authoredLine}>
                    {t(key, { count })}
                  </Text>
                ))}
              </View>
            ) : null}
            {emailConfirmBlock}
          </>
        ) : status.preflight.case === "B" ? (
          <>
            <StatusBadge level="error" label={t("leave_case_b_title")} />
            <Text style={styles.body}>
              {t("delete_account_case_b_body", { name: restaurantName })}
            </Text>
            {status.preflight.otherMembers && status.preflight.otherMembers.length > 0 ? (
              <View style={styles.memberList}>
                {status.preflight.otherMembers.map((m) => (
                  <View key={m.id} style={styles.memberRow}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <Text style={styles.memberRole}>{m.role}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.btnGhost}>
                <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
              </Pressable>
            </View>
          </>
        ) : status.preflight.case === "C" ? (
          // Último miembro: borrar la cuenta borra TODO el restaurante.
          <>
            <StatusBadge level="error" label={t("delete_account_case_c_title")} />
            <Text style={styles.body}>
              {t("delete_account_case_c_body", { name: restaurantName })}
            </Text>
            {emailConfirmBlock}
          </>
        ) : (
          // none: sin restaurante — borrado simple de la cuenta.
          <>
            <StatusBadge level="warning" label={t("confirm_destructive_badge")} />
            <Text style={styles.title}>{t("delete_account_title")}</Text>
            <Text style={styles.body}>{t("delete_account_none_body")}</Text>
            {emailConfirmBlock}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  authoredList: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  authoredIntro: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.4,
  },
  authoredLine: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
  },
  typingHint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    fontWeight: "600",
  },
  typingInput: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  memberList: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  memberName: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  memberRole: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnGhost: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  btnGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.mute,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  btnDisabled: { opacity: 0.5 },
  btnDangerLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
});
