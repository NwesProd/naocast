// Attribution manuelle d'un locuteur quand la reconnaissance automatique n'a
// rien détecté : choisir qui parle sur une prise de parole l'applique aussi aux
// suivantes, jusqu'au prochain passage déjà attribué à quelqu'un d'autre. On ne
// marque ainsi que les changements de voix, pas chacune des centaines de phrases.
// Partagé entre le serveur (écriture en base) et le client (affichage immédiat).
export function segmentsToReassign(segments: { id: string; speaker: string | null }[], segmentId: string): string[] {
  const start = segments.findIndex((s) => s.id === segmentId);
  if (start === -1) return [];
  const previous = segments[start].speaker;
  const ids: string[] = [];
  for (let i = start; i < segments.length && segments[i].speaker === previous; i++) ids.push(segments[i].id);
  return ids;
}
