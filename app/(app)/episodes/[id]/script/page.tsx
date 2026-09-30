import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserPlan } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { ScriptModuleClient } from "./ScriptModuleClient";

// Module "Script" (catégorie Prod) : idées d'angles/thèmes pour l'épisode,
// générées à partir de la bible du podcast et des invités déjà ajoutés.
export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { userId: true, bible: true } },
      episodeGuests: { include: { guest: { select: { name: true, mediaName: true } } }, orderBy: { order: "asc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const plan = await getUserPlan(session.user.id);
  if (!hasModuleAccess(plan, "script")) {
    return (
      <main className="p-8 max-w-4xl w-full">
        <PlanLockedNotice moduleLabel="Script" />
      </main>
    );
  }

  return (
    <main className="p-8 max-w-4xl w-full">
      <ScriptModuleClient
        episodeId={id}
        hasBible={!!episode.podcast.bible}
        guestNames={episode.episodeGuests.map((eg) => eg.guest.name)}
        initialIdeas={(episode.scriptAngleIdeas as string[] | null) ?? []}
        initialScriptDraft={episode.scriptDraft || ""}
        initialScriptValidated={episode.scriptValidated}
      />
    </main>
  );
}
