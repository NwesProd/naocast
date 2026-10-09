import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { episodeDisplayStatus, EPISODE_COUNTS_SELECT } from "@/lib/moduleProgress";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { statusLabel } from "@/components/StatusBadge";
import { getEpisodeUsage } from "@/lib/entitlements";
import { isMontageDone } from "@/lib/moduleProgress";
import { GuestPool } from "./GuestPool";
import { Checklist, FeedbackBanner, HowItWorks, PlanStrip, type ChecklistStep } from "./OnboardingSections";

// Tableau de bord du podcast (rythme de publication, dernier épisode,
// prochaine sortie), accessible via "Mon podcast" dans la sidebar. Distinct de
// /podcast (paramètres du podcast), qu'on ouvre en cliquant sur le nom du
// podcast tout en haut de la sidebar.

// Les vues/écoutes nécessitent une intégration externe (YouTube Analytics,
// Spotify for Podcasters...) qui n'existe pas encore : on ne fait pas
// semblant d'avoir des chiffres, on l'indique clairement plutôt que
// d'inventer des données.
const STATS_UNAVAILABLE = "Bientôt disponible";

// Même logique de routage que EpisodeCard.tsx (liste des épisodes) : le
// premier module non cadenassé de la sidebar une fois l'épisode paramétré.
function episodeHref(ep: { id: string; title: string | null; status: string }): string {
  if (!ep.title) return `/episodes/${ep.id}/new`;
  if (ep.status === "DRAFT") return `/episodes/${ep.id}/montage`;
  return `/episodes/${ep.id}/review`;
}

function episodeLabel(ep: { title: string | null; season: number | null; episodeNumber: number | null }): string {
  const sn = [ep.season != null ? `S${ep.season}` : null, ep.episodeNumber != null ? `E${ep.episodeNumber}` : null]
    .filter(Boolean)
    .join("");
  const title = ep.title || "Sans titre";
  return sn ? `${sn} · ${title}` : title;
}

function daysUntil(date: Date): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

function daysUntilLabel(n: number): string {
  if (n === 0) return "aujourd'hui";
  if (n > 0) return `J-${n}`;
  return `J+${-n}`; // ne devrait pas arriver (filtré en amont), gardé par robustesse
}

function RhythmIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="4" height="10" rx="1" fill="currentColor" />
      <rect x="10" y="5" width="4" height="15" rx="1" fill="currentColor" />
      <rect x="16" y="13" width="4" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

export default async function PodcastDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const podcast = await prisma.podcast.findUnique({ where: { userId: session.user.id } });
  if (!podcast) redirect("/podcast");

  const access = await getUserAccess(session.user.id);
  // La phase "Prod" n'existe que pour les forfaits qui ont Script ou Invités.
  const prodEnabled = hasModuleAccess(access.plan, "script", access.extraModules) || hasModuleAccess(access.plan, "invites", access.extraModules);

  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id },
    include: { _count: { select: EPISODE_COUNTS_SELECT } },
  });

  // Faute de date d'export dédiée, la date de publication d'un épisode
  // validé est sa date de sortie renseignée, ou à défaut la date de la
  // dernière mise à jour (passage en statut EXPORTED via /validate).
  const publishDate = (ep: (typeof episodes)[number]) => ep.releaseDate ?? ep.updatedAt;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // "Publié" : épisode diffusé (tout validé et date de sortie atteinte, cf.
  // displayStatus) ou exporté dans naocast sans que tout le reste soit validé
  // (ancien comportement : un export validé comptait comme publié).
  const isPublished = (ep: (typeof episodes)[number]) => {
    return episodeDisplayStatus(ep, ep._count, prodEnabled) === "PUBLISHED";
  };
  const exported = episodes.filter(isPublished);
  const exportedThisMonth = exported.filter((ep) => {
    const d = publishDate(ep);
    return d >= monthStart && d < monthEnd;
  });

  const lastEpisode = exported.sort((a, b) => publishDate(b).getTime() - publishDate(a).getTime())[0] ?? null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = episodes
    .filter((ep) => !isPublished(ep) && ep.releaseDate && ep.releaseDate >= startOfToday)
    .sort((a, b) => a.releaseDate!.getTime() - b.releaseDate!.getTime());
  const nextEpisode = upcoming[0] ?? null;

  // Checklist de démarrage : chaque étape se coche toute seule d'après ce que l'utilisateur a déjà fait.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { email: true } });
  const firstName = user.email.split("@")[0].split(/[._-]/)[0];
  const greetingName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const usage = await getEpisodeUsage(session.user.id);

  // Épisode sur lequel pointent les boutons : le plus récent encore en cours, sinon le plus récent.
  const focusEpisode = episodes.find((ep) => ep.status !== "EXPORTED" && !ep.montageValidatedExternally) ?? episodes[0] ?? null;
  const focusHref = focusEpisode ? episodeHref(focusEpisode) : "/dashboard";
  const steps: ChecklistStep[] = [
    {
      key: "customize",
      title: "Personnalise ton podcast",
      description: "Pochette, générique, logo : ils sont incrustés automatiquement sur chaque épisode.",
      done: !!(podcast.coverKey || podcast.introKey || podcast.outroKey || podcast.logoKey),
      cta: { label: "Configurer", href: "/podcast" },
    },
    {
      key: "episode",
      title: "Crée ton premier épisode",
      description: "Un titre, une date de sortie : en deux minutes l'épisode est prêt à accueillir tes rushs.",
      done: episodes.length > 0,
      cta: { label: "Créer mon épisode", createEpisode: true },
    },
    {
      key: "import",
      title: "Importe ton enregistrement",
      description: "Dépose ton fichier : naocast le transcrit et repère tes silences et tes ratés.",
      done: episodes.some((ep) => ep._count.rushes > 0 || ep._count.transcriptSegments > 0 || ep.status !== "DRAFT" || ep.montageValidatedExternally),
      cta: { label: "Importer", href: focusHref },
    },
    {
      key: "montage",
      title: "Lance ton montage",
      description: "Accepte ou refuse les coupes proposées, choisis tes génériques, regarde l'aperçu.",
      done: episodes.some((ep) => ep.status !== "DRAFT" || ep.montageValidatedExternally),
      cta: { label: "Monter", href: focusHref },
    },
    {
      key: "validate",
      title: "Valide ton premier montage",
      description: "Relis le rendu, puis télécharge la vidéo et l'audio finaux.",
      done: episodes.some((ep) => isMontageDone(ep)),
      cta: { label: "Relire", href: focusHref },
    },
    {
      key: "schedule",
      title: "Programme ta sortie",
      description: "Renseigne une date : ton dashboard te dit combien de jours il te reste.",
      done: episodes.some((ep) => ep.releaseDate),
      cta: { label: "Choisir une date", href: focusEpisode ? `/episodes/${focusEpisode.id}/new` : "/dashboard" },
    },
  ];
  const nextStep = steps.find((st) => !st.done);

  // Pool d'invités du podcast (module Invités : forfaits qui l'incluent ou testeurs).
  const guestRows = await prisma.guest.findMany({
    where: { podcastId: podcast.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { episodeGuests: true } } },
  });
  const poolGuests = guestRows.map((g) => ({
    id: g.id,
    name: g.name,
    mediaName: g.mediaName,
    tags: g.tags,
    socialLinks: (g.socialLinks as { platform: string; url: string }[] | null) ?? [],
    episodeCount: g._count.episodeGuests,
  }));
  const hasGuestsModule = hasModuleAccess(access.plan, "invites", access.extraModules);
  const allStepsDone = !nextStep;

  return (
    <main className="p-8 w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Salut {greetingName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-sm text-text-muted">
            {nextStep ? `Prochaine étape : ${nextStep.title.charAt(0).toLowerCase()}${nextStep.title.slice(1)}.` : `${podcast.title} tourne à plein régime.`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-ink">{episodes.length}</p>
          <p className="text-xs text-text-muted">épisode{episodes.length > 1 ? "s" : ""} au total</p>
        </div>
      </div>

      <PlanStrip
        planLabel={usage.planLabel}
        usageText={
          usage.limit === null
            ? "épisodes illimités"
            : `${usage.used}/${usage.limit} épisode${usage.limit > 1 ? "s" : ""} ${usage.periodLabel}`
        }
        upgradeable={usage.plan === "FREE" || usage.plan === "BASIC"}
      />
      <FeedbackBanner />
      {/* Une fois les six étapes cochées ("Podcasteur pro"), la checklist et le mode d'emploi disparaissent. */}
      {!allStepsDone && (
        <>
          <Checklist steps={steps} />
          <HowItWorks />
        </>
      )}

      <div className="grid grid-cols-3 gap-4 items-stretch">
        <div className="col-span-2 rounded-xl bg-mint p-6 flex flex-col">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-mint-ink text-white flex items-center justify-center shrink-0">
              <RhythmIcon />
            </div>
            <div>
              <p className="text-sm text-mint-muted">Ton rythme de publication</p>
              <p className="text-3xl font-bold text-mint-ink">
                {exportedThisMonth.length}{" "}
                <span className="text-base font-medium">
                  épisode{exportedThisMonth.length > 1 ? "s" : ""} ce mois-ci
                </span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-mint-ink/10">
            <div>
              <p className="text-lg font-bold text-mint-ink/40">-</p>
              <p className="text-xs text-mint-muted">Vues ce mois-ci (YouTube) · {STATS_UNAVAILABLE}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-mint-ink/40">-</p>
              <p className="text-xs text-mint-muted">Écoutes ce mois-ci (plateformes audio) · {STATS_UNAVAILABLE}</p>
            </div>
          </div>
        </div>

        {lastEpisode ? (
          <Link
            href={episodeHref(lastEpisode)}
            className="col-span-1 rounded-xl bg-peach p-6 flex flex-col hover:brightness-95 transition"
          >
            <p className="text-sm text-peach-muted mb-2">Ton dernier épisode</p>
            <div>
              <p className="font-semibold text-peach-ink">{episodeLabel(lastEpisode)}</p>
              <p className="text-sm text-peach-muted mt-3">Vues : {STATS_UNAVAILABLE}</p>
              <p className="text-sm text-peach-muted">Écoutes : {STATS_UNAVAILABLE}</p>
            </div>
          </Link>
        ) : (
          <div className="col-span-1 rounded-xl bg-peach p-6 flex flex-col">
            <p className="text-sm text-peach-muted mb-2">Ton dernier épisode</p>
            <p className="text-sm text-peach-muted">Aucun épisode publié pour le moment.</p>
          </div>
        )}
      </div>

      {nextEpisode ? (
        <Link
          href={episodeHref(nextEpisode)}
          className="rounded-xl bg-butter p-5 flex items-center justify-between gap-4 flex-wrap hover:brightness-95 transition"
        >
          <div>
            <p className="text-sm text-butter-ink/70 mb-1">Ta prochaine sortie</p>
            <p className="font-semibold text-butter-ink">{episodeLabel(nextEpisode)}</p>
            <p className="text-sm text-butter-ink/70">
              Sortie le {nextEpisode.releaseDate!.toLocaleDateString("fr-FR")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-pill bg-primary-button text-white text-sm font-bold px-4 py-1.5 whitespace-nowrap">
              {daysUntilLabel(daysUntil(nextEpisode.releaseDate!))}
            </span>
            <span className="rounded-pill bg-butter-ink text-white text-xs font-semibold px-3.5 py-1.5 whitespace-nowrap">
              {statusLabel(episodeDisplayStatus(nextEpisode, nextEpisode._count, prodEnabled))}
            </span>
          </div>
        </Link>
      ) : (
        <div className="rounded-xl bg-butter p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-butter-ink/70 mb-1">Ta prochaine sortie</p>
            <p className="text-sm text-butter-ink/70">
              Aucune sortie planifiée. Renseigne une date de sortie sur un épisode en cours pour la voir apparaître
              ici.
            </p>
          </div>
        </div>
      )}

      <GuestPool initialGuests={poolGuests} hasAccess={hasGuestsModule} />
    </main>
  );
}
