import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EpisodeWizard } from "./EpisodeWizard";

export default async function MontagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: true,
      rushes: { orderBy: { createdAt: "asc" } },
      cutMarkers: true,
      cutSuggestions: { orderBy: { startMs: "asc" } },
      _count: { select: { episodeGuests: true } },
    },
  });
  const pendingRequest = await prisma.editingRequest.findFirst({
    where: { episodeId: id, status: "PENDING_PAYMENT" },
    orderBy: { createdAt: "desc" },
    select: { notes: true },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");

  // Les informations de base (titre obligatoire) doivent être renseignées
  // avant d'accéder au tunnel de montage.
  if (!episode.title) redirect(`/episodes/${id}/new`);

  if (episode.status !== "DRAFT") redirect(`/episodes/${id}/review`);

  // BigInt (fileSizeBytes) n'est pas sérialisable tel quel vers un composant
  // client, et l'assistant ne s'en sert pas : on ne le transmet pas.
  const rushes = episode.rushes.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    originalFilename: r.originalFilename,
    durationSec: r.durationSec,
    selectedForEpisode: r.selectedForEpisode,
  }));

  return (
    <main className="p-8 max-w-4xl w-full">
      <EpisodeWizard
        episodeId={id}
        initialRushes={rushes}
        initialCutMarkers={episode.cutMarkers}
        podcastLogo={{
          hasLogo: !!episode.podcast.logoKey,
          hasIntro: !!episode.podcast.introKey,
          hasOutro: !!episode.podcast.outroKey,
        }}
        initialLogoSettings={{
          logoEnabled: episode.logoEnabled,
          logoOnIntro: episode.logoOnIntro,
          logoOnOutro: episode.logoOnOutro,
          logoPosition: episode.logoPosition,
        }}
        initialEditorChoice={episode.editorChoice}
        initialMontageValidatedExternally={episode.montageValidatedExternally}
        initialEditorNotes={pendingRequest?.notes ?? ""}
        initialCameraSetup={episode.cameraSetup}
        initialExpectedSpeakerCount={episode.expectedSpeakerCount}
        initialGuestCount={episode._count.episodeGuests}
        initialAutocut={{ enabled: episode.autocutEnabled, silenceMs: episode.autocutSilenceMs }}
        initialCutSuggestions={episode.cutSuggestions.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, text: s.text, reason: s.reason }))}
        initialIntroTeaser={{
          validated: episode.introTeaserValidated,
          choice: episode.introTeaserChoice,
          hasImport: !!episode.introTeaserImportKey,
        }}
        initialGenerics={{
          introSource: episode.introSource,
          hasEpisodeIntro: !!episode.introKey,
          introCreationMode: episode.introCreationMode,
          introCustomMode: episode.introCustomMode,
          introCustomDescription: episode.introCustomDescription || "",
          outroSource: episode.outroSource,
          hasEpisodeOutro: !!episode.outroKey,
          outroCreationMode: episode.outroCreationMode,
          outroCustomMode: episode.outroCustomMode,
          outroCustomDescription: episode.outroCustomDescription || "",
        }}
      />
    </main>
  );
}
