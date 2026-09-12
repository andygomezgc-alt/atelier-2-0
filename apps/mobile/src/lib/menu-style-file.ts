type PickedImage = { uri: string; mimeType?: string | null; fileName?: string | null };

export function menuStyleImageMime(asset: PickedImage): string {
  const declared = asset.mimeType?.toLowerCase().split(";")[0]?.trim();
  if (declared && declared !== "application/octet-stream") {
    return declared === "image/jpg" ? "image/jpeg" : declared;
  }
  const imageTypes: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", bmp: "image/bmp", gif: "image/gif",
  };
  // The picker can convert the file while retaining its original filename.
  for (const source of [asset.uri, asset.fileName ?? ""]) {
    const extension = source.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
    if (imageTypes[extension ?? ""]) return imageTypes[extension!]!;
  }
  return "image/jpeg";
}
