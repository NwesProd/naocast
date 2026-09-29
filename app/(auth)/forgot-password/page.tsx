"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Mot de passe oublié</h1>

        {sent ? (
          <p className="text-sm text-text">
            Si un compte existe avec cet email, un lien de réinitialisation vient d&apos;être envoyé.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-text-muted">
              Indiquez votre email, vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Envoi..." : "Envoyer le lien"}
            </Button>
          </form>
        )}

        <p className="text-sm text-text-muted">
          <Link href="/login" className="underline text-primary-button">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
