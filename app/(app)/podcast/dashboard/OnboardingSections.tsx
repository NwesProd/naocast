import Link from "next/link";
import { NewEpisodeButton } from "@/app/(app)/dashboard/NewEpisodeButton";
import { OpenFeedbackButton } from "@/components/OpenFeedbackButton";

// Sections "mode d'emploi" du dashboard du podcast : bandeau du forfait, invitation à
// donner son avis, checklist de démarrage (la prochaine étape mise en avant) et
// "Comment naocast travaille pour toi".

export interface ChecklistStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string } | { label: string; createEpisode: true };
}

const LEVELS: { min: number; label: string }[] = [
  { min: 6, label: "Podcasteur pro" },
  { min: 5, label: "Confirmé" },
  { min: 3, label: "En route" },
  { min: 0, label: "Débutant" },
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ctaClass =
  "inline-flex shrink-0 items-center gap-1 rounded-[10px] bg-primary-button px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110";

export function PlanStrip({ planLabel, usageText, upgradeable }: { planLabel: string; usageText: string; upgradeable: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-5 py-3 text-sm">
      <p>
        <span className="font-semibold text-ink">{planLabel}</span>
        <span className="text-text-muted"> · {usageText}</span>
      </p>
      {upgradeable && (
        <Link href="/billing" className="shrink-0 font-semibold underline text-primary-button">
          Gérer mon forfait
        </Link>
      )}
    </div>
  );
}

export function FeedbackBanner() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-5 py-3">
      <p className="flex items-center gap-3 text-sm text-ink">
        <span className="text-lg" aria-hidden="true">
          🎁
        </span>
        <span>
          Un bug, une idée, une envie ? <strong>Dis-nous ce qui t&apos;aiderait</strong> : on lit tout, et ça fait avancer naocast.
        </span>
      </p>
      <OpenFeedbackButton>Donner mon avis</OpenFeedbackButton>
    </div>
  );
}

export function Checklist({ steps }: { steps: ChecklistStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const level = LEVELS.find((l) => doneCount >= l.min)!.label;
  const currentKey = steps.find((s) => !s.done)?.key;

  return (
    <section className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink text-lg">Ta machine à podcast</h2>
          <span className="rounded-pill bg-mint px-3 py-1 text-xs font-semibold text-mint-ink">{level}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-[#EEEAE4]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
            <div className="h-full rounded-pill bg-primary-button transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-text-muted tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {steps.map((step) => {
          const current = step.key === currentKey;
          return (
            <li key={step.key} className={`flex items-center gap-4 px-5 py-3.5 ${current ? "bg-peach" : ""}`}>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  step.done ? "border-accent-teal bg-accent-teal text-white" : current ? "border-primary-button" : "border-border"
                }`}
                aria-hidden="true"
              >
                {step.done && <CheckIcon />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-text-muted line-through" : "text-ink"}`}>{step.title}</p>
                {!step.done && <p className="text-xs text-text-muted mt-0.5">{step.description}</p>}
              </div>
              {current &&
                ("createEpisode" in step.cta ? (
                  <NewEpisodeButton label={`${step.cta.label} →`} align="start" />
                ) : (
                  <Link href={step.cta.href} className={ctaClass}>
                    {step.cta.label} →
                  </Link>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HOW_IT_WORKS = [
  { n: 1, bg: "bg-mint", ink: "text-mint-ink", muted: "text-mint-muted", title: "Tu déposes", text: "Importe tes rushs, en fichier ou en lien. Une caméra, plusieurs, peu importe." },
  { n: 2, bg: "bg-sky", ink: "text-sky-ink", muted: "text-sky-muted", title: "naocast prépare", text: "Transcript, locuteurs, silences et ratés repérés par l'IA. Tu n'as plus qu'à valider." },
  { n: 3, bg: "bg-butter", ink: "text-butter-ink", muted: "text-butter-ink/70", title: "Tu ajustes", text: "Coupes, intro, génériques et logo, avec un aperçu rapide avant le rendu final." },
  { n: 4, bg: "bg-peach", ink: "text-peach-ink", muted: "text-peach-muted", title: "Tu diffuses", text: "Vidéo et audio finaux à télécharger, prêts à publier. Tu gardes la main de bout en bout." },
];

export function HowItWorks() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-ink text-lg">Comment naocast travaille pour toi</h2>
        <p className="text-sm text-text-muted">Moins de montage, plus de temps pour ce qui compte : enregistrer et raconter.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {HOW_IT_WORKS.map((s) => (
          <div key={s.n} className={`rounded-xl ${s.bg} p-5`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold ${s.ink}`}>{s.n}</span>
            <p className={`mt-3 font-semibold ${s.ink}`}>{s.title}</p>
            <p className={`mt-1 text-sm ${s.muted}`}>{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
