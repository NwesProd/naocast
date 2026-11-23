import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";

// Migration : avancement de la copie des fichiers audio, épisode par épisode.
export async function GET() {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Podcast introuvable." }, { status: 404 });
  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id, rssGuid: { not: null } },
    select: { id: true, title: true, importAudioUrl: true, exports: { where: { type: "AUDIO" }, select: { id: true }, take: 1 }, jobs: { where: { type: "IMPORT_AUDIO" }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { releaseDate: "desc" },
  });
  const rows = episodes.map((e) => {
    const job = e.jobs[0];
    const state = e.exports.length > 0 ? "done" : job?.status === "FAILED" ? "failed" : job ? "pending" : "done";
    return { id: e.id, title: e.title || "Sans titre", state, error: job?.status === "FAILED" ? job.errorMessage : null };
  });
  return NextResponse.json({
    rows,
    done: rows.filter((r) => r.state === "done").length,
    failed: rows.filter((r) => r.state === "failed").length,
    total: rows.length,
    migrationStatus: podcast.migrationStatus,
  });
}

// Relance les copies en échec.
export async function POST() {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Podcast introuvable." }, { status: 404 });
  const failed = await prisma.processingJob.findMany({ where: { type: "IMPORT_AUDIO", status: "FAILED", episode: { podcastId: podcast.id } } });
  await prisma.processingJob.updateMany({ where: { id: { in: failed.map((j) => j.id) } }, data: { status: "PENDING", errorMessage: null, startedAt: null, finishedAt: null } });
  return NextResponse.json({ ok: true, retried: failed.length });
}
