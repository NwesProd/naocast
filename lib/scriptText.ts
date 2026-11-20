// Script d'un épisode (Episode.scriptDraft) : stocké en HTML par l'éditeur du module Script
// (titres, gras, italique, souligné). Les anciens scripts et ceux écrits par le connecteur
// Claude sont en texte brut / Markdown : on les convertit à l'ouverture et à l'enregistrement.

const HTML_RE = /^\s*<(p|h1|h2|h3|ul|ol|blockquote)[\s>]/i;

export function isScriptHtml(value: string): boolean {
  return HTML_RE.test(value);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Mise en forme dans une ligne : **gras**, *italique*, <u>souligné</u>.
function inlineToHtml(line: string): string {
  return escapeHtml(line)
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
}

// Texte brut / Markdown (# titre, ## sous-titre, **gras**, *italique*, <u>souligné</u>) vers HTML.
// Un script déjà en HTML est renvoyé tel quel.
export function scriptToHtml(stored: string): string {
  if (!stored.trim()) return "";
  if (isScriptHtml(stored)) return stored;

  const blocks: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineToHtml).join("<br>")}</p>`);
    paragraph = [];
  };
  for (const raw of stored.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineToHtml(heading[2])}</h${level}>`);
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks.join("");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// HTML du script vers du Markdown lisible (connecteur Claude, repérage des mots clés des
// invités). Un script en texte brut est renvoyé tel quel.
export function scriptToPlainText(stored: string | null): string {
  if (!stored) return "";
  if (!isScriptHtml(stored)) return stored;
  const text = stored
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<(?!\/?u>)[^>]+>/g, "");
  return decodeEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}
