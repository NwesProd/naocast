"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/Button";

// La connexion n'a lieu qu'au clic sur le bouton, jamais au simple chargement
// de la page : les scanners de liens de certains clients mail ouvrent les URL
// automatiquement, une connexion déclenchée dès le chargement consommerait le
// lien (à usage unique) avant même que l'utilisateur ne le voie.
function MagicLoginForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const res = await signIn("magic-link", { token, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Ce lien est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.");
      return;
    }
    router.push("/podcast/dashboard");
    router.refresh();
  }

  if (!token) {
    return <p className="text-sm text-[#8A2E1F]">Lien de connexion manquant ou invalide.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Cliquez sur le bouton pour vous connecter à votre compte.</p>
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      <Button type="button" onClick={handleLogin} disabled={loading} className="w-full">
        {loading ? "Connexion..." : "Me connecter"}
      </Button>
      <p className="text-sm text-text-muted">
        <Link href="/login" className="underline text-primary-button">Retour à la connexion</Link>
      </p>
    </div>
  );
}

export default function MagicLoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">naocast.</h1>
        <Suspense>
          <MagicLoginForm />
        </Suspense>
      </div>
    </main>
  );
}
