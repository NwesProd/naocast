import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { stripe } from "@/lib/stripe";
import { EDITING_PRICE_ID } from "@/lib/editingRequest";

// Étape "Envoi" du tunnel "J'ai besoin d'un monteur" : enregistre la demande avec
// les remarques de l'utilisateur et l'envoie vers le paiement Stripe. La demande
// n'est transmise à l'équipe (email + back office) qu'une fois le paiement
// confirmé (cf. lib/editingRequest.ts, finalizeEditingRequest).
const bodySchema = z.object({ notes: z.string().max(5000).optional() });

function appUrl(req: Request): string {
  return process.env.NEXTAUTH_URL || req.headers.get("origin") || "http://localhost:3000";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const notes = parsed.data.notes?.trim() || null;

  if (episode.editorChoice !== "NEED_EDITOR") {
    return NextResponse.json({ error: "Cet épisode n'est pas configuré avec un monteur naocast." }, { status: 400 });
  }
  if (episode.status !== "DRAFT") {
    return NextResponse.json({ error: "Cette demande a déjà été envoyée." }, { status: 409 });
  }

  const alreadyPaid = await prisma.editingRequest.findFirst({ where: { episodeId, status: "PAID" } });
  if (alreadyPaid) return NextResponse.json({ error: "Cette demande a déjà été payée." }, { status: 409 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId }, select: { title: true } });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  // Une seule demande en attente par épisode : on la réutilise (nouvelles remarques, nouveau paiement).
  const pending = await prisma.editingRequest.findFirst({ where: { episodeId, status: "PENDING_PAYMENT" }, orderBy: { createdAt: "desc" } });
  const request = pending
    ? await prisma.editingRequest.update({
        where: { id: pending.id },
        data: { notes, userEmail: user.email, podcastTitle: podcast?.title ?? null, episodeTitle: episode.title },
      })
    : await prisma.editingRequest.create({
        data: { episodeId, userId, userEmail: user.email, podcastTitle: podcast?.title ?? null, episodeTitle: episode.title, notes },
      });

  // Prestation ponctuelle ("payment"), ou abonnement si le prix Stripe est récurrent.
  const price = await stripe.prices.retrieve(EDITING_PRICE_ID);
  const base = appUrl(req);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: price.recurring ? "subscription" : "payment",
    line_items: [{ price: EDITING_PRICE_ID, quantity: 1 }],
    success_url: `${base}/episodes/${episodeId}/montage?editing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/episodes/${episodeId}/montage?editing=cancel`,
    client_reference_id: userId,
    metadata: { kind: "editing", editingRequestId: request.id, episodeId, userId },
    allow_promotion_codes: true,
  });

  await prisma.editingRequest.update({ where: { id: request.id }, data: { stripeSessionId: session.id } });
  return NextResponse.json({ url: session.url });
}
