import { requireUserId } from "@/lib/authz";
import { getEpisodeUsage } from "@/lib/entitlements";
import { jsonResponse } from "@/lib/json";

// Utilisé par la carte forfait de la sidebar (cf. components/SidebarNav.tsx)
// pour se rafraîchir sans dépendre d'un re-rendu du layout parent (persistant
// entre navigations côté client, cf. commentaire sur EPISODE_UPDATED_EVENT) :
// la valeur passée en prop au premier rendu sert de valeur initiale, celle-ci
// la met à jour après toute création/suppression d'épisode.
export async function GET() {
  const userId = await requireUserId();
  const usage = await getEpisodeUsage(userId);
  return jsonResponse(usage);
}
