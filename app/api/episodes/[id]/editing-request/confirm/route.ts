import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { stripe } from "@/lib/stripe";
import { finalizeEditingRequest } from "@/lib/editingRequest";

// Retour de Stripe Checkout : vérifie le paiement directement auprès de Stripe
// plutôt que d'attendre le webhook (qui peut arriver après la redirection) ; la
// finalisation est idempotente, webhook et retour peuvent donc se croiser.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Session manquante." }, { status: 400 });

  const request = await prisma.editingRequest.findFirst({ where: { episodeId, stripeSessionId: sessionId, userId } });
  if (!request) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  await finalizeEditingRequest(request.id, session);

  const updated = await prisma.editingRequest.findUnique({ where: { id: request.id }, select: { status: true } });
  return NextResponse.json({ paid: updated?.status === "PAID" });
}
