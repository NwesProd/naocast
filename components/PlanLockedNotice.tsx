import Link from "next/link";

// Affiché à la place d'un module (Script, Invités...) quand le forfait de
// l'utilisateur ne l'inclut pas (cf. lib/plan.ts).
export function PlanLockedNotice({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-8 text-center space-y-3 max-w-md mx-auto mt-12">
      <p className="text-3xl">🔒</p>
      <h2 className="font-semibold text-ink">{moduleLabel} est réservé à naocast infinity</h2>
      <p className="text-sm text-text-muted">
        Passez à naocast infinity ou naocast lifetime pour débloquer ce module et tous les autres.
      </p>
      <Link
        href="/billing"
        className="inline-block rounded-pill bg-primary-button text-white text-sm font-semibold px-4 py-2 hover:opacity-90 transition"
      >
        Voir les forfaits
      </Link>
    </div>
  );
}
