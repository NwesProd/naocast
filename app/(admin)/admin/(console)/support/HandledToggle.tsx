"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Marque un retour comme traité (ou à traiter).
export function HandledToggle({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled: !handled }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="admin-btn secondary small" onClick={toggle} disabled={busy}>
      {handled ? "Remettre à traiter" : "Marquer traité"}
    </button>
  );
}
