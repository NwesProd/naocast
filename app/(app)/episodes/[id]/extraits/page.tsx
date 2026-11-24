import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { ExtraitsClient } from "./ExtraitsClient";

// Module « Extraits » (catégorie Post-prod) : les passages de l'épisode à sortir en vidéos courtes, en tableau par
// statut. On les crée en sélectionnant dans le transcript ; le montage se fait hors de naocast.
export default async function ExtraitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clip?: string; session_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const { clip, session_id: sessionId } = await searchParams;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { userId: true } },
      clips: { orderBy: { createdAt: "asc" } },
      transcriptSegments: { orderBy: { startMs: "asc" } },
      shootMarkers: { orderBy: { atMs: "asc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "extraits", access.extraModules)) {
    return (
      <main className="p-8 w-full">
        <PlanLockedNotice moduleLabel="Extraits" />
      </main>
    );
  }

  return (
    <main className="p-8 w-full">
      <ExtraitsClient
        episodeId={id}
        paymentReturn={clip === "success" && sessionId ? sessionId : null}
        ownEditorEmail={episode.ownEditorEmail}
        clips={await Promise.all(
          episode.clips.map(async (c) => ({
            id: c.id,
            title: c.title,
            startMs: c.startMs,
            endMs: c.endMs,
            excerpt: c.excerpt,
            status: c.status,
            source: c.source,
            editor: c.editor,
            fileName: c.fileName,
            fileUrl: c.fileKey ? await getSignedDownloadUrl(c.fileKey) : null,
            publishedUrl: c.publishedUrl,
            description: c.description ?? "",
            publishDate: c.publishDate ? c.publishDate.toISOString().slice(0, 10) : "",
          }))
        )}
        transcript={episode.transcriptSegments.map((s) => ({
          id: s.id,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          words: Array.isArray(s.words) ? (s.words as { text: string; startMs: number; endMs: number }[]) : null,
        }))}
        markers={episode.shootMarkers.map((m) => m.atMs)}
      />
    </main>
  );
}
