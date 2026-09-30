import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { PodcastForm } from "@/components/PodcastForm";
import { PodcastDnaForm } from "@/components/PodcastDnaForm";
import { PodcastTabs } from "@/components/PodcastTabs";

// Configuration du podcast, accessible à tout moment depuis la sidebar
// ("Mon podcast"), sert aussi bien à la création initiale (étape 2 du
// parcours utilisateur, via l'onglet ADN) qu'à la modification ultérieure.
// Deux onglets : ADN (positionnement, bible) et Graphisme (pochette, logo,
// génériques), deux préoccupations distinctes, chacune avec son propre
// formulaire.

// Les clés de stockage sont générées en `<prefix>/<uuid v4>-<nom original>`
// (cf. app/api/podcast/route.ts), on retrouve le nom original pour l'afficher.
function originalFilenameFromKey(key: string): string {
  const basename = key.split("/").pop() || key;
  return basename.slice(37); // 36 caractères d'UUID v4 + le tiret séparateur
}

interface ReferenceFile {
  key: string;
  filename: string;
  mimeType: string;
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
        logo: podcast.logoKey
          ? { url: await getSignedDownloadUrl(podcast.logoKey), filename: originalFilenameFromKey(podcast.logoKey) }
          : null,
      }
    : undefined;

  const referenceFiles = ((podcast?.referenceFiles as ReferenceFile[] | null) ?? []) as ReferenceFile[];
  const existingDna = podcast
    ? {
        title: podcast.title,
        dna: podcast.dna || "",
        bible: podcast.bible || "",
        referenceFiles: await Promise.all(
          referenceFiles.map(async (f) => ({ key: f.key, filename: f.filename, url: await getSignedDownloadUrl(f.key) }))
        ),
      }
    : undefined;

  return (
    <main className="p-8 max-w-4xl w-full">
      <h1 className="text-2xl font-bold mb-1">Mon podcast</h1>
      <p className="text-sm text-text-muted mb-6">
        Ces éléments sont réutilisés automatiquement sur chaque épisode.
      </p>
      <PodcastTabs
        tabs={[
          {
            key: "adn",
            label: "Paramètres",
            content: <PodcastDnaForm existing={existingDna} />,
            switchToOnFirstSave: "graphisme",
          },
          { key: "graphisme", label: "Graphisme", content: <PodcastForm existing={existingGraphisme} /> },
        ]}
      />
    </main>
  );
}
