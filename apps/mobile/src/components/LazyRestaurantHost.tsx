// A-12 — Modal global "dale un nombre a tu sitio". Cualquier acción de
// persistencia que ocurra en estado needs-restaurant llama a
// `ensureRestaurant()` (importado de este módulo); si ya hay restaurante
// resuelve sincrónicamente, si no abre el modal y resuelve cuando el chef
// confirma el alta.
//
// Patrón: mismo módulo singleton que Toast — el host se monta una vez en
// `_layout.tsx`, las funciones públicas operan sobre un store interno.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getAuthState, getAuthActions, type MeUser } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { apiFetch, ApiError } from "@/src/api/client";
import type { CreateRestaurantResponse } from "@atelier/shared";
import { apiErrorMessage } from "@/src/lib/api-error";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Pending = {
  resolve: (user: MeUser) => void;
  reject: (err: Error) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return pending;
}

/**
 * Garantiza que el usuario tenga restaurante. Si ya lo tiene, resuelve
 * inmediato con el user actualizado. Si no, abre el modal global de alta
 * y resuelve cuando el chef confirma (rechaza si cancela).
 */
export function ensureRestaurant(): Promise<MeUser> {
  const s = getAuthState();
  if (
    (s.status === "signed-in" || s.status === "needs-restaurant") &&
    s.user.restaurantId
  ) {
    return Promise.resolve(s.user);
  }
  if (s.status !== "needs-restaurant") {
    return Promise.reject(new Error("not_authenticated"));
  }
  // Si ya hay un modal abierto, lo encadenamos al mismo resultado.
  if (pending) {
    const previous = pending;
    return new Promise<MeUser>((resolve, reject) => {
      const chained: Pending = {
        resolve: (u) => {
          previous.resolve(u);
          resolve(u);
        },
        reject: (e) => {
          previous.reject(e);
          reject(e);
        },
      };
      pending = chained;
    });
  }
  return new Promise<MeUser>((resolve, reject) => {
    pending = { resolve, reject };
    notify();
  });
}

export function LazyRestaurantHost() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (value) {
      setName("");
      setCreating(false);
    }
  }, [value]);

  if (!value) return null;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating || !value) return;
    setCreating(true);
    try {
      const res = await apiFetch<CreateRestaurantResponse>("/api/restaurant", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      // patchLocalUser actualiza el auth-state sin GET extra (mismo patrón
      // que A-10 / Ola 0 0.2). Sincrónico.
      const actions = getAuthActions();
      actions.patchLocalUser({
        restaurantId: res.id,
        restaurantName: res.name,
        role: res.role,
      });
      const next = getAuthState();
      if (
        (next.status === "signed-in" || next.status === "needs-restaurant") &&
        next.user.restaurantId
      ) {
        value.resolve(next.user);
      } else {
        value.reject(new Error("auth_state_inconsistent"));
      }
      pending = null;
      notify();
    } catch (err) {
      setCreating(false);
      // Race: si entre el render y el submit otro device creó restaurante,
      // refreshMe lo resuelve. Toast localizado igual que A-10.
      if (err instanceof ApiError && err.status === 409) {
        const actions = getAuthActions();
        await actions.refreshMe();
        // A-11: el server adjunta code="already_in_restaurant". El helper
        // hace el lookup en el idioma del chef.
        showToast(apiErrorMessage(err, t));
        const next = getAuthState();
        if (
          (next.status === "signed-in" || next.status === "needs-restaurant") &&
          next.user.restaurantId
        ) {
          value.resolve(next.user);
          pending = null;
          notify();
        }
        return;
      }
      showToast(apiErrorMessage(err, t));
    }
  }

  function handleCancel() {
    if (!value) return;
    value.reject(new Error("cancelled"));
    pending = null;
    notify();
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t("lazy_modal_title")}</Text>
          <Text style={styles.sub}>{t("lazy_modal_sub")}</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={t("lazy_modal_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={100}
            onSubmitEditing={handleCreate}
            editable={!creating}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={handleCancel}
              disabled={creating}
              style={styles.btnGhost}
            >
              <Text style={styles.btnGhostLabel}>{t("lazy_modal_cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              style={[
                styles.btnPrimary,
                (!name.trim() || creating) && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnPrimaryLabel}>
                {creating ? t("onboard_creating") : t("lazy_modal_create")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  input: {
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
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
  },
  btnGhost: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  btnGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  btnPrimary: {
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
});
