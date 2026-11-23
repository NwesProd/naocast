import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { ensureRssSlug, missingHostingFields, feedUrl } from "@/lib/rss";

const platform = z.object({ url: z.string().max(500).optional(), status: z.enum(["none", "pending", "live"]) });
const schema = z.object({
  hostingMode: z.enum(["NAOCAST", "MIGRATE"]).nullable().optional(),
  author: z.string().max(200).optional(),
  ownerEmail: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  language: z.string().max(5).optional(),
  category: z.string().max(100).optional(),
  explicit: z.boolean().optional(),
  website: z.string().max(300).optional(),
  platformLinks: z.object({ apple: platform.optional(), spotify: platform.optional(), deezer: platform.optional() }).optional(),
});

// Enregistre les réglages d'hébergement audio du podcast (mode, infos du flux, état des plateformes).
export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const d = parsed.data;
  if (d.ownerEmail && !/^\S+@\S+\.\S+$/.test(d.ownerEmail)) return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  if (d.website && !/^https?:\/\//i.test(d.website)) return NextResponse.json({ error: "Le site web doit commencer par http:// ou https://." }, { status: 400 });

  const current = await prisma.podcast.findUnique({ where: { userId } });
  if (!current) return NextResponse.json({ error: "Crée d'abord ton podcast." }, { status: 404 });

  const podcast = await prisma.podcast.update({
    where: { userId },
    data: {
      ...(d.hostingMode !== undefined ? { hostingMode: d.hostingMode } : {}),
      ...(d.author !== undefined ? { author: d.author.trim() || null } : {}),
      ...(d.ownerEmail !== undefined ? { ownerEmail: d.ownerEmail.trim() || null } : {}),
      ...(d.description !== undefined ? { description: d.description.trim() || null } : {}),
      ...(d.language !== undefined ? { language: d.language } : {}),
      ...(d.category !== undefined ? { category: d.category || null } : {}),
      ...(d.explicit !== undefined ? { explicit: d.explicit } : {}),
      ...(d.website !== undefined ? { website: d.website.trim() || null } : {}),
      ...(d.platformLinks ? { platformLinks: { ...((current.platformLinks as object | null) ?? {}), ...d.platformLinks } } : {}),
    },
  });
  const slug = podcast.hostingMode ? await ensureRssSlug(podcast.id, podcast.title) : podcast.rssSlug;
  return NextResponse.json({ ok: true, feedUrl: slug ? feedUrl(slug) : null, missing: missingHostingFields(podcast) });
}
