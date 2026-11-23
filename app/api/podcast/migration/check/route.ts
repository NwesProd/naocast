import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { fetchFeed } from "@/lib/feedImport";
import { assertPublicUrl } from "@/lib/safeFetch";
import { feedUrl } from "@/lib/rss";

const norm = (u: string | null | undefined) => (u ?? "").trim().replace(/\/+$/, "").toLowerCase();

// Migration : vérifie que l'ancien hébergeur redirige bien vers le flux naocast, ou passe à l'étape suivante.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = z.object({ action: z.enum(["check", "advance", "finish"]) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast?.migrationFeedUrl || !podcast.rssSlug) return NextResponse.json({ error: "Aucune migration en cours." }, { status: 409 });

  if (parsed.data.action === "advance") {
    await prisma.podcast.update({ where: { id: podcast.id }, data: { migrationStatus: "REDIRECT" } });
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.action === "finish") {
    await prisma.podcast.update({ where: { id: podcast.id }, data: { migrationStatus: "DONE" } });
    return NextResponse.json({ ok: true });
  }
  try {
    const target = norm(feedUrl(podcast.rssSlug));
    // Redirection HTTP (301/302/307/308) de l'ancien flux vers celui de naocast : le cas le plus courant.
    const first = await fetch(await assertPublicUrl(podcast.migrationFeedUrl), { redirect: "manual", headers: { "User-Agent": "naocast-import/1.0" } });
    const location = first.status >= 300 && first.status < 400 ? first.headers.get("location") : null;
    let redirected = !!location && norm(new URL(location, podcast.migrationFeedUrl).toString()) === target;
    let current: string | null = location;
    // Sinon, balise de redirection dans l'ancien flux (itunes:new-feed-url).
    if (!redirected && first.ok) {
      const old = await fetchFeed(podcast.migrationFeedUrl);
      current = old.channel.newFeedUrl;
      redirected = norm(old.channel.newFeedUrl) === target;
    }
    if (redirected) await prisma.podcast.update({ where: { id: podcast.id }, data: { migrationStatus: "DONE" } });
    return NextResponse.json({ redirected, current });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
