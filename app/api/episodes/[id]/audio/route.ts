import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { missingHostingFields } from "@/lib/rss";

const schema = z.object({ title: z.string().max(300).optional(), description: z.string().max(20000).optional(), publish: z.boolean().optional() });

// Diffusion audio d'un épisode : description (HTML) et mise dans le flux RSS (ou retrait).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  let episode;
  try {
    episode = await requireOwnedEpisode(userId, id);
  } catch {
    return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { title, description, publish } = parsed.data;

  if (publish === true) {
    const audio = await prisma.exportAsset.findFirst({ where: { episodeId: id, type: "AUDIO" } });
    if (!audio) return NextResponse.json({ error: "L'audio n'est pas encore prêt. Dépose et valide l'épisode final dans Montage." }, { status: 409 });
    if (!episode.podcast.hostingMode) return NextResponse.json({ error: "Choisis d'abord comment héberger ton podcast." }, { status: 409 });
    const missing = missingHostingFields(episode.podcast);
    if (missing.length) return NextResponse.json({ error: `Complète d'abord : ${missing.join(", ")}.` }, { status: 409 });
  }

  const updated = await prisma.episode.update({
    where: { id },
    data: {
      ...(title !== undefined ? { audioTitle: title.trim() || null } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(publish === true ? { audioPublishedAt: episode.audioPublishedAt ?? new Date() } : {}),
      ...(publish === false ? { audioPublishedAt: null } : {}),
    },
  });
  return NextResponse.json({ ok: true, audioPublishedAt: updated.audioPublishedAt });
}
