"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

export function AccountClient({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError(null);
    setEmailSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'enregistrement.");
      setEmailSaved(true);
      router.refresh();
    } catch (err) {
      setEmailError((err as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec du changement de mot de passe.");
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={saveEmail} className="space-y-2">
        <label className="block text-sm font-medium text-ink">Email</label>
        <div className="flex items-center gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailSaved(false);
            }}
            className={inputClass}
          />
          <button type="submit" disabled={savingEmail} className={pillBtn}>
            {savingEmail ? "..." : "Enregistrer"}
          </button>
        </div>
        {emailError && <p className="text-sm text-[#8A2E1F]">{emailError}</p>}
        {emailSaved && <p className="text-sm text-[#0F6B67]">Email mis à jour.</p>}
      </form>

      <form onSubmit={savePassword} className="space-y-2">
        <label className="block text-sm font-medium text-ink">Mot de passe</label>
        <input
          type="password"
          required
          placeholder="Mot de passe actuel"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Nouveau mot de passe (8 caractères min.)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={savingPassword} className={pillBtn}>
          {savingPassword ? "..." : "Changer le mot de passe"}
        </button>
        {passwordError && <p className="text-sm text-[#8A2E1F]">{passwordError}</p>}
        {passwordSaved && <p className="text-sm text-[#0F6B67]">Mot de passe changé.</p>}
      </form>
    </div>
  );
}
