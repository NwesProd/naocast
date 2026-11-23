import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { PodcastForm } from "@/components/PodcastForm";
import { PodcastDnaForm } from "@/components/PodcastDnaForm";
import { PodcastTabs } from "@/components/PodcastTabs";
import { MediaLibrary } from "@/components/MediaLibrary";
import { DiffusionSources } from "@/components/DiffusionSources";
import { feedUrl, missingHostingFields } from "@/lib/rss";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { LOGO_ASSET_ID } from "@/lib/mediaAssets";

// Configuration du podcast, accessible à tout moment depuis la sidebar
// ("Mon podcast"), sert aussi bien à la création initiale (étape 2 du
// parcours utilisateur, via l'onglet ADN) qu'à la modification ultérieure.
// Deux onglets : Paramètres (titre, bible) et Bibliothèque de médias (pochette, génériques,
// jingle, logo, puis tableau des jingles, transitions, sons et musiques), deux préoccupations distinctes, chacune avec son propre
// formulaire.

// Les clés de stockage sont générées en `<prefix>/<uuid v4>-<nom original>`
// (cf. app/api/podcast/route.ts), on retrouve le nom original pour l'afficher.
function originalFilenameFromKey(key: string): string {
  const basename = key.split("/").pop() || key;
  return basename.slice(37); // 36 caractères d'UUID v4 + le tiret séparateur
}

export default async function PodcastPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const podcast = await prisma.podcast.findUnique({ where: { userId: session.user.id } });

  const existingGraphisme = podcast
    ? {
        cover: podcast.coverKey
          ? { url: await getSignedDownloadUrl(podcast.coverKey), filename: originalFilenameFromKey(podcast.coverKey) }
          : null,
        intro: podcast.introKey
          ? {
              url: await getSignedDownloadUrl(podcast.introKey),
              filename: originalFilenameFromKey(podcast.introKey),
              previewUrl: podcast.introPreviewKey ? await getSignedDownloadUrl(podcast.introPreviewKey) : null,
            }
          : null,
        outro: podcast.outroKey
          ? {
              url: await getSignedDownloadUrl(podcast.outroKey),
              filename: originalFilenameFromKey(podcast.outroKey),
              previewUrl: podcast.outroPreviewKey ? await getSignedDownloadUrl(podcast.outroPreviewKey) : null,
            }
          : null,
        jingle: podcast.jingleKey
          ? { url: await getSignedDownloadUrl(podcast.jingleKey), filename: originalFilenameFromKey(podcast.jingleKey) }
          : null,
      }
    : undefined;

  // Le logo permanent est la première ligne du tableau (type « logo »).
  const logoRow = podcast?.logoKey
    ? {
        id: LOGO_ASSET_ID,
        name: originalFilenameFromKey(podcast.logoKey),
        type: "logo",
        mimeType: `image/${podcast.logoKey.split(".").pop()?.toLowerCase() || "png"}`,
        size: null,
        createdAt: null,
        url: await getSignedDownloadUrl(podcast.logoKey),
        downloadUrl: await getSignedDownloadUrl(podcast.logoKey, 3600, originalFilenameFromKey(podcast.logoKey)),
      }
    : null;
  const mediaAssets = podcast
    ? await Promise.all(
        (await prisma.mediaAsset.findMany({ where: { podcastId: podcast.id }, orderBy: { createdAt: "desc" } })).map(async (a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          mimeType: a.mimeType,
          size: a.size,
          createdAt: a.createdAt.toISOString(),
          url: await getSignedDownloadUrl(a.key),
          downloadUrl: await getSignedDownloadUrl(a.key, 3600, a.name),
        }))
      ).then((rows) => (logoRow ? [logoRow, ...rows] : rows))
    : [];

  const access = podcast ? await getUserAccess(session.user.id) : null;
  const showDiffusion = !!access && hasModuleAccess(access.plan, "diffusion", access.extraModules);

  const existingDna = podcast
    ? {
        title: podcast.title,
        // L'ancien champ ADN a été fusionné dans la bible : un texte ADN existant s'y affiche.
        bible: podcast.bible || podcast.dna || "",
        documents: await Promise.all(
          ((podcast.referenceFiles as { key: string; filename: string; mimeType: string; text?: string | null }[] | null) ?? []).map(
            async (f) => ({
              key: f.key,
              filename: f.filename,
              mimeType: f.mimeType,
              text: f.text ?? null,
              url: await getSignedDownloadUrl(f.key),
            })
          )
        ),
      }
    : undefined;

  return (
    <main className="p-8 w-full">
      <h1 className="text-2xl font-bold mb-6">Mon podcast</h1>
      <PodcastTabs
        tabs={[
          {
            key: "adn",
            label: "Paramètres",
            content: <PodcastDnaForm existing={existingDna} />,
            switchToOnFirstSave: "graphisme",
          },
          {
            key: "graphisme",
            label: "Bibliothèque de médias",
            content: (
              <div className="space-y-10">
                <PodcastForm existing={existingGraphisme} />
                {podcast && <MediaLibrary initialAssets={mediaAssets} />}
              </div>
            ),
          },
          ...(podcast && showDiffusion
            ? [
                {
                  key: "diffusion",
                  label: "Sources de diffusion",
                  content: (
                    <DiffusionSources
                      channelTitle={podcast.youtubeChannelTitle}
                      hosting={{
                        mode: (podcast.hostingMode as "NAOCAST" | "MIGRATE" | null) ?? null,
                        feedUrl: podcast.rssSlug ? feedUrl(podcast.rssSlug) : null,
                        missing: missingHostingFields(podcast),
                        platformLinks: (podcast.platformLinks as never) ?? {},
                        migrationStatus: podcast.migrationStatus,
                        migrationFeedUrl: podcast.migrationFeedUrl,
                        values: {
                          author: podcast.author ?? "",
                          ownerEmail: podcast.ownerEmail ?? "",
                          description: podcast.description ?? "",
                          language: podcast.language,
                          category: podcast.category ?? "",
                          explicit: podcast.explicit,
                          website: podcast.website ?? "",
                        },
                      }}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </main>
  );
}
