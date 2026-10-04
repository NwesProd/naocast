// Module "Invités" : un invité est "pertinent" pour l'épisode quand l'un de ses
// mots clés (tags) apparaît dans le script (brouillon + idées d'angles). Le pool
// remonte ces invités en haut de liste.

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Racine grossière : retire le pluriel ("podcasts" et "podcast" se rejoignent).
function stem(word: string): string {
  return word.length > 3 ? word.replace(/(s|x)$/, "") : word;
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 20);
}

// Mots clés de `tags` présents dans `scriptText` (un tag de plusieurs mots doit y
// figurer en entier, mot pour mot, pluriels tolérés).
export function matchingTags(tags: string[], scriptText: string): string[] {
  const words = normalize(scriptText).split(" ").filter(Boolean).map(stem);
  if (words.length === 0) return [];
  const joined = ` ${words.join(" ")} `;
  return tags.filter((tag) => {
    const tagWords = normalize(tag).split(" ").filter(Boolean).map(stem);
    if (tagWords.length === 0) return false;
    return joined.includes(` ${tagWords.join(" ")} `);
  });
}
