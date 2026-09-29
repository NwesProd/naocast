import { redirect } from "next/navigation";
import path from "path";
import { auth } from "@/auth";
import { getFullEpisode } from "@/lib/episode";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { TranscriptWord } from "@/components/TranscriptCutEditor";
import { ReviewClient } from "./ReviewClient";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await getFullEpisode(id);
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (episode.status === "DRAFT") redirect(`/episodes/${id}/new`);

  // Le plus récent d'abord : storageKey est un chemin FIXE
  // (episodes/{id}/final.mp4), réécrit à chaque rendu plutôt que versionné,
  // sans tri explicite, .find() pouvait remonter un export plus ancien.
  const sortedExports = [...episode.exports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const videoExport = sortedExports.find((e) => e.type === "VIDEO");
  const audioExport = sortedExports.find((e) => e.type === "AUDIO");

  // Cache-bust avec un paramètre `v` : storageKey étant fixe, l'URL serait
  // sinon identique d'un rendu à l'autre et le <video> pouvait réafficher une
  // version mise en cache (donc pas encore recoupée) malgré un fichier bien
  // à jour côté serveur, constaté en conditions réelles après "Relancer le
  // rendu". `&`/`?` selon que l'URL signée a déjà des paramètres (mode S3).
  function withCacheBust(url: string, version: number): string {
    return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
  }
  const videoUrl = videoExport
    ? withCacheBust(await getSignedDownloadUrl(videoExport.storageKey), videoExport.createdAt.getTime())
    : null;
  const audioUrl = audioExport
    ? withCacheBust(await getSignedDownloadUrl(audioExport.storageKey), audioExport.createdAt.getTime())
    : null;

  // Nom de fichier au téléchargement : "S1E4 Titre de l'épisode - video.mp4"
  // plutôt que le nom technique en base (ex. "final.mp4", identique pour tous
  // les épisodes), S/E omis s'ils ne sont pas renseignés. Caractères
  // interdits dans un nom de fichier (Windows notamment) remplacés par un
  // espace, jamais laissés tels quels.
  const seasonEpisodeLabel = [
    episode.season != null ? `S${episode.season}` : null,
    episode.episodeNumber != null ? `E${episode.episodeNumber}` : null,
  ]
    .filter(Boolean)
    .join("");
  const sanitizedTitle = (episode.title || "Sans titre").replace(/[\\/:*?"<>|]/g, " ").trim();
  const downloadNamePrefix = [seasonEpisodeLabel, sanitizedTitle].filter(Boolean).join(" ");
  const videoDownloadName = videoExport
    ? `${downloadNamePrefix} - video${path.extname(videoExport.storageKey) || ".mp4"}`
    : null;
  const audioDownloadName = audioExport
    ? `${downloadNamePrefix} - audio${path.extname(audioExport.storageKey) || ".mp3"}`
    : null;

  return (
    <main className="p-8 max-w-5xl w-full">
      <ReviewClient
        episodeId={id}
        status={episode.status}
        jobs={episode.jobs}
        transcript={episode.transcriptSegments.map((s) => ({ ...s, words: s.words as TranscriptWord[] | null }))}
        speakers={episode.speakers}
        cutMarkers={episode.cutMarkers}
        rushes={episode.rushes
          .filter((r) => r.selectedForEpisode && r.status === "READY")
          .map((r) => ({ id: r.id, originalFilename: r.originalFilename, type: r.type }))}
        videoUrl={videoUrl}
        audioUrl={audioUrl}
        videoDownloadName={videoDownloadName}
        audioDownloadName={audioDownloadName}
        editorChoice={episode.editorChoice}
        ownEditorEmail={episode.ownEditorEmail}
        initialExpectedSpeakerCount={episode.expectedSpeakerCount}
      />
    </main>
  );
}
