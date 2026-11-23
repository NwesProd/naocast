// Constantes du flux RSS utilisables côté navigateur (sans accès à la base).

export const PLATFORMS = [
  { key: "apple", label: "Apple Podcasts", tool: "Apple Podcasts Connect", href: "https://podcastsconnect.apple.com" },
  { key: "spotify", label: "Spotify", tool: "Spotify for Creators", href: "https://creators.spotify.com" },
  { key: "deezer", label: "Deezer", tool: "Deezer for Creators", href: "https://podcasters.deezer.com" },
] as const;

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "es", label: "Espagnol" },
  { code: "de", label: "Allemand" },
  { code: "it", label: "Italien" },
  { code: "pt", label: "Portugais" },
];

// Catégories Apple Podcasts les plus courantes : la valeur va dans le flux, le libellé s'affiche.
export const CATEGORIES: { value: string; label: string }[] = [
  { value: "Arts", label: "Arts" },
  { value: "Business", label: "Entreprise" },
  { value: "Comedy", label: "Humour" },
  { value: "Education", label: "Éducation" },
  { value: "Fiction", label: "Fiction" },
  { value: "Government", label: "Gouvernement" },
  { value: "History", label: "Histoire" },
  { value: "Health & Fitness", label: "Santé et bien-être" },
  { value: "Kids & Family", label: "Enfants et famille" },
  { value: "Leisure", label: "Loisirs" },
  { value: "Music", label: "Musique" },
  { value: "News", label: "Actualités" },
  { value: "Religion & Spirituality", label: "Religion et spiritualité" },
  { value: "Science", label: "Sciences" },
  { value: "Society & Culture", label: "Société et culture" },
  { value: "Sports", label: "Sport" },
  { value: "Technology", label: "Technologie" },
  { value: "True Crime", label: "Faits divers" },
  { value: "TV & Film", label: "Télévision et cinéma" },
];
