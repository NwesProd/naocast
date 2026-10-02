"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Connexion impossible.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-card admin-login-card">
      <div className="admin-brand" style={{ padding: 0, marginBottom: 24 }}>
        naocast.
        <small>back office</small>
      </div>
      {error && (
        <p className="admin-message error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-field">
        <label className="admin-label" htmlFor="admin-email">
          email
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="username"
          className="admin-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="admin-password">
          mot de passe
        </label>
        <input
          id="admin-password"
          type="password"
          required
          autoComplete="current-password"
          className="admin-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button type="submit" disabled={loading} className="admin-btn primary" style={{ width: "100%" }}>
        {loading ? "connexion..." : "me connecter"}
      </button>
    </form>
  );
}
