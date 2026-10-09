import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getEpisodeUsage } from "@/lib/entitlements";
import { SidebarNav } from "@/components/SidebarNav";
import { FeedbackWidget } from "@/components/FeedbackWidget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  const podcast = session?.user
    ? await prisma.podcast.findUnique({ where: { userId: session.user.id }, select: { title: true, coverKey: true } })
    : null;
  const user = session?.user
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true, extraModules: true } })
    : null;
  const usage = session?.user ? await getEpisodeUsage(session.user.id) : null;
  const podcastHeader = podcast
    ? { title: podcast.title, coverUrl: podcast.coverKey ? await getSignedDownloadUrl(podcast.coverKey) : null }
    : null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-peach-sidebar flex flex-col h-screen sticky top-0 overflow-hidden pt-4">
        <SidebarNav
          podcastHeader={podcastHeader}
          plan={user?.plan ?? "FREE"}
          extraModules={user?.extraModules ?? []}
          usage={usage ?? { plan: "FREE", planLabel: "naocast free", used: 0, limit: 1, periodLabel: "au total" }}
        />
        {session?.user && (
          <form
            action={async () => {
              "use server";
              // Sans redirection de NextAuth (calculée à partir de NEXTAUTH_URL) : on reste sur le domaine courant, utile dans le cadre du back office nwes.
              await signOut({ redirect: false });
              redirect("/login");
            }}
            className="px-3 pb-5 shrink-0"
          >
            <button className="w-full text-left rounded-md px-3 py-2 text-sm text-peach-muted hover:text-peach-ink">
              Déconnexion
            </button>
          </form>
        )}
        <p className="px-3 pb-4 text-[11px] text-peach-muted/60 shrink-0">From Naoned with 🧡</p>
      </aside>
      <div className="min-w-0 flex-1 bg-background">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </div>
      {session?.user && <FeedbackWidget />}
    </div>
  );
}
