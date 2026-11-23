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
  { value: "Business", label: "Entreprise (sans sous-catégorie)" },
  { value: "Business/Entrepreneurship", label: "Entreprise : entrepreneuriat" },
  { value: "Business/Marketing", label: "Entreprise : marketing" },
  { value: "Business/Careers", label: "Entreprise : carrières" },
  { value: "Business/Investing", label: "Entreprise : investissement" },
  { value: "Business/Management", label: "Entreprise : management" },
  { value: "Business/Non-Profit", label: "Entreprise : associations" },
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

// Marche à suivre pour déclarer le flux chez chaque plateforme (les intitulés exacts peuvent évoluer chez elles).
export const PLATFORM_GUIDES: Record<"apple" | "spotify" | "deezer", { steps: string[]; delay: string }> = {
  apple: {
    steps: [
      "Connecte-toi à Apple Podcasts Connect avec un compte Apple (gratuit, tu peux en créer un sur la page de connexion).",
      "Ajoute un nouveau programme et choisis l'option qui permet de le déclarer avec un flux RSS.",
      "Colle l'adresse du flux de naocast et valide.",
      "Apple contrôle le flux, puis le publie.",
    ],
    delay: "Compte en général quelques jours avant que le podcast apparaisse.",
  },
  spotify: {
    steps: [
      "Connecte-toi à Spotify for Creators avec un compte Spotify (gratuit).",
      "Choisis d'ajouter un podcast existant et colle l'adresse du flux de naocast.",
      "Spotify envoie un code de vérification à l'e-mail du propriétaire, celui renseigné dans les informations du podcast.",
      "Saisis le code, puis termine la configuration.",
    ],
    delay: "Le podcast apparaît le plus souvent en quelques heures.",
  },
  deezer: {
    steps: [
      "Connecte-toi à Deezer for Creators (compte Deezer gratuit).",
      "Ajoute un podcast et colle l'adresse du flux de naocast.",
      "Deezer lit le flux et le rend disponible.",
    ],
    delay: "Compte en général de quelques heures à quelques jours.",
  },
};
