"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!token) {
      setError("Lien de réinitialisation invalide.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Impossible de réinitialiser le mot de passe.");
      return;
    }

    router.push("/login");
  }

  if (!token) {
    return <p className="text-sm text-[#8A2E1F]">Lien de réinitialisation manquant ou invalide.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      <input
        type="password"
        required
        minLength={8}
        placeholder="Nouveau mot de passe (8 caractères min.)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Confirmer le mot de passe"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={inputClass}
      />
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enregistrement..." : "Choisir ce mot de passe"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
        <p className="text-sm text-text-muted">
          <Link href="/login" className="underline text-primary-button">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
