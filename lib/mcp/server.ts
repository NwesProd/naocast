import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { groupBySpeaker } from "@/lib/transcriptGrouping";
import { episodeDisplayStatus, EPISODE_COUNTS_SELECT } from "@/lib/moduleProgress";
import { normalizeTags } from "@/lib/guestRelevance";
import { getObjectBuffer, getSignedDownloadUrl, getSignedUploadUrl, listAllObjects, storageMode } from "@/lib/storage";
import { randomUUID } from "crypto";
import { registerFinalVideo } from "@/lib/finalDelivery";
import { formatShootTime } from "@/lib/shootMarkers";
import { scriptToHtml, scriptToPlainText } from "@/lib/scriptText";
import { extractDocumentText } from "@/lib/documentText";
import { hasModuleAccess, PLAN_LABELS, type ModuleKey } from "@/lib/plan";
import { Prisma, type Plan } from "@/app/generated/prisma/client";

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

  const prodEnabled = hasModuleAccess(user.plan, "script", user.extraModules) || hasModuleAccess(user.plan, "invites", user.extraModules);

  const locked = (module: ModuleKey, label: string): ToolResult | null =>
    hasModuleAccess(user.plan, module, user.extraModules) ? null : fail(`Le module « ${label} » n'est pas inclus dans ton forfait (${PLAN_LABELS[user.plan]}).`);

  server.registerTool(
    "get_podcast",
    {
      title: "Mon podcast",
      description: "Informations sur le podcast de l'utilisateur : titre, positionnement (ADN), bible éditoriale et documents joints à la bible (texte extrait). À lire avant d'écrire du contenu pour garder le ton du podcast.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const podcast = await prisma.podcast.findUnique({ where: { userId: user.userId } });
      if (!podcast) return fail("Aucun podcast configuré sur ce compte.");
      const files = (podcast.referenceFiles as { key: string; filename: string; text?: string | null }[] | null) ?? [];
      const documents = await Promise.all(
        files.map(async (f) => ({
          filename: f.filename,
          // Documents ajoutés avant l'extraction à l'envoi : le texte est lu à la demande.
          text: f.text !== undefined ? f.text : await getObjectBuffer(f.key).then((b) => extractDocumentText(b, f.filename)).catch(() => null),
        }))
      );
      return json({ title: podcast.title, dna: podcast.dna, bible: scriptToPlainText(podcast.bible), documents });
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
        include: { _count: { select: EPISODE_COUNTS_SELECT } },
      });
      return json(
        episodes.map((e) => ({
          id: e.id,
          title: e.title,
          season: e.season,
          episodeNumber: e.episodeNumber,
          status: episodeDisplayStatus(e, e._count, prodEnabled),
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
      const [transcriptSegments, rushes] = await Promise.all([
        prisma.transcriptSegment.count({ where: { episodeId } }),
        prisma.rushSource.count({ where: { episodeId } }),
      ]);
      const count = transcriptSegments;
      const shootMarkers = await prisma.shootMarker.findMany({ where: { episodeId }, orderBy: { atMs: "asc" } });
      return json({
        id: episode.id,
        podcast: episode.podcast.title,
        title: episode.title,
        season: episode.season,
        episodeNumber: episode.episodeNumber,
        releaseDate: episode.releaseDate ? episode.releaseDate.toISOString().slice(0, 10) : null,
        status: episodeDisplayStatus(episode, { transcriptSegments, rushes, episodeGuests: guests.length }, prodEnabled),
        script: { draft: scriptToPlainText(episode.scriptDraft), angleIdeas: episode.scriptAngleIdeas, validated: episode.scriptValidated },
        guests: guests.map((g) => ({ id: g.guest.id, name: g.guest.name, media: g.guest.mediaName, tags: g.guest.tags, socialLinks: g.guest.socialLinks })),
        speakers: [...names.values()],
        hasTranscript: count > 0,
        // Repères posés pendant le tournage (temps depuis le départ du chrono, pas forcément calé sur le début des rushs).
        shoot: {
          startedAt: episode.shootStartedAt ? episode.shootStartedAt.toISOString() : null,
          endedAt: episode.shootEndedAt ? episode.shootEndedAt.toISOString() : null,
          markers: shootMarkers.map((m) => formatShootTime(m.atMs)),
        },
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
      description: "Remplace le brouillon du script de l'épisode par le texte fourni (script complet, questions, notes). Mise en forme en Markdown, affichée telle quelle dans l'éditeur de naocast : # titre, ## sous-titre, **gras**, *italique*, <u>souligné</u>, lignes vides entre les paragraphes. Refusé si le script est déjà validé : l'utilisateur doit d'abord retirer la validation dans naocast.",
      inputSchema: { episodeId: z.string(), script: z.string().max(100000) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episodeId, script }) => {
      const lock = locked("script", "Script");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.scriptValidated) return fail("Le script est validé : demande à l'utilisateur de retirer la validation dans le module Script avant de le modifier.");
      await prisma.episode.update({ where: { id: episodeId }, data: { scriptDraft: scriptToHtml(script) } });
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
    "create_guest",
    {
      title: "Créer un invité",
      description:
        "Ajoute un invité au pool du podcast (nom, média, réseaux, mots clés). Si un invité du même nom existe déjà, il n'est pas dupliqué : son identifiant est renvoyé. Ne le rattache à aucun épisode (utiliser add_guest_to_episode ensuite).",
      inputSchema: {
        name: z.string().min(1).max(200),
        media: z.string().max(200).optional().describe("Média, entreprise ou projet de l'invité"),
        socialLinks: z.array(z.object({ platform: z.enum(["instagram", "linkedin", "youtube"]), url: z.string().url() })).max(6).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, media, socialLinks, tags }) => {
      const lock = locked("invites", "Invités");
      if (lock) return lock;
      const podcast = await prisma.podcast.findUnique({ where: { userId: user.userId }, select: { id: true } });
      if (!podcast) return fail("Aucun podcast configuré sur ce compte.");
      const existing = await prisma.guest.findFirst({ where: { podcastId: podcast.id, name: { equals: name.trim(), mode: "insensitive" } } });
      if (existing) return ok(`Cet invité existe déjà dans le pool (id ${existing.id}), rien n'a été créé.`);
      const guest = await prisma.guest.create({
        data: {
          podcastId: podcast.id,
          name: name.trim(),
          mediaName: media?.trim() || null,
          socialLinks: (socialLinks ?? []) as unknown as Prisma.InputJsonValue,
          tags: normalizeTags(tags ?? []),
        },
      });
      return ok(`Invité créé dans le pool (id ${guest.id}).`);
    }
  );

  server.registerTool(
    "add_guest_to_episode",
    {
      title: "Ajouter un invité à un épisode",
      description: "Rattache un invité du pool à un épisode (casting). Refusé si le casting de l'épisode est déjà validé : l'utilisateur doit d'abord retirer la validation dans naocast.",
      inputSchema: { episodeId: z.string(), guestId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ episodeId, guestId }) => {
      const lock = locked("invites", "Invités");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.guestsCastingValidated) return fail("Le casting de cet épisode est validé : demande à l'utilisateur de retirer la validation dans le module Invités.");
      const guest = await prisma.guest.findUnique({ where: { id: guestId } });
      if (!guest || guest.podcastId !== episode.podcastId) return fail("Invité introuvable dans le pool de ce podcast.");
      const already = await prisma.episodeGuest.findUnique({ where: { episodeId_guestId: { episodeId, guestId } } });
      if (already) return ok(`${guest.name} est déjà rattaché à cet épisode.`);
      const maxOrder = await prisma.episodeGuest.aggregate({ where: { episodeId }, _max: { order: true } });
      await prisma.episodeGuest.create({ data: { episodeId, guestId, order: (maxOrder._max.order ?? -1) + 1 } });
      return ok(`${guest.name} ajouté à l'épisode.`);
    }
  );

  server.registerTool(
    "remove_guest_from_episode",
    {
      title: "Retirer un invité d'un épisode",
      description: "Détache un invité d'un épisode. L'invité reste dans le pool du podcast. Refusé si le casting de l'épisode est validé.",
      inputSchema: { episodeId: z.string(), guestId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episodeId, guestId }) => {
      const lock = locked("invites", "Invités");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.guestsCastingValidated) return fail("Le casting de cet épisode est validé : demande à l'utilisateur de retirer la validation dans le module Invités.");
      const removed = await prisma.episodeGuest.deleteMany({ where: { episodeId, guestId } });
      return ok(removed.count > 0 ? "Invité retiré de l'épisode (il reste dans le pool)." : "Cet invité n'était pas rattaché à l'épisode.");
    }
  );

  // Fichiers : rushs, épisode final et bibliothèque de médias du podcast. Chaque fichier est désigné par
  // un identifiant (« rush:… », « final:video », « media:… », « podcast:jingle »…) à passer à get_file_url.
  server.registerTool(
    "list_episode_files",
    {
      title: "Fichiers d'un épisode",
      description:
        "Liste les fichiers utiles pour monter un épisode : rushs importés, vidéo finale déjà déposée, et médias du podcast (générique de début et de fin, jingle, logo, pochette, bibliothèque de sons et musiques). Chaque fichier a un identifiant à donner à get_file_url pour le télécharger.",
      inputSchema: { episodeId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const [rushes, exportsList, podcast] = await Promise.all([
        prisma.rushSource.findMany({ where: { episodeId, status: "READY" }, orderBy: { createdAt: "asc" } }),
        prisma.exportAsset.findMany({ where: { episodeId } }),
        prisma.podcast.findUnique({ where: { id: episode.podcastId }, include: { mediaAssets: { orderBy: { createdAt: "asc" } } } }),
      ]);
      const podcastFiles = [
        ["intro", "Générique de début", podcast?.introKey],
        ["outro", "Générique de fin", podcast?.outroKey],
        ["jingle", "Jingle", podcast?.jingleKey],
        ["logo", "Logo permanent (à incruster)", podcast?.logoKey],
        ["cover", "Pochette", podcast?.coverKey],
      ].filter(([, , key]) => !!key);
      return json({
        status: episode.status,
        rushes: rushes.map((r) => ({
          id: `rush:${r.id}`,
          name: r.originalFilename || r.externalRef,
          durationSec: r.durationSec,
          sizeBytes: r.fileSizeBytes != null ? Number(r.fileSizeBytes) : null,
        })),
        final: exportsList.map((e) => ({ id: `final:${e.type.toLowerCase()}`, type: e.type })),
        podcastMedia: podcastFiles.map(([key, label]) => ({ id: `podcast:${key}`, label })),
        mediaLibrary: (podcast?.mediaAssets ?? []).map((a) => ({ id: `media:${a.id}`, name: a.name, type: a.type, mimeType: a.mimeType })),
      });
    }
  );

  server.registerTool(
    "get_file_url",
    {
      title: "Lien de téléchargement d'un fichier",
      description:
        "Renvoie un lien de téléchargement temporaire (1 heure) pour un fichier désigné par list_episode_files. Télécharge-le ensuite (par exemple avec curl -L -o) pour le monter en local avec ffmpeg.",
      inputSchema: { episodeId: z.string(), fileId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId, fileId }) => {
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const [kind, ref] = fileId.split(":");
      let key: string | null = null;
      let name = fileId;
      if (kind === "rush") {
        const rush = await prisma.rushSource.findFirst({ where: { id: ref, episodeId } });
        key = rush?.storageKey ?? null;
        name = rush?.originalFilename ?? name;
      } else if (kind === "final") {
        const asset = await prisma.exportAsset.findFirst({ where: { episodeId, type: ref === "audio" ? "AUDIO" : "VIDEO" }, orderBy: { createdAt: "desc" } });
        key = asset?.storageKey ?? null;
      } else if (kind === "media") {
        const asset = await prisma.mediaAsset.findFirst({ where: { id: ref, podcastId: episode.podcastId } });
        key = asset?.key ?? null;
        name = asset?.name ?? name;
      } else if (kind === "podcast") {
        const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
        const keys: Record<string, string | null | undefined> = {
          intro: podcast?.introKey,
          outro: podcast?.outroKey,
          jingle: podcast?.jingleKey,
          logo: podcast?.logoKey,
          cover: podcast?.coverKey,
        };
        key = keys[ref] ?? null;
      }
      if (!key) return fail("Fichier introuvable.");
      return json({ name, url: await getSignedDownloadUrl(key, 3600), expiresInSeconds: 3600 });
    }
  );

  server.registerTool(
    "create_final_upload",
    {
      title: "Préparer le dépôt de la vidéo finale",
      description:
        "Étape 1 du dépôt du montage terminé : renvoie une URL d'envoi (méthode PUT, corps = le fichier vidéo, en-tête Content-Type identique à contentType) et une clé. Envoie le fichier (par exemple curl -T fichier -H 'Content-Type: …' URL), puis appelle complete_final_upload avec la clé. Une seule vidéo finale par épisode : naocast en extrait l'audio. Refusé si l'utilisateur a déjà validé le montage.",
      inputSchema: {
        episodeId: z.string(),
        filename: z.string().min(1).max(300),
        contentType: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ episodeId, filename, contentType }) => {
      const lock = locked("montage", "Montage");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.status === "EXPORTED") return fail("Le montage est validé : demande à l'utilisateur de retirer la validation dans le module Montage.");
      if (storageMode !== "s3") return fail("Le dépôt par le connecteur n'est pas disponible dans cet environnement.");
      const type = contentType || "video/mp4";
      const key = `episodes/${episodeId}/final/${randomUUID()}-${filename.replace(/[\\/]/g, "_")}`;
      return json({ key, uploadUrl: await getSignedUploadUrl(key, type), method: "PUT", contentType: type, expiresInSeconds: 6 * 3600 });
    }
  );

  server.registerTool(
    "complete_final_upload",
    {
      title: "Terminer le dépôt de la vidéo finale",
      description:
        "Étape 2 : à appeler une fois la vidéo envoyée avec l'URL de create_final_upload. Enregistre le fichier comme vidéo finale ; naocast en extrait l'audio, puis l'utilisateur relit et valide le montage dans naocast.",
      inputSchema: { episodeId: z.string(), key: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episodeId, key }) => {
      const lock = locked("montage", "Montage");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      if (episode.status === "EXPORTED") return fail("Le montage est validé : demande à l'utilisateur de retirer la validation dans le module Montage.");
      if (!key.startsWith(`episodes/${episodeId}/final/`)) return fail("Clé de fichier invalide.");
      if (!(await listAllObjects(key)).some((o) => o.key === key)) return fail("Fichier introuvable : envoie-le d'abord avec l'URL fournie.");
      await registerFinalVideo(episodeId, key);
      return ok("Vidéo déposée. naocast en extrait l'audio, puis l'utilisateur pourra relire et valider le montage.");
    }
  );

  // Extraits : passages de l'épisode à sortir en vidéos courtes. Claude peut lire le tableau et proposer des idées
  // (statut « Idée », mention « Proposé par Claude »), que l'utilisateur garde ou écarte dans naocast.
  server.registerTool(
    "list_clips",
    {
      title: "Extraits d'un épisode",
      description: "Liste les extraits (idées, à monter, prêts, publiés) d'un épisode, avec leur titre, leur passage [mm:ss] et leur statut.",
      inputSchema: { episodeId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ episodeId }) => {
      const lock = locked("extraits", "Extraits");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const clips = await prisma.clip.findMany({ where: { episodeId }, orderBy: { createdAt: "asc" } });
      return json(
        clips.map((c) => ({ id: c.id, title: c.title, start: formatTime(c.startMs), end: formatTime(c.endMs), status: c.status, source: c.source, excerpt: c.excerpt }))
      );
    }
  );

  server.registerTool(
    "create_clip",
    {
      title: "Proposer un extrait",
      description:
        "Ajoute une idée d'extrait à un épisode : un passage du transcript, du début à la fin, avec un titre accrocheur. Les bornes sont les horodatages [mm:ss] ou [h:mm:ss] lus dans get_transcript. L'extrait arrive dans la colonne « Idées » ; l'utilisateur décide de le garder.",
      inputSchema: {
        episodeId: z.string(),
        title: z.string().min(1).max(200),
        start: z.string().describe("Début du passage, par exemple 09:40"),
        end: z.string().describe("Fin du passage, par exemple 10:22"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ episodeId, title, start, end }) => {
      const lock = locked("extraits", "Extraits");
      if (lock) return lock;
      const episode = await ownedEpisode(user.userId, episodeId);
      if (!episode) return fail("Épisode introuvable.");
      const toMs = (value: string): number | null => {
        const parts = value.trim().split(":").map(Number);
        if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
        return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
      };
      const startMs = toMs(start);
      const endMs = toMs(end);
      if (startMs === null || endMs === null || endMs <= startMs) return fail("Passage invalide : donne un début et une fin au format mm:ss, la fin après le début.");
      const segments = await prisma.transcriptSegment.findMany({ where: { episodeId, endMs: { gt: startMs }, startMs: { lt: endMs } }, orderBy: { startMs: "asc" }, select: { text: true } });
      const clip = await prisma.clip.create({
        data: { episodeId, title, startMs, endMs, excerpt: segments.map((s) => s.text.trim()).join(" ").slice(0, 5000), source: "CLAUDE" },
      });
      return ok(`Extrait ajouté aux idées (id ${clip.id}).`);
    }
  );

  return server;
}
