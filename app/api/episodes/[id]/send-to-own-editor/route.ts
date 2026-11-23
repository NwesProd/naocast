import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { sendEpisodeToOwnEditor } from "@/lib/email";
import { escapeHtml } from "@/lib/editingRequest";
import { getSignedDownloadUrl } from "@/lib/storage";

// Module Montage → « Mon monteur » : envoie par email au monteur personnel de l'utilisateur les
// liens de téléchargement des rushs et des médias du podcast (valables 7 jours). Aucune
// facturation naocast, aucun traitement automatique ; l'épisode attend le montage final.
const bodySchema = z.object({ email: z.string().email(), notes: z.string().max(5000).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      podcast: { include: { user: true, mediaAssets: { orderBy: { createdAt: "asc" } } } },
      rushes: { orderBy: { createdAt: "asc" } },
    },
  });

  const WEEK = 7 * 24 * 3600;
  const link = async (label: string, key: string | null) =>
    key ? `<li><a href="${await getSignedDownloadUrl(key, WEEK)}">${label}</a></li>` : "";

  const rushesList = (
    await Promise.all(episode.rushes.map((r) => link(r.originalFilename || r.externalRef || `(${r.type})`, r.storageKey)))
  ).join("");

  const library = [
    await link("Générique de début", episode.podcast.introKey),
    await link("Générique de fin", episode.podcast.outroKey),
    await link("Jingle", episode.podcast.jingleKey),
    await link("Logo", episode.podcast.logoKey),
    ...(await Promise.all(episode.podcast.mediaAssets.map((a) => link(`${a.name} (${a.type})`, a.key)))),
  ].join("");

  const html = `
    <h1>Nouvel épisode à monter : ${episode.podcast.title}</h1>
    <h2>${episode.title || "Sans titre"}</h2>
    ${parsed.data.notes?.trim() ? `<h3>Consignes</h3><p style="white-space:pre-wrap">${escapeHtml(parsed.data.notes.trim())}</p>` : ""}
    <h3>Rushs</h3>
    <ul>${rushesList || "<li>Aucun</li>"}</ul>
    <h3>Génériques, logo et sons du podcast</h3>
    <ul>${library || "<li>Aucun</li>"}</ul>
    <p>Les liens sont valables 7 jours. Merci de renvoyer l'épisode monté (vidéo ou audio) à ${episode.podcast.user.email}.</p>
    <p><em>Envoyé depuis naocast. par ${episode.podcast.user.email}.</em></p>
  `;

  await sendEpisodeToOwnEditor(parsed.data.email, `Épisode à monter : ${episode.title || episode.podcast.title}`, html);

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: {
      ownEditorEmail: parsed.data.email,
      status: "HUMAN_EDITOR_REQUESTED",
      humanEditorRequestedAt: new Date(),
    },
  });
  return NextResponse.json(updated);
}
