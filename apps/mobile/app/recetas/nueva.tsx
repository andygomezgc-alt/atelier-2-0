// Crear / revisar receta. Modos:
//  - Crear desde cero
//  - Revisar tras carga de PDF/DOCX (cargar.tsx deja la extracción en recipe-draft)
//  - Editar una receta existente (recipe-draft con editId)
//
// Fase 2 del Banco de Productos — los ingredientes ahora son estructurados:
// { rawText, productId }. Al guardar disparamos el flujo de matching:
//   1. POST /api/products/match con todos los ingredientes sin productId.
//   2. Procesamos resultados:
//      - exact (distancia 0): linkeamos productId silenciosamente.
//      - probable (1-3): encolamos para mostrar ConfirmMatchSheet, uno a uno.
//      - none (>3): marcamos para crear borrador automático al final.
//   3. ConfirmMatchSheet (Sí/No):
//      - Sí: linkear + agregar rawText como alias del producto (best-effort).
//      - No: tratar como "none" → se crea borrador.
//   4. Cuando la cola está vacía, creamos los drafts pendientes en paralelo
//      y disparamos el create/patch de la receta con recipeIngredients.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Button } from "@/src/components/Button";
import {
  IngredientAutocomplete,
  type IngredientValue,
} from "@/src/components/IngredientAutocomplete";
import { ConfirmMatchSheet } from "@/src/components/ConfirmMatchSheet";
import { PezzaturaPendienteModal } from "@/src/components/PezzaturaPendienteModal";
import { PesoCalculoEditor } from "@/src/components/PesoCalculoEditor";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { createRecipe, patchRecipe } from "@/src/api/recipes";
import {
  createProductFromRaw,
  listProducts,
  matchProducts,
  patchProduct,
  getProduct,
} from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { consumeRecipeDraft } from "@/src/lib/recipe-draft";
import {
  can,
  parseIngredient,
  resolvePezzaturaMode,
} from "@atelier/shared";
import type {
  ProductCategory,
  ProductListItem,
  RecipeIngredientInput,
} from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// Cola de probables a confirmar. Procesamos uno a uno.
type PendingMatch = {
  ingredientIdx: number;
  rawText: string;
  productId: string;
  productName: string;
};

export default function NuevaRecetaScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState<IngredientValue[]>([
    { rawText: "", productId: null },
  ]);
  const [method, setMethod] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Estado del flujo de matching durante el save.
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);

  // Cache local de productos del banco. Sirve para:
  //  - Aviso anti-typo (Ajuste 2 del plan A.5).
  //  - Modal Estado 3 (Fase 6) — necesita pezzaturaMode null.
  //  - PesoCalculoEditor (Fase 7) — necesita pezzaturaMode/Min/Max no-null.
  // Una request al montar — listProducts ya tiene TTL 30s.
  const [productsById, setProductsById] = useState<
    Map<
      string,
      Pick<
        ProductListItem,
        "name" | "category" | "pezzaturaMode" | "pezzaturaMin" | "pezzaturaMax"
      >
    >
  >(new Map());

  // Fase 6 — modal Estado 3.
  // skippedSet vive en useRef para no re-renderizar cuando se modifica;
  // su contenido se "olvida" al desmontar la screen (acepable según spec).
  const skippedSet = useRef<Set<string>>(new Set());
  const [pezzaturaModalProduct, setPezzaturaModalProduct] = useState<{
    id: string;
    name: string;
    category: ProductCategory;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const all = await listProducts();
        const map = new Map<
          string,
          Pick<
            ProductListItem,
            "name" | "category" | "pezzaturaMode" | "pezzaturaMin" | "pezzaturaMax"
          >
        >();
        for (const p of all)
          map.set(p.id, {
            name: p.name,
            category: p.category,
            pezzaturaMode: p.pezzaturaMode,
            pezzaturaMin: p.pezzaturaMin,
            pezzaturaMax: p.pezzaturaMax,
          });
        setProductsById(map);
      } catch {
        // Si falla, el aviso simplemente no aparece — no rompe el editor.
      }
    })();
  }, []);

  // Fase 6 — evalúa si el ingrediente disparara el modal Estado 3 en blur:
  //   - hay productId asignado,
  //   - producto en categoría que admite pezzatura,
  //   - producto SIN pezzatura cargada (pezzaturaMode === null),
  //   - rawText cuyo parser sugiere unit="unidad",
  //   - productId NO está en skippedSet.
  function maybeOpenPezzaturaModal(ingredient: IngredientValue) {
    if (!ingredient.productId) return;
    if (skippedSet.current.has(ingredient.productId)) return;
    const product = productsById.get(ingredient.productId);
    if (!product) return;
    if (product.pezzaturaMode !== null) return; // ya cargada
    if (
      resolvePezzaturaMode(product.name, product.category as ProductCategory) ===
      null
    )
      return; // categoría no admite
    const parsed = parseIngredient(ingredient.rawText);
    if (parsed.unit !== "unidad") return;
    setPezzaturaModalProduct({
      id: ingredient.productId,
      name: product.name,
      category: product.category as ProductCategory,
    });
  }

  function closePezzaturaModal(action: "saved" | "later") {
    if (pezzaturaModalProduct && action === "later") {
      skippedSet.current.add(pezzaturaModalProduct.id);
    }
    if (pezzaturaModalProduct && action === "saved") {
      // El producto ya tiene pezzatura cargada — refrescamos el cache local
      // para que el siguiente blur sobre el mismo no vuelva a abrir.
      const existing = productsById.get(pezzaturaModalProduct.id);
      if (existing) {
        const next = new Map(productsById);
        next.set(pezzaturaModalProduct.id, {
          ...existing,
          pezzaturaMode: "g_per_piece", // valor temporal — el server tiene el real
        });
        setProductsById(next);
      }
    }
    setPezzaturaModalProduct(null);
  }

  // Avisos inline debajo de cada ingrediente (mutuamente excluyentes):
  //  - "anti_typo" — unit=piezas pero la categoría del producto NO admite
  //    pezzatura (ej: "2 Zucchine" sobre verdura). El chef seguramente quiso
  //    medir por peso.
  //  - "missing_pezzatura" — unit=piezas, la categoría SÍ admite pezzatura,
  //    pero el producto enlazado tiene pezzaturaMode=null. Recordatorio
  //    pasivo del modal Estado 3 (que se puede cerrar con "Después"). Es
  //    tocable: navega al detail del producto donde el chef carga calibre.
  type IngredientInlineWarning =
    | { kind: "anti_typo" }
    | { kind: "missing_pezzatura"; productId: string };
  function getIngredientInlineWarning(
    ingredient: { rawText: string; productId: string | null },
  ): IngredientInlineWarning | null {
    if (!ingredient.productId) return null;
    const product = productsById.get(ingredient.productId);
    if (!product) return null;
    const parsed = parseIngredient(ingredient.rawText);
    if (parsed.unit !== "unidad") return null;
    const categoryMode = resolvePezzaturaMode(
      product.name,
      product.category as ProductCategory,
    );
    if (categoryMode === null) return { kind: "anti_typo" };
    if (product.pezzaturaMode === null)
      return { kind: "missing_pezzatura", productId: ingredient.productId };
    return null;
  }
  // Ref para que el callback del modal vea el array vigente sin re-bindings.
  const flowStateRef = useRef<{
    workingIngredients: IngredientValue[];
    draftIndices: number[];
  } | null>(null);
  const [sourceConversationId, setSourceConversationId] = useState<string | null>(null);

  // Pre-fill desde upload o "Modificar receta".
  useEffect(() => {
    const draft = consumeRecipeDraft();
    if (!draft) return;
    setTitle(draft.title);
    // Preferencia de fuente:
    //  1. draft.recipeIngredients (Fase 3): viene del upload server con
    //     productIds ya pre-set para matches exactos. Es la mejor info.
    //  2. draft.contentJson.ingredients (legacy): array de strings — los
    //     convertimos a IngredientValue sin productId; el save-flow va a
    //     intentar matchearlos.
    let fromDraft: IngredientValue[];
    if (draft.recipeIngredients && draft.recipeIngredients.length > 0) {
      fromDraft = draft.recipeIngredients.map((r) => ({
        rawText: r.rawText,
        productId: r.productId ?? null,
        // Fase 7: pre-fill del override cuando "Modificar receta" abre una
        // receta que ya tiene pesoCalculoG persistido.
        pesoCalculoG: r.pesoCalculoG ?? null,
      }));
    } else if (draft.contentJson.ingredients.length > 0) {
      fromDraft = draft.contentJson.ingredients.map((s) => ({
        rawText: s,
        productId: null as string | null,
      }));
    } else {
      fromDraft = [{ rawText: "", productId: null }];
    }
    setIngredients(fromDraft);
    setMethod(draft.contentJson.method.length ? draft.contentJson.method : [""]);
    setNotes(draft.contentJson.notes ?? "");
    if (draft.editId) setEditId(draft.editId);
    // El vínculo con la conversación del Asistente se perdía acá: el draft
    // lo traía pero el payload del save no lo incluía. El server lo usa para
    // archivar la nota (Idea) de origen al guardar la receta.
    if (draft.sourceConversationId) setSourceConversationId(draft.sourceConversationId);
  }, []);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_recipe");

  async function handleSave() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setSaving(true);

    try {
      // Snapshot de ingredientes con rawText limpio (descartamos los vacíos).
      // pesoCalculoG (Entrega A.5, Fase 7) viaja en el snapshot para que
      // el server lo persista en RecipeIngredient cuando finalize() construye
      // el payload del create/patch.
      const working = ingredients
        .map((i) => ({
          rawText: i.rawText.trim(),
          productId: i.productId,
          pesoCalculoG: i.pesoCalculoG ?? null,
        }))
        .filter((i) => i.rawText.length > 0);

      // Disparar matching solo para los que no tienen productId todavía.
      const toMatchIndices: number[] = [];
      const toMatchTexts: string[] = [];
      working.forEach((i, idx) => {
        if (!i.productId) {
          toMatchIndices.push(idx);
          toMatchTexts.push(i.rawText);
        }
      });

      const draftIndices: number[] = [];
      const pending: PendingMatch[] = [];

      if (toMatchTexts.length > 0) {
        const results = await matchProducts(toMatchTexts);
        results.forEach((r, k) => {
          const idx = toMatchIndices[k]!;
          if (r.level === "exact" && r.productId) {
            // Silent link.
            working[idx]!.productId = r.productId;
          } else if (r.level === "probable" && r.productId && r.productName) {
            pending.push({
              ingredientIdx: idx,
              rawText: working[idx]!.rawText,
              productId: r.productId,
              productName: r.productName,
            });
          } else {
            // none → crear borrador al final.
            draftIndices.push(idx);
          }
        });
      }

      // Guardamos el estado en el ref para que ConfirmMatchSheet pueda
      // mutarlo y al final llamar finalize().
      flowStateRef.current = { workingIngredients: working, draftIndices };

      if (pending.length > 0) {
        setPendingMatches(pending);
        // El flujo continúa en handleMatchYes/handleMatchNo, que terminan
        // llamando a finalize() cuando la cola se vacía.
      } else {
        await finalize();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
      setSaving(false);
    }
  }

  async function handleMatchYes() {
    const current = pendingMatches[0];
    if (!current || !flowStateRef.current) return;
    const { workingIngredients } = flowStateRef.current;
    workingIngredients[current.ingredientIdx]!.productId = current.productId;

    // Best-effort: agregar el nombre del ingrediente (sin cantidad) como
    // alias del producto. No bloqueamos el flujo si esto falla — el linkeo
    // ya quedó hecho. Se parsea para que "480 g ricciola frollata" quede
    // como alias "ricciola frollata" y matchee exacto la próxima vez.
    void (async () => {
      try {
        const aliasName = parseIngredient(current.rawText).name || current.rawText;
        const prod = await getProduct(current.productId);
        const existing = new Set(prod.aliases.map((a) => a.toLowerCase()));
        if (!existing.has(aliasName.toLowerCase())) {
          await patchProduct(current.productId, {
            aliases: [...prod.aliases, aliasName],
          });
        }
      } catch {
        // silently ignore
      }
    })();

    const remaining = pendingMatches.slice(1);
    setPendingMatches(remaining);
    if (remaining.length === 0) {
      await finalize();
    }
  }

  async function handleMatchNo() {
    const current = pendingMatches[0];
    if (!current || !flowStateRef.current) return;
    // Tratar como "none" → crear borrador en finalize.
    flowStateRef.current.draftIndices.push(current.ingredientIdx);
    const remaining = pendingMatches.slice(1);
    setPendingMatches(remaining);
    if (remaining.length === 0) {
      await finalize();
    }
  }

  // Última etapa del save: crear los borradores y mandar la receta.
  async function finalize() {
    if (!flowStateRef.current) return;
    const { workingIngredients, draftIndices } = flowStateRef.current;

    try {
      if (draftIndices.length > 0) {
        // Sub-paso 6 Bug B fix (Andy 2026-05-17): usamos createProductFromRaw
        // para que el server aplique parseIngredient + categorizeFromName +
        // defaultPurchaseUnit + defaultMermaPct + defaultCriticality sobre
        // el rawText. Antes hardcodeábamos category="otro", unidadCompra=
        // "unidad" y name=rawText con cantidad pegada — chapuza que duplicaba
        // todo lo que ya estaba migrado vía pipelines distintos.
        const created = await Promise.all(
          draftIndices.map((idx) =>
            createProductFromRaw(workingIngredients[idx]!.rawText),
          ),
        );
        created.forEach((p, k) => {
          const idx = draftIndices[k]!;
          workingIngredients[idx]!.productId = p.id;
        });
      }

      const recipeIngredients: RecipeIngredientInput[] = workingIngredients.map(
        (i) => ({
          rawText: i.rawText,
          productId: i.productId,
          // Entrega A.5, Fase 7: el override viaja al server vía workingIngredients
          // (poblado en handleSave) y persiste en RecipeIngredient.pesoCalculoG.
          pesoCalculoG: i.pesoCalculoG ?? null,
        }),
      );

      const payload = {
        title: title.trim(),
        contentJson: {
          ingredients: workingIngredients.map((i) => i.rawText),
          method: method.map((m) => m.trim()).filter(Boolean),
          notes: notes.trim(),
        },
        recipeIngredients,
      };

      if (editId) {
        await patchRecipe(editId, payload);
        showToast(t("toast_recipe_saved"));
        router.replace({ pathname: "/recetas/[id]", params: { id: editId } });
      } else {
        await createRecipe({
          ...payload,
          ...(sourceConversationId ? { sourceConversationId } : {}),
        });
        showToast(t("toast_recipe_saved"));
        router.replace("/(tabs)/recetas");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      flowStateRef.current = null;
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Screen title={t("recetas_nueva_title")} back onBack={() => router.back()}>
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.mute, fontFamily: fonts.sans }}>
            {t("error_network")}
          </Text>
        </View>
      </Screen>
    );
  }

  const screenTitle = editId ? t("recipe_editar_title") : t("recetas_nueva_title");
  const currentMatch = pendingMatches[0] ?? null;

  return (
    <Screen title={screenTitle} back onBack={() => router.back()}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Eyebrow>{t("recetas_form_title_label")}</Eyebrow>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("recetas_form_title_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.titleInput}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
            />
          </View>

          <View>
            <Eyebrow>{t("section_ingredients")}</Eyebrow>
            {ingredients.map((it, idx) => {
              const warning = getIngredientInlineWarning(it);
              // Fase 7 — PesoCalculoEditor solo si:
              //   - hay producto enlazado,
              //   - producto tiene pezzatura del banco (mode !== null),
              //   - el rawText sugiere unit=piezas.
              const product = it.productId
                ? productsById.get(it.productId)
                : null;
              const parsed = parseIngredient(it.rawText);
              const showPesoEditor =
                product !== null &&
                product?.pezzaturaMode !== null &&
                product?.pezzaturaMin !== null &&
                product?.pezzaturaMax !== null &&
                parsed.unit === "unidad";
              return (
                <View key={idx} style={styles.ingredientRow}>
                  <IngredientAutocomplete
                    value={it}
                    onChange={(next) =>
                      setIngredients((prev) =>
                        prev.map((p, i) => (i === idx ? next : p)),
                      )
                    }
                    onBlur={() => maybeOpenPezzaturaModal(it)}
                    placeholder={t("recetas_form_ingredient_placeholder")}
                    onRemove={
                      ingredients.length > 1
                        ? () =>
                            setIngredients((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                        : undefined
                    }
                  />
                  {warning?.kind === "anti_typo" && (
                    <Text style={styles.antiTypoWarning}>
                      {t("recetas_aviso_no_pezzatura_unit")}
                    </Text>
                  )}
                  {warning?.kind === "missing_pezzatura" && (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/productos/[id]",
                          params: { id: warning.productId },
                        })
                      }
                      hitSlop={4}
                    >
                      <Text style={styles.antiTypoWarning}>
                        {t("recetas_aviso_falta_pezzatura")}
                      </Text>
                    </Pressable>
                  )}
                  {showPesoEditor && product && (
                    <PesoCalculoEditor
                      pezzaturaMode={product.pezzaturaMode!}
                      pezzaturaMin={product.pezzaturaMin!}
                      pezzaturaMax={product.pezzaturaMax!}
                      value={it.pesoCalculoG ?? null}
                      onChange={(next) =>
                        setIngredients((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, pesoCalculoG: next } : p,
                          ),
                        )
                      }
                    />
                  )}
                </View>
              );
            })}
            <Pressable
              style={styles.addBtn}
              onPress={() =>
                setIngredients((prev) => [...prev, { rawText: "", productId: null }])
              }
            >
              <Ionicons name="add" size={16} color={colors.terracota} />
              <Text style={styles.addLabel}>{t("recetas_form_add_ingredient")}</Text>
            </Pressable>
          </View>

          <View>
            <Eyebrow>{t("section_method")}</Eyebrow>
            {method.map((it, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.step}>{idx + 1}.</Text>
                <TextInput
                  value={it}
                  onChangeText={(v) =>
                    setMethod((prev) => prev.map((p, i) => (i === idx ? v : p)))
                  }
                  placeholder={t("recetas_form_step_placeholder")}
                  placeholderTextColor={colors.mute}
                  style={styles.lineInput}
                  multiline
                />
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    setMethod((prev) =>
                      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                    )
                  }
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.mute} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() => setMethod((prev) => [...prev, ""])}
            >
              <Ionicons name="add" size={16} color={colors.terracota} />
              <Text style={styles.addLabel}>{t("recetas_form_add_step")}</Text>
            </Pressable>
          </View>

          <View>
            <Eyebrow>{t("section_note")}</Eyebrow>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("recetas_form_notes_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.notesInput}
              multiline
            />
          </View>

          {saving && pendingMatches.length === 0 ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={colors.terracota} size="small" />
            </View>
          ) : null}

          <Button
            label={saving ? "…" : t("btn_save")}
            onPress={handleSave}
            disabled={!title.trim() || saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {currentMatch ? (
        <ConfirmMatchSheet
          open
          rawText={currentMatch.rawText}
          candidateName={currentMatch.productName}
          title={t("confirm_match_title")}
          body={t("confirm_match_body")}
          yesLabel={t("confirm_match_yes")}
          noLabel={t("confirm_match_no")}
          onYes={() => void handleMatchYes()}
          onNo={() => void handleMatchNo()}
        />
      ) : null}

      {/* Fase 6 — modal Estado 3 (pezzatura pendiente). Dispara en blur del
          IngredientAutocomplete cuando el ingrediente cuenta unidades y el
          producto enlazado no tiene pezzatura cargada. */}
      <PezzaturaPendienteModal
        open={pezzaturaModalProduct !== null}
        product={pezzaturaModalProduct}
        onClose={closePezzaturaModal}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  titleInput: {
    marginTop: spacing.sm,
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    lineHeight: fontSizes.serifLg * 1.25,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 72,
  },
  ingredientRow: { marginTop: spacing.sm },
  antiTypoWarning: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    fontStyle: "italic",
    lineHeight: fontSizes.bodySm * 1.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  step: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.terracota,
    paddingTop: spacing.sm + 4,
    minWidth: 22,
  },
  lineInput: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 40,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    fontWeight: "600",
  },
  notesInput: {
    marginTop: spacing.sm,
    fontFamily: fonts.serif,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 100,
    textAlignVertical: "top",
  },
  savingRow: { alignItems: "center", paddingVertical: spacing.sm },
});
