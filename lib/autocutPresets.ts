// Réglages "Couper les silences" de l'étape Cut du tunnel de montage. Fichier
// sans dépendance serveur : importé par l'interface ET par le pipeline.
//
// - silenceMs : durée de silence à partir de laquelle on coupe (silencedetect) ;
// - keepMs : respiration conservée au milieu de chaque silence coupé, pour que
//   le montage reste naturel au lieu d'enchaîner les mots à la seconde près.
export interface AutocutPreset {
  key: "blancs" | "dynamique" | "ultra";
  label: string;
  silenceMs: number;
  keepMs: number;
  description: string;
}

export const AUTOCUT_PRESETS: AutocutPreset[] = [
  {
    key: "blancs",
    label: "Couper les blancs",
    silenceMs: 3000,
    keepMs: 400,
    description: "Retire les silences de plus de 3 secondes. Le rythme de la conversation est préservé.",
  },
  {
    key: "dynamique",
    label: "Dynamique",
    silenceMs: 1000,
    keepMs: 250,
    description: "Retire les silences de plus d'1 seconde. Un montage plus nerveux, sans être haché.",
  },
  {
    key: "ultra",
    label: "Ultra dynamique",
    silenceMs: 500,
    keepMs: 120,
    description:
      "Retire toute pause de plus d'une demi-seconde et n'en garde qu'un souffle : les phrases s'enchaînent sans temps mort.",
  },
];

// Respiration conservée pour un seuil donné (aussi pour d'anciens épisodes
// dont le seuil n'est pas exactement celui d'un réglage).
export function keepMsForThreshold(silenceMs: number): number {
  if (silenceMs >= 3000) return 400;
  if (silenceMs >= 1000) return 250;
  return 120;
}

// Réglage correspondant au seuil enregistré (le plus proche).
export function presetForThreshold(silenceMs: number | null): AutocutPreset {
  const ms = silenceMs ?? 3000;
  return AUTOCUT_PRESETS.reduce((best, p) => (Math.abs(p.silenceMs - ms) < Math.abs(best.silenceMs - ms) ? p : best));
}
