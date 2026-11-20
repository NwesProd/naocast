import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFullEpisode, episodeLabel } from "@/lib/episode";
import { FINAL_SOURCE_ID } from "@/lib/transcriptSource";
import { TranscriptModuleClient } from "./TranscriptModuleClient";

// Module "Transcript" : affiche le transcript de l'épisode, ou le génère à partir des rushs
// importés ou de l'épisode final déposé dans le module Montage.
export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await getFullEpisode(id);
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  // Sources possibles : les rushs importés et/ou l'épisode final déposé (seul disponible une fois le montage validé).
  const rushes = [
    ...episode.rushes.filter((r) => r.status === "READY").map((r) => ({ id: r.id, originalFilename: r.originalFilename, type: r.type })),
    ...(episode.exports.some((e) => e.type === "VIDEO" || e.type === "AUDIO")
      ? [{ id: FINAL_SOURCE_ID, originalFilename: "Épisode final", type: "FINAL" }]
      : []),
  ];

  return (
    <main className="p-8 w-full">
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
