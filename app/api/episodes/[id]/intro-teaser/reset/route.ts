import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { deleteObject } from "@/lib/storage";

// Module "Intro" : "Recommencer à zéro", retire tous les passages choisis et
// le teaser déjà construit, pour repartir d'une sélection vide. N'affecte pas
// une intro importée directement (introTeaserImportKey), qui n'a pas de lien
// avec le module.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const current = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });

  await prisma.$transaction([
    prisma.introSegment.deleteMany({ where: { episodeId } }),
    prisma.episode.update({
      where: { id: episodeId },
      data: {
        introTeaserKey: null,
        introTeaserValidated: false,
        // Ne retombe sur NONE que si MODULE était bien la source active,
        // une intro importée directement (IMPORT) n'a aucun lien avec le
        // module, réinitialiser celui-ci ne doit pas la désactiver.
        introTeaserChoice: current.introTeaserChoice === "MODULE" ? "NONE" : current.introTeaserChoice,
      },
    }),
  ]);

  // Le teaser compilé n'est plus référencé : on le supprime du stockage.
  if (current.introTeaserKey) await deleteObject(current.introTeaserKey).catch(() => {});

  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  return jsonResponse(episode);
}
