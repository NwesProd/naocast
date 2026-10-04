"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

// Contexte de ExternalGate : prévient la porte quand la validation change, pour
// qu'elle masque ou ré-affiche le tunnel du module.
const GateContext = createContext<((validated: boolean) => void) | null>(null);

// `warning` : conséquence à connaître avant de valider (affichée tant que ce n'est pas validé).
type Wording = { ask: string; validated: string; button: string; warning?: string };

// Module validé hors naocast : son tunnel est masqué (seule la carte "Retirer la
// validation" reste) ; la retirer le fait réapparaître. `showCardWhenOpen` garde la
// carte sous le tunnel (Intro) ; sinon c'est le tunnel qui l'affiche lui-même (Montage).
export function ExternalGate({
  episodeId,
  field,
  wording,
  initialValidated,
  showCardWhenOpen = false,
  children,
}: {
  episodeId: string;
  field: "introValidatedExternally" | "montageValidatedExternally";
  wording: Wording;
  initialValidated: boolean;
  showCardWhenOpen?: boolean;
  children: React.ReactNode;
}) {
  const [validated, setValidated] = useState(initialValidated);

  return (
    <GateContext.Provider value={setValidated}>
      {validated ? (
        <ExternalValidation key="validated" episodeId={episodeId} field={field} wording={wording} initialValidated />
      ) : (
        <>
          {children}
          {showCardWhenOpen && <ExternalValidation key="open" episodeId={episodeId} field={field} wording={wording} initialValidated={false} />}
        </>
      )}
    </GateContext.Provider>
  );
}

// Pour qui fait une partie de sa post-production en dehors de naocast :
// "valider hors naocast" allume simplement le tick vert du module dans la
// sidebar, sans en passer par le module ni changer le statut de l'épisode.
// Réversible à tout moment.
export function ExternalValidation({
  episodeId,
  field,
  wording,
  initialValidated,
}: {
  episodeId: string;
  field: "introValidatedExternally" | "montageValidatedExternally";
  // Libellés accordés au module (intro : féminin, montage : masculin).
  wording: Wording;
  initialValidated: boolean;
}) {
  const router = useRouter();
  const gate = useContext(GateContext);
  const [validated, setValidated] = useState(initialValidated);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !validated }),
      });
      if (!res.ok) throw new Error("Impossible d'enregistrer, réessayez.");
      setValidated(!validated);
      gate?.(!validated);
      // La sidebar garde son propre état de l'épisode : ce signal lui fait
      // recharger l'épisode pour afficher (ou retirer) le tick tout de suite.
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-white p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-ink">
          {validated ? wording.validated : wording.ask}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          {validated
            ? "Le tick vert s'affiche dans la barre latérale. Retirez la validation pour faire réapparaître le tunnel."
            : "Validez-le sans passer par le module : le tick vert s'affichera dans la barre latérale."}
        </p>
        {!validated && wording.warning && <p className="text-xs text-[#8A5300] mt-1">{wording.warning}</p>}
        {error && <p className="text-xs text-[#8A2E1F] mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-sm font-semibold rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50"
      >
        {busy ? "..." : validated ? "Retirer la validation" : wording.button}
      </button>
    </div>
  );
}
