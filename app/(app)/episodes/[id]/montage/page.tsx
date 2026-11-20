import { redirect } from "next/navigation";
import path from "path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { MontageClient } from "./MontageClient";

// Module « Montage » : l'épisode se monte hors de naocast (monteur naocast, monteur personnel
// ou Claude). Ici : choisir la voie, importer les rushs, déposer la vidéo finale, la visionner,
// la valider puis la télécharger (vidéo, et audio extrait de la vidéo).
export default async function MontagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editing?: string; session_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const { editing, session_id: sessionId } = await searchParams;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { userId: true } },
      rushes: { orderBy: { createdAt: "asc" } },
      exports: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  // Les informations de base (titre obligatoire) doivent être renseignées avant le montage.
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const paidRequest = await prisma.editingRequest.findFirst({ where: { episodeId: id, status: "PAID" }, select: { id: true } });
  const pendingRequest = await prisma.editingRequest.findFirst({
    where: { episodeId: id, status: "PENDING_PAYMENT" },
    orderBy: { createdAt: "desc" },
    select: { notes: true },
  });

  // Nom de fichier au téléchargement : « S1E4 Titre - video.mp4 », caractères interdits remplacés.
  const code = [episode.season != null ? `S${episode.season}` : null, episode.episodeNumber != null ? `E${episode.episodeNumber}` : null]
    .filter(Boolean)
    .join("");
  const prefix = [code, (episode.title || "Sans titre").replace(/[\\/:*?"<>|]/g, " ").trim()].filter(Boolean).join(" ");

  const video = episode.exports.find((e) => e.type === "VIDEO");
  const audio = episode.exports.find((e) => e.type === "AUDIO");
  const fileInfo = async (asset: typeof video, label: string, fallbackExt: string) => {
    if (!asset) return null;
    const name = `${prefix} - ${label}${path.extname(asset.storageKey) || fallbackExt}`;
    return { url: await getSignedDownloadUrl(asset.storageKey), downloadUrl: await getSignedDownloadUrl(asset.storageKey, 3600, name) };
  };

  return (
    <main className="p-8 w-full">
      <MontageClient
        episodeId={id}
        status={episode.status}
        editorChoice={episode.editorChoice}
        ownEditorEmail={episode.ownEditorEmail}
        initialNotes={pendingRequest?.notes ?? ""}
        editingPaid={!!paidRequest}
        paymentReturn={editing === "success" && sessionId ? sessionId : null}
        rushes={episode.rushes.map((r) => ({
          id: r.id,
          filename: r.originalFilename || r.externalRef || "Fichier",
          durationSec: r.durationSec,
          sizeBytes: r.fileSizeBytes != null ? Number(r.fileSizeBytes) : null,
          ready: r.status === "READY",
        }))}
        video={await fileInfo(video, "video", ".mp4")}
        audio={await fileInfo(audio, "audio", ".mp3")}
      />
    </main>
  );
}
