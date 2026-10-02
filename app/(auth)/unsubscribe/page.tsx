"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";

function UnsubscribeForm() {
  const params = useSearchParams();
  const userId = params.get("u");
  const token = params.get("t");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleUnsubscribe() {
    setState("loading");
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, token }),
    });
    setState(res.ok ? "done" : "error");
  }

  if (!userId || !token || state === "error") {
    return <p className="text-sm text-[#8A2E1F]">Lien de désinscription invalide.</p>;
  }
  if (state === "done") {
    return (
      <p className="text-sm text-text-muted">
        C&apos;est fait : vous ne recevrez plus nos actualités. Les emails liés à votre compte (mot de passe, connexion)
        continueront d&apos;arriver.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Confirmez-vous ne plus vouloir recevoir les actualités de naocast. ?</p>
      <Button type="button" onClick={handleUnsubscribe} disabled={state === "loading"} className="w-full">
        {state === "loading" ? "..." : "Me désinscrire"}
      </Button>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">naocast.</h1>
        <Suspense>
          <UnsubscribeForm />
        </Suspense>
      </div>
    </main>
  );
}
