import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFullEpisode, episodeLabel } from "@/lib/episode";
import { TranscriptModuleClient } from "./TranscriptModuleClient";

// Module "Transcript" : affiche le transcript déjà généré dans le tunnel de
// montage (étape "Cut"), ou permet de le générer directement depuis ici si
// ça n'a pas encore été fait, même route /transcript que le tunnel, pas de
// logique dupliquée, juste une autre porte d'entrée.
export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await getFullEpisode(id);
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const rushes = episode.rushes
    .filter((r) => r.selectedForEpisode && r.status === "READY")
    .map((r) => ({ id: r.id, originalFilename: r.originalFilename, type: r.type }));

  return (
    <main className="p-8 max-w-4xl w-full">
      <TranscriptModuleClient
        episodeId={id}
        rushes={rushes}
        initialTranscript={episode.transcriptSegments.map((s) => ({
          id: s.id,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          speaker: s.speaker,
        }))}
        initialSpeakers={episode.speakers.map((s) => ({ id: s.id, label: s.label, displayName: s.displayName }))}
        initialExpectedSpeakerCount={episode.expectedSpeakerCount}
        episodeLabel={episodeLabel(episode)}
      />
    </main>
  );
}
