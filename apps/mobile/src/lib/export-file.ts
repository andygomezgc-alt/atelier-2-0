// Descarga un archivo protegido del server (con Authorization) al cache y abre
// el share-sheet del sistema. Mismo patrón que handleSharePdf de la ficha de
// receta, extraído para reusar en las exportaciones (recetario PDF, banco
// PDF/CSV). Devuelve true si se descargó bien (aunque el share no esté
// disponible), false si falló la descarga.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "@/src/lib/secure-storage";
import { TOKEN_KEY } from "@/src/api/client";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export async function downloadAndShare(
  path: string,
  filename: string,
  mimeType: string,
): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  const fileUri = `${FileSystem.cacheDirectory}${encodeURIComponent(filename)}`;
  const dl = await FileSystem.downloadAsync(`${BASE}${path}`, fileUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (dl.status !== 200) return false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dl.uri, { mimeType });
  }
  return true;
}

// Limpia solo los caracteres ilegales en filesystems mainstream
// (Windows/macOS/Linux). Preserva acentos, ñ, espacios, etc. — el resultado
// es legible cuando el chef comparte el PDF desde mobile.
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "menu";
}
