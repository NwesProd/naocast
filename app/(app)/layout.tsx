import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getEpisodeUsage } from "@/lib/entitlements";
import { SidebarNav } from "@/components/SidebarNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  const podcast = session?.user
    ? await prisma.podcast.findUnique({ where: { userId: session.user.id }, select: { title: true, coverKey: true } })
    : null;
  const user = session?.user
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true } })
    : null;
  const usage = session?.user ? await getEpisodeUsage(session.user.id) : null;
  const podcastHeader = podcast
    ? { title: podcast.title, coverUrl: podcast.coverKey ? await getSignedDownloadUrl(podcast.coverKey) : null }
    : null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-peach-sidebar flex flex-col">
        <Link href="/dashboard" className="px-5 py-5 font-display font-bold text-lg tracking-tight text-ink">
          naocast.
        </Link>
        <SidebarNav
          podcastHeader={podcastHeader}
          plan={user?.plan ?? "FREE"}
          usage={usage ?? { plan: "FREE", planLabel: "naocast free", used: 0, limit: 1, periodLabel: "au total" }}
        />
        {session?.user && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="px-3 pb-5"
          >
            <button className="w-full text-left rounded-md px-3 py-2 text-sm text-peach-muted hover:text-peach-ink">
              Déconnexion
            </button>
          </form>
        )}
        <p className="px-3 pb-4 text-[11px] text-peach-muted/60">From Naoned with 🧡</p>
      </aside>
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
