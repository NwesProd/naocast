"use client";

import { useState } from "react";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

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

// Carte "Connecteur Claude" des Paramètres : clés personnelles pour brancher son
// Claude (Desktop ou Code) sur son compte naocast (serveur MCP, cf. app/api/mcp).
export function McpConnector({ hasAccess, mcpUrl, initialTokens }: { hasAccess: boolean; mcpUrl: string; initialTokens: TokenRow[] }) {
  const [tokens, setTokens] = useState<TokenRow[]>(initialTokens);
  const [name, setName] = useState("Claude");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de créer la clé.");
      setNewToken(data.token);
      const list = await fetch("/api/account/mcp-tokens").then((r) => r.json());
      setTokens(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    const res = await fetch(`/api/account/mcp-tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Impossible de révoquer la clé.");
      return;
    }
    setTokens((t) => t.filter((x) => x.id !== id));
  }

  const key = newToken ?? "VOTRE_CLE";
  const claudeCode = `claude mcp add --transport http naocast ${mcpUrl} --header "Authorization: Bearer ${key}"`;
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        naocast: {
          command: "npx",
          args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:${NAOCAST_AUTH}"],
          env: { NAOCAST_AUTH: `Bearer ${key}` },
        },
      },
    },
    null,
    2
  );

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
        <>
          <div className="rounded-md border border-border bg-[#FAFAF8] p-3 space-y-2">
            <p className="text-sm font-medium text-ink">Dans claude.ai ou l&apos;app Claude (le plus simple)</p>
            <ol className="list-decimal pl-5 text-sm text-text-muted space-y-1">
              <li>Ouvrez Paramètres, puis Connecteurs, puis « Ajouter un connecteur personnalisé ».</li>
              <li>Donnez-lui le nom « naocast » et collez l&apos;adresse du serveur ci-dessous.</li>
              <li>Cliquez sur « Connecter » : une page naocast vous demande d&apos;autoriser l&apos;accès, sans clé à copier.</li>
            </ol>
            <CopyBlock label="Adresse du serveur" value={mcpUrl} />
          </div>

          {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

          <p className="text-sm font-medium text-ink pt-2">Connexions et clés personnelles</p>
          <form onSubmit={create} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="mcp-name" className="block text-xs font-medium text-text-muted mb-1">
                Nom de la clé
              </label>
              <input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40"
            >
              {creating ? "Création..." : "Créer une clé"}
            </button>
          </form>

          {newToken && (
            <div className="rounded-md border border-border bg-mint p-3 space-y-2">
              <p className="text-sm font-medium text-mint-ink">Votre clé (affichée une seule fois, copiez-la maintenant) :</p>
              <CopyBlock label="Clé personnelle" value={newToken} />
            </div>
          )}

          {tokens.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{t.name}</p>
                    <p className="text-xs text-text-muted">
                      {t.prefix}… · créée le {new Date(t.createdAt).toLocaleDateString("fr-FR")} ·{" "}
                      {t.lastUsedAt ? `utilisée le ${new Date(t.lastUsedAt).toLocaleDateString("fr-FR")}` : "jamais utilisée"}
                    </p>
                  </div>
                  <button type="button" onClick={() => revoke(t.id)} className={`${pillBtn} text-[#8A2E1F]`}>
                    Révoquer
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Autres façons de brancher (avec une clé)</p>
            <CopyBlock label="Claude Code (terminal)" value={claudeCode} />
            <CopyBlock label="Claude Desktop (fichier claude_desktop_config.json, nécessite Node.js)" value={claudeDesktop} />
            <p className="text-xs text-text-muted">
              Créez d&apos;abord une clé : elle est insérée automatiquement dans les commandes ci-dessus. Une connexion ou une clé révoquée
              cesse de fonctionner immédiatement.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
