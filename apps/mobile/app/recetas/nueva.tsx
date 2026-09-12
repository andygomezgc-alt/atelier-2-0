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
//   4. Cuando la cola está vacía, enviamos la receta y los productos pendientes
//      en una transacción del servidor. Los reintentos conservan el envío original.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { useAuth, getCurrentIdentity } from "@/src/hooks/useAuth";
import { createRecipe, patchRecipe } from "@/src/api/recipes";
import {
  listProducts,
  matchProducts,
  patchProduct,
  getProduct,
} from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { recipeIngredientPayload } from "@/src/lib/recipe-editor";
import { consumeRecipeDraft } from "@/src/lib/recipe-draft";
import { recipeDraftKey, loadRecipeDraft, saveRecipeDraft, clearRecipeDraft } from "@/src/lib/recipe-autosave";
import {
  can,
  parseIngredient,
  resolvePezzaturaMode,
} from "@atelier/shared";
import type {
  ProductCategory,
  ProductListItem,
  RecipeIngredientInput,
  CreateRecipeRequest,
} from "@atelier/shared";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

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
  const kb = useKeyboardHeight();

  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState<IngredientValue[]>([
    { rawText: "", productId: null },
  ]);
  const [method, setMethod] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [portionsText, setPortionsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`);
  const saveRequestRef = useRef<CreateRecipeRequest | undefined>(undefined);
  const saveFingerprintRef = useRef<string | undefined>(undefined);
  const [incomingDraft] = useState(consumeRecipeDraft);
  const [draftReady, setDraftReady] = useState(false);
  const autosaveKey = useRef<string | null>(null);
  const savedRef = useRef(false);
  const storageWarningShown = useRef(false);

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
    const draft = incomingDraft;
    if (!draft) return;
    setTitle(draft.title);
    setPortionsText(draft.portions == null ? "" : String(draft.portions));
    // Preferencia de fuente:
    //  1. draft.recipeIngredients (Fase 3): viene del upload server con
    //     productIds ya pre-set para matches exactos. Es la mejor info.
    //  2. draft.contentJson.ingredients (legacy): array de strings — los
    //     convertimos a IngredientValue sin productId; el save-flow va a
    //     intentar matchearlos.
    let fromDraft: IngredientValue[];
    if (draft.recipeIngredients && draft.recipeIngredients.length > 0) {
      fromDraft = draft.recipeIngredients.map((r) => ({
        ...r,
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

  useEffect(() => {
    let active = true;
    const identity = getCurrentIdentity();
    if (!identity) { setDraftReady(true); return; }
    const key = recipeDraftKey(identity, incomingDraft?.editId ?? null);
    void (async () => {
      try {
        const stored = await loadRecipeDraft(key);
        if (!active) return;
        if (stored) {
          const recover = await new Promise<boolean>((resolve) => Alert.alert(
            t("recipe_draft_recover_title"), t("recipe_draft_recover_body"),
            [
              { text: t("recipe_draft_discard"), style: "destructive", onPress: () => resolve(false) },
              { text: t("recipe_draft_recover"), onPress: () => resolve(true) },
            ], { cancelable: false },
          ));
          if (!active) return;
          if (recover) {
            setTitle(stored.title); setIngredients(stored.ingredients); setMethod(stored.method);
            setNotes(stored.notes); setPortionsText(stored.portionsText);
            setEditId(stored.editId); setSourceConversationId(stored.sourceConversationId);
            if (stored.clientRequestId) setClientRequestId(stored.clientRequestId);
            saveRequestRef.current = stored.saveRequest;
            saveFingerprintRef.current = stored.saveFingerprint;
          } else {
            await clearRecipeDraft(key);
          }
        }
        if (active) autosaveKey.current = key;
      } catch {
        if (active) showToast(t("recipe_draft_storage_error"));
      } finally {
        if (active) setDraftReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady || !autosaveKey.current || savedRef.current) return;
    // Persist raw text as well as product links and overrides, including incomplete edits.
    const isEmpty = !title && !notes && !portionsText && !ingredients.some(i => i.rawText) && !method.some(Boolean);
    void (isEmpty ? clearRecipeDraft(autosaveKey.current) : saveRecipeDraft(autosaveKey.current, editorSnapshot()))
      .catch(() => {
        if (!storageWarningShown.current) {
          storageWarningShown.current = true;
          showToast(t("recipe_draft_storage_error"));
        }
      });
  }, [draftReady, title, ingredients, method, notes, portionsText, editId, sourceConversationId, clientRequestId]);

  function formFingerprint() {
    return JSON.stringify({ title, ingredients, method, notes, portionsText, editId, sourceConversationId });
  }

  function editorSnapshot() {
    return { title, ingredients, method, notes, portionsText, editId, sourceConversationId, clientRequestId,
      saveRequest: saveRequestRef.current, saveFingerprint: saveFingerprintRef.current };
  }

  async function submitRecipe(payload: CreateRecipeRequest) {
    if (editId) await patchRecipe(editId, payload);
    else await createRecipe(payload);
    await finishDraft();
    showToast(t("toast_recipe_saved"));
    if (editId) router.replace({ pathname: "/recetas/[id]", params: { id: editId } });
    else router.replace("/(tabs)/recetas");
  }

  async function finishDraft() {
    savedRef.current = true;
    if (autosaveKey.current) {
      // A local cleanup failure must not turn a successful server save into a retry.
      await clearRecipeDraft(autosaveKey.current).catch(() => showToast(t("recipe_draft_cleanup_error")));
    }
  }

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_recipe");

  async function handleSave() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const portions = portionsText.trim();
    if (portions && (!/^\d+$/.test(portions) || Number(portions) < 1 || Number(portions) > 1000)) {
      showToast(t("recipe_portions_invalid"));
      return;
    }
    Keyboard.dismiss();
    setSaving(true);

    try {
      if (saveRequestRef.current && saveFingerprintRef.current === formFingerprint()) {
        await submitRecipe(saveRequestRef.current);
        setSaving(false);
        return;
      }
      // Snapshot de ingredientes con rawText limpio (descartamos los vacíos).
      // pesoCalculoG (Entrega A.5, Fase 7) viaja en el snapshot para que
      // el server lo persista en RecipeIngredient cuando finalize() construye
      // el payload del create/patch.
      const working = ingredients
        .map((i) => ({
          ...i,
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
      showToast(apiErrorMessage(err, t));
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
      // Product drafts are created inside the recipe transaction on the server.
      for (const idx of draftIndices) workingIngredients[idx]!.createProductDraft = true;

      const recipeIngredients: RecipeIngredientInput[] = workingIngredients.map(recipeIngredientPayload);

      const payload = {
        title: title.trim(),
        portions: portionsText.trim() ? Number(portionsText) : null,
        contentJson: {
          ingredients: workingIngredients.map((i) => i.rawText),
          method: method.map((m) => m.trim()).filter(Boolean),
          notes: notes.trim(),
        },
        recipeIngredients,
      };

      const request: CreateRecipeRequest = { ...payload, clientRequestId,
        ...(sourceConversationId ? { sourceConversationId } : {}),
      };
      saveRequestRef.current = request;
      saveFingerprintRef.current = formFingerprint();
      if (autosaveKey.current) await saveRecipeDraft(autosaveKey.current, editorSnapshot())
        .catch(() => showToast(t("recipe_draft_storage_error")));
      await submitRecipe(request);
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    } finally {
      flowStateRef.current = null;
      setSaving(false);
    }
  }

  if (!draftReady) {
    return <Screen title={t("recetas_nueva_title")} back onBack={() => router.back()}><ActivityIndicator /></Screen>;
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
      <ScrollView
        pointerEvents={saving ? "none" : "auto"}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + kb }]}
        keyboardShouldPersistTaps="handled"
      >
          <View>
            <Eyebrow>{t("recetas_form_title_label")}</Eyebrow>
            <TextInput
              editable={!saving}
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
            <Eyebrow>{t("cost_card_edit_portions_title")}</Eyebrow>
            <TextInput
              editable={!saving}
              value={portionsText}
              onChangeText={setPortionsText}
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel={t("cost_card_edit_portions_title")}
              placeholder={t("cost_card_edit_portions_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.titleInput}
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
                    editable={!saving}
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
                  editable={!saving}
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
              editable={!saving}
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
