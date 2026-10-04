import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { createApiToken } from "@/lib/apiTokens";

// Clés personnelles du connecteur Claude (Paramètres). La clé complète n'est
// renvoyée qu'à la création.
export async function GET() {
  const userId = await requireUserId();
  const tokens = await prisma.apiToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json(tokens);
}

const postSchema = z.object({ name: z.string().max(60).optional() });

export async function POST(req: Request) {
  const userId = await requireUserId();
  const access = await getUserAccess(userId);
  if (!hasModuleAccess(access.plan, "mcp", access.extraModules)) {
    return NextResponse.json({ error: "Le connecteur Claude est réservé à naocast infinity et naocast lifetime." }, { status: 403 });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  try {
    const { id, token } = await createApiToken(userId, parsed.data.name || "Claude");
    return NextResponse.json({ id, token });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
