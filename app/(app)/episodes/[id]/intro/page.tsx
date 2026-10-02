import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { episodeLabel } from "@/lib/episode";
import { ExternalValidation } from "@/components/ExternalValidation";
import { IntroClient } from "./IntroClient";

// Module "Intro" (étape 7 du tunnel, à part du reste) : accessible quel que
// soit le statut de l'épisode (DRAFT en plein tunnel, ou plus tard en
// relecture), contrairement à /montage et /review qui redirigent selon le
// statut, "faire une pause" pour construire le teaser doit marcher à
// n'importe quel moment du parcours.
export default async function IntroPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: true,
      transcriptSegments: { orderBy: { startMs: "asc" } },
      introSegments: { orderBy: { order: "asc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  // Pas de paramètre ajouté après coup à l'URL signée (cassait sa signature
  // R2/S3, cf. app/api/episodes/[id]/intro-teaser/route.ts) : inutile de
  // toute façon, la signature change déjà à chaque appel de
  // getSignedDownloadUrl.
  const teaserUrl = episode.introTeaserKey ? await getSignedDownloadUrl(episode.introTeaserKey) : null;

  return (
    <main className="p-8 max-w-5xl w-full">
      <IntroClient
        episodeId={id}
        transcript={episode.transcriptSegments.map((s) => ({
          id: s.id,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          words: s.words as { text: string; startMs: number; endMs: number }[] | null,
        }))}
        initialIntroSegments={episode.introSegments.map((s) => ({
          id: s.id,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          removedRanges: (s.removedRanges as { startMs: number; endMs: number }[] | null) ?? [],
        }))}
        initialTeaserUrl={teaserUrl}
        initialValidated={episode.introTeaserValidated}
        episodeLabel={episodeLabel(episode)}
      />
      <ExternalValidation episodeId={id} field="introValidatedExternally" wording={{ ask: "Intro gérée en dehors de naocast ?", validated: "Intro validée hors naocast.", button: "Valider l'intro hors naocast" }} initialValidated={episode.introValidatedExternally} />
    </main>
  );
}
