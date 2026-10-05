import { FaInstagram, FaLinkedin, FaYoutube } from "react-icons/fa6";
import type { IconType } from "react-icons";

// Réseaux proposés pour les liens d'un invité, liste fermée volontairement
// courte (les plus utiles en pratique) plutôt qu'un champ libre par lien.
export const SOCIAL_PLATFORMS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
];

// Vraies icônes de marque (react-icons/fa6) plutôt que des tracés dessinés à
// la main, netteté garantie à toutes les tailles, contrairement à des SVG
// approximatifs reconstruits de mémoire.
const SOCIAL_ICON_COMPONENTS: Record<string, IconType> = {
  instagram: FaInstagram,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
};
const SOCIAL_ICON_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
};

export function SocialBadge({ platformKey, size = "sm" }: { platformKey: string; size?: "sm" | "md" }) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === platformKey);
  const Icon = SOCIAL_ICON_COMPONENTS[platformKey];
  const dim = size === "sm" ? 20 : 24;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: dim, height: dim }}
      title={platform?.label || platformKey}
    >
      {Icon ? (
        <Icon size={dim} color={SOCIAL_ICON_COLORS[platformKey]} />
      ) : (
        <span className="h-full w-full flex items-center justify-center bg-white border border-border text-[10px] font-bold text-ink rounded-md">
          ?
        </span>
      )}
    </span>
  );
}

