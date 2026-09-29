"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/Button";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

const PROFILE_TYPES = [
  { value: "PODCASTEUR", label: "Podcasteur" },
  { value: "MONTEUR", label: "Monteur" },
  { value: "AGENCE", label: "Agence" },
  { value: "AUTRE", label: "Autre" },
] as const;

// Étape 1 du parcours utilisateur : inscription.
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileType, setProfileType] = useState<(typeof PROFILE_TYPES)[number]["value"]>("PODCASTEUR");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, profileType }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Impossible de créer le compte.");
      setLoading(false);
      return;
    }

    await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    router.push("/podcast");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">naocast.</h1>
        {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

        <div>
          <label className="block text-sm font-medium mb-1 text-ink">Je suis</label>
          <select
            value={profileType}
            onChange={(e) => setProfileType(e.target.value as typeof profileType)}
            className={inputClass}
          >
            {PROFILE_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Mot de passe (8 caractères min.)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer mon compte"}
        </Button>
        <p className="text-sm text-text-muted">
          Déjà un compte ? <Link href="/login" className="underline text-primary-button">Connexion</Link>
        </p>
      </form>
    </main>
  );
}
