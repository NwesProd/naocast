import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Point d'entrée unique "faire appel à un monteur", accessible depuis le
// formulaire ou après la validation/relecture, pas de distinction de
// traitement entre les deux cas (cf. brief). Le flux exact (devis manuel vs
// paiement en ligne) n'est pas tranché : on se contente ici d'enregistrer la
// demande, l'UI affiche le tarif existant (380€ solo / 330€ pack de 5) et une
// prise de contact.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "HUMAN_EDITOR_REQUESTED", humanEditorRequestedAt: new Date() },
  });
  return NextResponse.json(episode);
}
