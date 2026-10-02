import type { Plan } from "@/app/generated/prisma/client";
import { PLAN_LABELS } from "@/lib/plan";

type Tone = "neutral" | "blue" | "orange" | "success" | "danger";

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`admin-pill ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

const PLAN_TONE: Record<Plan, Tone> = { FREE: "neutral", BASIC: "blue", INFINITY: "orange", LIFETIME: "success" };

export function PlanPill({ plan }: { plan: Plan }) {
  return <Pill tone={PLAN_TONE[plan]}>{PLAN_LABELS[plan]}</Pill>;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  QUEUED: { label: "En attente", tone: "blue" },
  PROCESSING: { label: "En cours", tone: "blue" },
  READY_FOR_REVIEW: { label: "En relecture", tone: "orange" },
  EXPORTED: { label: "Validé", tone: "success" },
  HUMAN_EDITOR_REQUESTED: { label: "Monteur humain", tone: "blue" },
  FAILED: { label: "Échec", tone: "danger" },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Poids de fichiers : 1 Go = 1024 Mo, un chiffre après la virgule au-delà du Ko.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// Barres sur 30 jours (échelle relative au max de la période). Le libellé
// complet est dans le title de chaque barre (survol), et le texte alternatif
// résume le total pour les lecteurs d'écran.
export function DailyBars({ points, label }: { points: { date: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="admin-bars" role="img" aria-label={`${label} : ${total} sur 30 jours`}>
      {points.map((p) => (
        <div
          key={p.date}
          className={`admin-bar ${p.count === 0 ? "empty" : ""}`}
          style={{ height: p.count === 0 ? "2px" : `${Math.max(6, (p.count / max) * 100)}%` }}
          title={`${new Date(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} : ${p.count}`}
        />
      ))}
    </div>
  );
}
