// Gestión de equipo F3 — Sheet "Salir del restaurante" con los 3 casos.
//
// Al abrir, hace GET /api/restaurant/leave/preflight para saber qué variante
// rendear sin disparar acciones. Después:
//   A: confirm destructive normal → POST /leave → signOut + redirect login.
//   B: bloqueado → muestra los otros miembros + solo Cerrar.
//   C: typing-confirm del nombre del restaurante (patrón destructivo fuerte)
//      → POST /leave (borra todo) → signOut + redirect login.
//
// El POST a /leave NUNCA se llama en caso B — el preflight ya filtró. En
// caso C solo se llama cuando el typing matchea exacto.

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
import { useRouter } from "expo-router";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { BottomSheet } from "./BottomSheet";
import { StatusBadge } from "./StatusBadge";
import { showToast } from "./Toast";
import { getLeavePreflight, leaveRestaurant, type LeavePreflight } from "@/src/api/auth";
import { ApiError } from "@/src/api/client";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Status =
  | { kind: "loading" }
  | { kind: "ready"; preflight: LeavePreflight }
  | { kind: "error"; message: string };

export function LeaveRestaurantSheet({ open, onClose }: Props) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  // F3-C: confirm-by-typing del nombre del restaurante.
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus({ kind: "loading" });
    setSubmitting(false);
    setTypedName("");
    getLeavePreflight()
      .then((preflight) => {
        if (!cancelled) setStatus({ kind: "ready", preflight });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = apiErrorMessage(err, t);
        setStatus({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  async function handleLeaveOrDelete() {
    if (submitting) return;
    if (status.kind !== "ready") return;
    // Solo A y C ejecutan un POST; el caso B no tiene botón de acción.
    const expectedCase = status.preflight.case;
    if (expectedCase !== "A" && expectedCase !== "C") return;

    setSubmitting(true);
    try {
      // P1-1: mandamos el caso que confirmamos y (en C) el nombre exacto. El
      // server los re-valida dentro de una tx serializable.
      await leaveRestaurant({
        expectedCase,
        confirmName: expectedCase === "C" ? typedName.trim() : undefined,
      });
      onClose();
      await signOut();
      router.replace("/(auth)/login");
    } catch (err) {
      // P1-1: 409 case_changed → la situación cambió mientras teníamos la hoja
      // abierta (otro miembro salió/entró). NO ejecutamos nada: re-pedimos el
      // preflight y re-mostramos el caso nuevo para que el chef vuelva a decidir.
      if (err instanceof ApiError && err.status === 409) {
        showToast(err.message || t("error_network"));
        setTypedName("");
        try {
          const preflight = await getLeavePreflight();
          setStatus({ kind: "ready", preflight });
        } catch (e) {
          setStatus({
            kind: "error",
            message: apiErrorMessage(e, t),
          });
        } finally {
          setSubmitting(false);
        }
        return;
      }
      showToast(apiErrorMessage(err, t));
      setSubmitting(false);
    }
  }

  // F3-C: el typing-confirm matchea trim contra el nombre exacto del
  // restaurante (case-sensitive). Sin coincidencia → botón deshabilitado.
  const caseCRestaurantName =
    status.kind === "ready" && status.preflight.case === "C"
      ? (status.preflight.restaurantName ?? "")
      : "";
  const caseCMatches =
    caseCRestaurantName.length > 0 &&
    typedName.trim() === caseCRestaurantName;

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
              <Text style={styles.title}>{t("leave_case_a_title")}</Text>
              <Text style={styles.body}>{t("leave_case_a_body")}</Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  style={styles.btnGhost}
                  disabled={submitting}
                >
                  <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
                </Pressable>
                <Pressable
                  onPress={handleLeaveOrDelete}
                  disabled={submitting}
                  style={[styles.btnDanger, submitting && styles.btnDisabled]}
                >
                  <Text style={styles.btnDangerLabel}>
                    {submitting ? "…" : t("leave_case_a_confirm")}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : status.preflight.case === "B" ? (
            <>
              <StatusBadge level="error" label={t("leave_case_b_title")} />
              <Text style={styles.body}>{t("leave_case_b_body")}</Text>
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
          ) : (
            // F3-C: borrado destructivo del restaurante completo. Typing-confirm
            // del nombre exacto antes de habilitar el botón Eliminar.
            <>
              <StatusBadge level="error" label={t("leave_case_c_title")} />
              <Text style={styles.body}>{t("leave_case_c_body")}</Text>
              <Text style={styles.typingHint}>
                {t("leave_case_c_typing_hint", { name: caseCRestaurantName })}
              </Text>
              <TextInput
                value={typedName}
                onChangeText={setTypedName}
                placeholder={caseCRestaurantName}
                placeholderTextColor={colors.mute}
                style={styles.typingInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
              />
              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  style={styles.btnGhost}
                  disabled={submitting}
                >
                  <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
                </Pressable>
                <Pressable
                  onPress={handleLeaveOrDelete}
                  disabled={!caseCMatches || submitting}
                  style={[
                    styles.btnDanger,
                    (!caseCMatches || submitting) && styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.btnDangerLabel}>
                    {submitting ? "…" : t("leave_case_c_confirm")}
                  </Text>
                </Pressable>
              </View>
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
