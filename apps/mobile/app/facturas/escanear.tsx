// Scan supplier invoices: photos taken or chosen are the pages of one invoice; each PDF is an
// invoice of its own. Everything is compressed to fit the upload limit before it is shown.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Button } from "@/src/components/Button";
import { Screen } from "@/src/components/Screen";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { InvoiceFileTooLargeError, prepareInvoiceFile, type PickedFile, type PreparedFile } from "@/src/lib/invoice-image";
import { invoiceBatches, sendInvoices } from "@/src/lib/invoice-upload";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const MAX_PAGES = 10;
type Pdf = PreparedFile & { name: string };
const fromImage = (a: ImagePicker.ImagePickerAsset): PickedFile => ({ uri: a.uri, mimeType: a.mimeType, size: a.fileSize, width: a.width, height: a.height });

export default function ScanInvoiceScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [photos, setPhotos] = useState<PreparedFile[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [busy, setBusy] = useState(false);

  const prepareAll = async (files: PickedFile[]): Promise<PreparedFile[] | null> => {
    setBusy(true);
    try {
      const ready: PreparedFile[] = [];
      for (const file of files) ready.push(await prepareInvoiceFile(file));
      return ready;
    } catch (error) {
      showToast(error instanceof InvoiceFileTooLargeError ? t("invoice_file_too_large") : t("invoice_scan_prepare_failed"), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (files: PickedFile[]) => {
    if (photos.length + files.length > MAX_PAGES) {
      showToast(t("invoice_scan_too_many_pages"), "error");
      return;
    }
    const ready = await prepareAll(files);
    if (ready) setPhotos((current) => [...current, ...ready]);
  };

  const takePhoto = async () => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      showToast(t("cargar_permiso_camara"), "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled) await addPhotos(result.assets.map(fromImage));
  };

  const choosePhotos = async () => {
    if (!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) {
      showToast(t("cargar_permiso_galeria"), "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PAGES, quality: 0.9,
    });
    if (!result.canceled) await addPhotos(result.assets.map(fromImage));
  };

  const choosePdfs = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const ready = await prepareAll(result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? "application/pdf", size: a.size })));
    if (ready) setPdfs((current) => [...current, ...ready.map((file, i) => ({ ...file, name: result.assets[i]!.name }))]);
  };

  const send = async () => {
    setBusy(true);
    const batches = invoiceBatches(photos, pdfs);
    const result = await sendInvoices(batches);
    setBusy(false);
    if (result.failed.length === 0) {
      if (result.ids.length === 1) router.replace(`/facturas/${result.ids[0]}` as never);
      else router.back();
      return;
    }
    // Keep only what did not go, so the chef can send it again without scanning twice.
    const unsent = new Set(result.failed.flat().map((file) => file.uri));
    setPhotos((current) => current.filter((file) => unsent.has(file.uri)));
    setPdfs((current) => current.filter((file) => unsent.has(file.uri)));
    showToast(
      result.ids.length > 0 ? t("invoice_scan_partial", { failed: result.failed.length, total: batches.length }) : apiErrorMessage(result.error, t),
      "error",
    );
  };

  const nothing = photos.length === 0 && pdfs.length === 0;
  return (
    <Screen title={t("invoice_scan_title")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t("invoice_scan_hint")}</Text>
        <View style={styles.pages}>
          {photos.map((photo, i) => (
            <View key={photo.uri} style={styles.page}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              <Text style={styles.pageLabel}>{t("invoice_scan_page", { n: i + 1 })}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("invoice_scan_remove_page")}
                style={styles.remove}
                onPress={() => setPhotos((current) => current.filter((p) => p.uri !== photo.uri))}
              >
                <Ionicons name="close" size={14} color={colors.paper} />
              </Pressable>
            </View>
          ))}
        </View>
        {pdfs.map((pdf) => (
          <View key={pdf.uri} style={styles.pdf}>
            <Ionicons name="document-outline" size={18} color={colors.inkSoft} />
            <Text style={styles.pdfName} numberOfLines={1}>{pdf.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("invoice_scan_remove_page")}
              onPress={() => setPdfs((current) => current.filter((p) => p.uri !== pdf.uri))}
            >
              <Ionicons name="close" size={16} color={colors.mute} />
            </Pressable>
          </View>
        ))}
        <Button
          label={photos.length > 0 ? t("invoice_scan_add_page") : t("invoice_scan_camera")}
          iconLeft="camera-outline"
          variant={photos.length > 0 ? "secondary" : "primary"}
          disabled={busy}
          onPress={takePhoto}
        />
        <Button label={t("invoice_scan_gallery")} iconLeft="images-outline" variant="secondary" disabled={busy} onPress={choosePhotos} />
        <Button label={t("invoice_scan_pdf")} iconLeft="document-outline" variant="secondary" disabled={busy} onPress={choosePdfs} />
        <Button label={busy ? t("invoice_scan_sending") : t("invoice_scan_done")} disabled={busy || nothing} onPress={send} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hint: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  pages: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  page: { width: 96, alignItems: "center", gap: spacing.xs },
  thumb: { width: 96, height: 128, borderRadius: radii.sm, backgroundColor: colors.paperWarm },
  pageLabel: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  remove: { position: "absolute", top: 4, right: 4, backgroundColor: colors.ink, borderRadius: radii.pill, padding: 4 },
  pdf: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.edgeSoft, backgroundColor: colors.paperSoft,
  },
  pdfName: { flex: 1, fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
});
