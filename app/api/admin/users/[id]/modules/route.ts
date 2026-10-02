import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { BUILT_MODULES } from "@/lib/plan";

const schema = z.object({ modules: z.array(z.enum(BUILT_MODULES.map((m) => m.key) as [string, ...string[]])).max(20) });

// Active ou retire à la main des modules pour un utilisateur (testeur, geste
// commercial), en plus de ceux de son forfait. Remplace la liste entière.
export const PUT = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Liste de modules invalide." }, { status: 400 });

  const result = await prisma.user.updateMany({ where: { id }, data: { extraModules: [...new Set(parsed.data.modules)] } });
  if (result.count === 0) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
});
