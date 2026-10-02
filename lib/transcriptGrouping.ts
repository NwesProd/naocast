// Regroupe les phrases consécutives d'un même locuteur en une seule prise de
// parole (un paragraphe, avec le nom affiché une seule fois), comme un
// dialogue : plus lisible à l'écran et dans l'export .txt que le même nom
// répété devant chaque phrase. Le découpage fin reste possible : l'éditeur
// de coupes travaille toujours mot par mot sur les phrases d'origine.
//
// Les phrases sans locuteur connu (pas de diarization) ne sont jamais
// fusionnées entre elles : rien ne dit qu'elles viennent de la même personne,
// ça donnerait un unique bloc géant sans aucune structure.
export interface SpeakerTurn<T> {
  speaker: string | null;
  startMs: number;
  segments: T[];
}

export function groupBySpeaker<T extends { speaker: string | null; startMs: number }>(segments: T[]): SpeakerTurn<T>[] {
  const turns: SpeakerTurn<T>[] = [];
  for (const seg of segments) {
    const last = turns[turns.length - 1];
    if (last && seg.speaker !== null && last.speaker === seg.speaker) {
      last.segments.push(seg);
    } else {
      turns.push({ speaker: seg.speaker, startMs: seg.startMs, segments: [seg] });
    }
  }
  return turns;
}
