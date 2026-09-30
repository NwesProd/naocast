"use client";

import { useState, cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";

interface Tab {
  key: string;
  label: string;
  content: ReactNode;
  // Si renseigné, `content` reçoit une prop `onFirstSave` qui bascule vers
  // l'onglet désigné ici (cf. PodcastDnaForm : premier enregistrement de
  // l'ADN -> bascule automatique sur "Graphisme").
  switchToOnFirstSave?: string;
}

// "Mon podcast" : Paramètres (positionnement, bible) / Graphisme (pochette,
// logo, génériques), deux préoccupations distinctes, chacune avec son propre
// formulaire et son propre enregistrement plutôt qu'un unique gros formulaire.
export function PodcastTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].key);

  return (
    <div>
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              active === tab.key
                ? "border-primary-button text-ink"
                : "border-transparent text-text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} className={active === tab.key ? "" : "hidden"}>
          {tab.switchToOnFirstSave && isValidElement(tab.content)
            ? cloneElement(tab.content as ReactElement<{ onFirstSave?: () => void }>, {
                onFirstSave: () => setActive(tab.switchToOnFirstSave!),
              })
            : tab.content}
        </div>
      ))}
    </div>
  );
}
