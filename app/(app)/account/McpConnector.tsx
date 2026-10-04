"use client";

import { useState } from "react";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // copie impossible : l'utilisateur sélectionne le texte à la main
            }
          }}
          className={pillBtn}
        >
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-[#FAFAF8] p-3 text-xs text-ink">{value}</pre>
    </div>
  );
}

// Carte "Connecteur Claude" des Paramètres : explique comment ajouter naocast comme
// connecteur dans claude.ai (connexion OAuth, cf. app/api/mcp et lib/oauth.ts).
export function McpConnector({ hasAccess, mcpUrl }: { hasAccess: boolean; mcpUrl: string }) {
  return (
    <section className="rounded-xl bg-white border border-border p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Connecteur Claude</h2>
        <p className="text-sm text-text-muted mt-1">
          Branchez votre Claude sur votre compte naocast : il peut lire vos transcripts, votre script et vos invités, et enregistrer un script ou
          un message pour vous.
        </p>
      </div>

      {!hasAccess ? (
        <p className="text-sm rounded-md bg-peach p-3 text-peach-ink">Le connecteur Claude est réservé à naocast infinity et naocast lifetime.</p>
      ) : (
        <div className="rounded-md border border-border bg-[#FAFAF8] p-3 space-y-3">
          <ol className="list-decimal pl-5 text-sm text-text-muted space-y-1">
            <li>Dans Claude, ouvrez Paramètres, puis Connecteurs, puis « Ajouter un connecteur personnalisé ».</li>
            <li>Donnez-lui le nom « naocast » et collez l&apos;adresse du serveur ci-dessous.</li>
            <li>Cliquez sur « Connecter » : une page naocast vous demande d&apos;autoriser l&apos;accès.</li>
          </ol>
          <CopyBlock label="Adresse du serveur" value={mcpUrl} />
        </div>
      )}
    </section>
  );
}
