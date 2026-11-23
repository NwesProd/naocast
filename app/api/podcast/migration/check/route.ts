import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { fetchFeed } from "@/lib/feedImport";
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
    const old = await fetchFeed(podcast.migrationFeedUrl);
    const redirected = norm(old.channel.newFeedUrl) === norm(feedUrl(podcast.rssSlug));
    if (redirected) await prisma.podcast.update({ where: { id: podcast.id }, data: { migrationStatus: "DONE" } });
    return NextResponse.json({ redirected, current: old.channel.newFeedUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
