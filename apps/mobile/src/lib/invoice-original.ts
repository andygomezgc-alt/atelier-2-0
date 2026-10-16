// A PDF original is private: it is downloaded with the session token into the app cache and
// handed to the system share sheet, which can view or save it. The cached copy is overwritten
// on the next open and cleared by the OS; deleting it right after sharing breaks Android viewers.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { invoicePageSource } from "@/src/api/invoices";

export async function openInvoicePdf(invoiceId: string): Promise<void> {
  const { uri, headers } = await invoicePageSource(invoiceId, 0);
  const download = await FileSystem.downloadAsync(uri, `${FileSystem.cacheDirectory}invoice-${invoiceId}.pdf`, { headers });
  if (download.status !== 200) throw new Error(`invoice_pdf_http_${download.status}`);
  await Sharing.shareAsync(download.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
