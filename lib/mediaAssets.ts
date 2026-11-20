// Bibliothèque de médias du podcast : types d'éléments et formats acceptés.
export const MEDIA_ASSET_TYPES = [
  { key: "logo", label: "Logo" },
  { key: "jingle", label: "Jingle" },
  { key: "transition", label: "Transition" },
  { key: "son", label: "Son" },
  { key: "musique", label: "Musique" },
  { key: "autre", label: "Autre" },
] as const;

export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number]["key"];

export const MEDIA_ASSET_TYPE_KEYS = MEDIA_ASSET_TYPES.map((t) => t.key) as [MediaAssetType, ...MediaAssetType[]];

export function mediaAssetTypeLabel(type: string): string {
  return MEDIA_ASSET_TYPES.find((t) => t.key === type)?.label ?? type;
}

// Formats acceptés dans la bibliothèque : audio, vidéo et images (logos).
export function previewKind(mimeType: string): "audio" | "video" | "image" | null {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}
