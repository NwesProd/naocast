import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { groupBySpeaker } from "@/lib/transcriptGrouping";
import { episodeDisplayStatus } from "@/lib/moduleProgress";
import { normalizeTags } from "@/lib/guestRelevance";
import { hasModuleAccess, PLAN_LABELS, type ModuleKey } from "@/lib/plan";
import type { Plan } from "@/app/generated/prisma/client";

// Serveur MCP "Connecteur Claude" : permet à un podcasteur de brancher son Claude
// sur son compte naocast (clé personnelle, cf. lib/apiTokens.ts). Chaque outil est
// lié à l'utilisateur authentifié et ne voit que SES épisodes, jamais ceux d'un
// autre compte. Les écritures sont volontairement limitées (script, messages aux
// invités, mots clés) : ni suppression, ni validation, ni lancement de traitement.

export interface McpUser {
  userId: string;
  plan: Plan;
  extraModules: string[];
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const json = (value: unknown): ToolResult => ok(JSON.stringify(value, null, 2));

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}:${String(m).padStart(2, "0")}` : String(m)}:${String(s).padStart(2, "0")}`;
}

async function ownedEpisode(userId: string, episodeId: string) {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId }, include: { podcast: { select: { userId: true, title: true } } } });
  if (!episode || episode.podcast.userId !== userId) return null;
  return episode;
}

// Nom affiché de chaque locuteur ("Locuteur 1" quand l'utilisateur ne l'a pas nommé).
async function speakerNames(episodeId: string): Promise<Map<string, string>> {
  const speakers = await prisma.episodeSpeaker.findMany({ where: { episodeId }, orderBy: { label: "asc" } });
  return new Map(speakers.map((s, i) => [s.label, s.displayName || `Locuteur ${i + 1}`]));
}

export function createNaocastMcpServer(user: McpUser): McpServer {
  const server = new McpServer({ name: "naocast", version: "1.0.0" });

  const locked = (module: ModuleKey, label: string): ToolResult | null =>
    hasModuleAccess(user.plan, module, user.extraModules) ? null : fail(`Le module « ${label} » n'est pas inclus dans ton forfait (${PLAN_LABELS[user.plan]}).`);

  server.registerTool(
    "get_podcast",
    {
      title: "Mon podcast",
      description: "Informations sur le podcast de l'utilisateur : titre, positionnement (ADN) et bible éditoriale. À lire avant d'écrire du contenu pour garder le ton du podcast.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const podcast = await prisma.podcast.findUnique({ where: { userId: user.userId } });
      if (!podcast) return fail("Aucun podcast configuré sur ce compte.");
      return json({ title: podcast.title, dna: podcast.dna, bible: podcast.bible });
    }
  );

  server.registerTool(
    "list_episodes",
    {
      title: "Liste des épisodes",
      description: "Liste les épisodes du podcast (plus récent d'abord) avec leur identifiant, titre, saison/numéro, statut, date de sortie et la présence d'un transcript.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const podcast = await prisma.podcast.findUnique({ where: { userId: user.userId }, select: { id: true } });
      if (!podcast) return fail("Aucun podcast configuré sur ce compte.");
      const episodes = await prisma.episode.findMany({
        where: { podcastId: podcast.id },
        orderBy: [{ season: { sort: "desc", nulls: "last" } }, { episodeNumber: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        include: { _count: { select: { transcriptSegments: true } } },
      });
      return json(
        episodes.map((e) => ({
          id: e.id,
          title: e.title,
          season: e.season,
          episodeNumber: e.episodeNumber,
          status: episodeDisplayStatus(e, e._count.transcriptSegments),
          releaseDate: e.releaseDate ? e.releaseDate.toISOString().slice(0, 10) : null,
          hasTranscript: e._count.transcriptSegments > 0,
        }))
      );
    }
  );

  server.registerTool(
    "get_episode",
    {
      title: "Détail d'un épisode",
      description: "Détail d'un épisode : informations, script (brouillon et idées d'angles), invités, locuteurs et validations. Le transcript se lit avec get_transcript.",
      inputSchema: { episodeId: z.string().describe("Identifiant de l'épisode (voir list_episodes)") },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const guests = await prisma.episodeGuest.findMany({ where: { episodeId }, include: { guest: true }, orderBy: { order: "asc" } });
      const names = await speakerNames(episodeId);
      const count = await prisma.transcriptSegment.count({ where: { episodeId } });
      return json({
        id: episode.id,
        podcast: episode.podcast.title,
        title: episode.title,
        season: episode.season,
        episodeNumber: episode.episodeNumber,
        releaseDate: episode.releaseDate ? episode.releaseDate.toISOString().slice(0, 10) : null,
        status: episodeDisplayStatus(episode, count),
        script: { draft: episode.scriptDraft, angleIdeas: episode.scriptAngleIdeas, validated: episode.scriptValidated },
        guests: guests.map((g) => ({ id: g.guest.id, name: g.guest.name, media: g.guest.mediaName, tags: g.guest.tags, socialLinks: g.guest.socialLinks })),
        speakers: [...names.values()],
        hasTranscript: count > 0,
      });
    }
  );

  server.registerTool(
    "get_transcript",
    {
      title: "Transcript d'un épisode",
      description:
        "Texte complet du transcript, par prises de parole avec le nom des locuteurs et, au choix, les horodatages [mm:ss]. Les longs transcripts sont découpés : si `hasMore` est vrai, relance avec `offset` = `nextOffset`.",
      inputSchema: {
        episodeId: z.string(),
        withTimestamps: z.boolean().optional().describe("Ajouter l'horodatage de chaque prise de parole (défaut : oui)"),
        offset: z.number().int().min(0).optional().describe("Position de départ en caractères (défaut : 0)"),
        limit: z.number().int().min(1000).max(100000).optional().describe("Nombre maximum de caractères renvoyés (défaut : 60000)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId, withTimestamps = true, offset = 0, limit = 60000 }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const segments = await prisma.transcriptSegment.findMany({ where: { episodeId }, orderBy: { startMs: "asc" }, select: { startMs: true, text: true, speaker: true } });
      if (segments.length === 0) return fail("Cet épisode n'a pas encore de transcript.");
      const names = await speakerNames(episodeId);

      const text = groupBySpeaker(segments)
        .map((turn) => {
          const who = turn.speaker ? names.get(turn.speaker) ?? turn.speaker : null;
          const body = turn.segments.map((s) => s.text.trim()).join(" ");
          return `${withTimestamps ? `[${formatTime(turn.startMs)}] ` : ""}${who ? `${who} : ` : ""}${body}`;
        })
        .join("\n\n");

      const chunk = text.slice(offset, offset + limit);
      const hasMore = offset + limit < text.length;
      return ok(`${chunk}${hasMore ? `\n\n[Suite disponible : hasMore=true, nextOffset=${offset + limit}, total=${text.length} caractères]` : ""}`);
    }
  );

  server.registerTool(
    "search_transcript",
    {
      title: "Chercher dans un transcript",
      description: "Cherche un mot ou une expression dans le transcript d'un épisode et renvoie les passages trouvés avec leur horodatage et le locuteur.",
      inputSchema: { episodeId: z.string(), query: z.string().min(2).max(200), limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId, query, limit = 20 }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const segments = await prisma.transcriptSegment.findMany({
        where: { episodeId, text: { contains: query, mode: "insensitive" } },
        orderBy: { startMs: "asc" },
        take: limit,
        select: { startMs: true, text: true, speaker: true },
      });
      if (segments.length === 0) return ok("Aucun passage trouvé.");
      const names = await speakerNames(episodeId);
      return ok(segments.map((s) => `[${formatTime(s.startMs)}] ${s.speaker ? `${names.get(s.speaker) ?? s.speaker} : ` : ""}${s.text.trim()}`).join("\n\n"));
    }
  );

  server.registerTool(
    "save_script",
    {
      title: "Enregistrer le script",
      description: "Remplace le brouillon du script de l'épisode par le texte fourni (script complet, questions, notes). Refusé si le script est déjà validé : l'utilisateur doit d'abord retirer la validation dans naocast.",
      inputSchema: { episodeId: z.string(), script: z.string().max(100000) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episodeId, script }) => {
      const lock = locked("script", "Script");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.scriptValidated) return fail("Le script est validé : demande à l'utilisateur de retirer la validation dans le module Script avant de le modifier.");
      await prisma.episode.update({ where: { id: episodeId }, data: { scriptDraft: script } });
      return ok("Script enregistré.");
    }
  );

  server.registerTool(
    "list_guests",
    {
      title: "Invités du podcast",
      description: "Le pool d'invités du podcast avec leurs mots clés et réseaux, et les épisodes où ils sont rattachés.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const podcast = await prisma.podcast.findUnique({ where: { userId: user.userId }, select: { id: true } });
      if (!podcast) return fail("Aucun podcast configuré sur ce compte.");
      const guests = await prisma.guest.findMany({ where: { podcastId: podcast.id }, orderBy: { name: "asc" }, include: { episodeGuests: { select: { episodeId: true } } } });
      return json(
        guests.map((g) => ({ id: g.id, name: g.name, media: g.mediaName, tags: g.tags, socialLinks: g.socialLinks, episodeIds: g.episodeGuests.map((e) => e.episodeId) }))
      );
    }
  );

  server.registerTool(
    "set_guest_tags",
    {
      title: "Mots clés d'un invité",
      description: "Remplace les mots clés d'un invité. Ils servent à faire remonter les invités pertinents par rapport au script d'un épisode.",
      inputSchema: { guestId: z.string(), tags: z.array(z.string().max(40)).max(20) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ guestId, tags }) => {
      const lock = locked("invites", "Invités");
      if (lock) return lock;
      const guest = await prisma.guest.findUnique({ where: { id: guestId }, include: { podcast: { select: { userId: true } } } });
      if (!guest || guest.podcast.userId !== user.userId) return fail("Invité introuvable.");
      const clean = normalizeTags(tags);
      await prisma.guest.update({ where: { id: guestId }, data: { tags: clean } });
      return ok(`Mots clés enregistrés : ${clean.join(", ") || "(aucun)"}.`);
    }
  );

  server.registerTool(
    "get_guest_messages",
    {
      title: "Messages aux invités",
      description: "Le « message d'info » (avant l'enregistrement) et le « message diffusion » (annonce de sortie) de l'épisode, tels qu'enregistrés.",
      inputSchema: { episodeId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      return json({ info: episode.guestMessage, broadcast: episode.guestBroadcastMessage });
    }
  );

  server.registerTool(
    "save_guest_message",
    {
      title: "Enregistrer un message aux invités",
      description: "Enregistre le « message d'info » (kind = info) ou le « message diffusion » (kind = broadcast) de l'épisode. Remplace le texte existant.",
      inputSchema: { episodeId: z.string(), kind: z.enum(["info", "broadcast"]), message: z.string().max(20000) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episodeId, kind, message }) => {
      const lock = locked("invites", "Invités");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      await prisma.episode.update({
        where: { id: episodeId },
        data: kind === "info" ? { guestMessage: message || null } : { guestBroadcastMessage: message || null },
      });
      return ok("Message enregistré.");
    }
  );

  return server;
}
