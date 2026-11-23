// Constantes du module Extraits utilisables côté navigateur (lib/clips.ts dépend du serveur).
export const CLIP_STATUSES = [
  { key: "IDEA", label: "Idées" },
  { key: "TO_EDIT", label: "À monter" },
  { key: "READY", label: "Prêts" },
  { key: "PUBLISHED", label: "Publiés" },
] as const;

// Tarif affiché du montage d'un extrait par un monteur naocast (à garder aligné avec le prix Stripe).
export const CLIP_PRICE_LABEL = "60 € HT";
