import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { ScriptModuleClient } from "./ScriptModuleClient";

// Module "Script" (catégorie Prod) : brouillon et validation du script de l'épisode.
export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { userId: true } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "script", access.extraModules)) {
    return (
      <main className="p-8 w-full">
        <PlanLockedNotice moduleLabel="Script" />
      </main>
    );
  }

  return (
    <main className="p-8 w-full">
      <ScriptModuleClient
        episodeId={id}
        initialScriptDraft={episode.scriptDraft || ""}
        initialScriptValidated={episode.scriptValidated}
      />
    </main>
  );
}
