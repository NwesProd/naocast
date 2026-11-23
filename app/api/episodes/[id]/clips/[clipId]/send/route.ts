import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/requestOrigin";
import { CLIP_PRICE_ID, renderClipBrief } from "@/lib/clips";

// Envoie le brief d'un extrait à un monteur : « own » = par e-mail à ton propre monteur ; « naocast » = prestation
// payante (paiement Stripe), la demande part à l'équipe une fois le paiement confirmé.
const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("own"), email: z.string().email(), notes: z.string().max(5000).optional() }),
  z.object({ mode: z.literal("naocast"), notes: z.string().max(5000).optional() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, clipId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  const clip = await prisma.clip.findFirst({ where: { id: clipId, episodeId } });
  if (!clip) return NextResponse.json({ error: "Extrait introuvable." }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (parsed.data.mode === "own") {
    const { subject, html } = await renderClipBrief(clipId, parsed.data.notes ?? null, `Envoyé depuis naocast par ${user.email} : merci de lui renvoyer l'extrait monté.`);
    await sendEmail({ to: parsed.data.email, subject, html });
    await prisma.clip.update({ where: { id: clipId }, data: { editor: "OWN", ...(clip.status === "IDEA" ? { status: "TO_EDIT" } : {}) } });
    return NextResponse.json({ ok: true });
  }

  if (!CLIP_PRICE_ID) return NextResponse.json({ error: "Le montage d'extrait par un monteur naocast sera bientôt disponible." }, { status: 503 });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }
  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId }, select: { title: true } });
  const request = await prisma.editingRequest.create({
    data: {
      episodeId,
      userId,
      userEmail: user.email,
      podcastTitle: podcast?.title ?? null,
      episodeTitle: `Extrait : ${clip.title}`,
      notes: parsed.data.notes?.trim() || null,
      kind: "CLIP",
      clipId,
    },
  });
  const price = await stripe.prices.retrieve(CLIP_PRICE_ID);
  const base = requestOrigin(req);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: price.recurring ? "subscription" : "payment",
    line_items: [{ price: CLIP_PRICE_ID, quantity: 1 }],
    success_url: `${base}/episodes/${episodeId}/extraits?clip=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/episodes/${episodeId}/extraits?clip=cancel`,
    client_reference_id: userId,
    metadata: { kind: "editing", editingRequestId: request.id, episodeId, userId },
    allow_promotion_codes: true,
  });
  await prisma.editingRequest.update({ where: { id: request.id }, data: { stripeSessionId: session.id } });
  return NextResponse.json({ url: session.url });
}
