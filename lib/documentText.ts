// Documents de la bible du podcast : extension acceptée et extraction du texte,
// pour que l'aperçu (hors PDF) et le connecteur Claude puissent lire le contenu.
export const BIBLE_DOC_EXTENSIONS = ["pdf", "txt", "md", "docx"] as const;
export const BIBLE_DOC_MAX_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

export function documentExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedBibleDocument(filename: string): boolean {
  return (BIBLE_DOC_EXTENSIONS as readonly string[]).includes(documentExtension(filename));
}

// Renvoie null quand le texte est illisible (PDF scanné, fichier abîmé) : le
// fichier reste utilisable, seul son contenu n'est pas exposé en texte.
export async function extractDocumentText(buffer: Buffer, filename: string): Promise<string | null> {
  try {
    const ext = documentExtension(filename);
    let text = "";
    if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf8");
    } else if (ext === "pdf") {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(buffer), { mergePages: true });
      text = result.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      return null;
    }
    text = text.trim();
    return text ? text.slice(0, MAX_TEXT_CHARS) : null;
  } catch {
    return null;
  }
}
