import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

const patchSchema = z.object({ bible: z.string() });

// Enregistre la bible du podcast, rédigée à la main.
export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const podcast = await prisma.podcast.update({
    where: { userId },
    data: { bible: parsed.data.bible || null },
  });

  return jsonResponse(podcast);
}
