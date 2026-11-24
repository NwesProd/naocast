"use client";

import { useEffect, useState } from "react";

type Item = { id: string; text: string; done: boolean };

const iconBtn = "flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-[#FAFAF8] hover:text-ink";

// Panneau « Checklist » à droite de l'écran, commun à tous les modules : tâches à cocher, repliable.
export function ChecklistPanel({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(true);
  const [hideDone, setHideDone] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      setOpen(localStorage.getItem("checklist-open") !== "0");
      setHideDone(localStorage.getItem("checklist-hide-done") === "1");
    } catch {}
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem("checklist-open", next ? "1" : "0"); } catch {}
  }
  function toggleHideDone() {
    const next = !hideDone;
    setHideDone(next);
    try { localStorage.setItem("checklist-hide-done", next ? "1" : "0"); } catch {}
  }

  const left = items.filter((i) => !i.done).length;
  const done = items.length - left;
  const visible = hideDone ? items.filter((i) => !i.done) : items;

  async function add() {
    const t = text.trim();
    if (!t) return;
    setText("");
    const res = await fetch("/api/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
    if (res.ok) {
      const item: Item = await res.json();
      setItems((l) => [...l, item]);
    } else {
      setText(t);
    }
  }
  async function check(id: string, value: boolean) {
    setItems((l) => l.map((i) => (i.id === id ? { ...i, done: value } : i)));
    await fetch(`/api/checklist/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: value }) });
  }
  async function remove(id: string) {
    setItems((l) => l.filter((i) => i.id !== id));
    await fetch(`/api/checklist/${id}`, { method: "DELETE" });
  }

  return (
    <aside
      aria-label="Checklist"
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-l border-border bg-white transition-[width] duration-200 lg:flex ${open ? "w-64" : "w-11"}`}
    >
      <div className={`flex h-11 shrink-0 items-center gap-2 ${open ? "border-b border-border px-3" : "justify-center"}`}>
        <button type="button" onClick={toggleOpen} aria-label={open ? "Replier la checklist" : "Déplier la checklist"} className={iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
            <path d={open ? "M9 10l2 2-2 2" : "M10 10l-2 2 2 2"} />
          </svg>
        </button>
        {open && <span className="flex-1 text-sm font-semibold text-ink">Checklist</span>}
        {open && left > 0 && <span className="rounded-pill bg-primary-button px-1.5 text-xs font-semibold text-white">{left}</span>}
      </div>

      {!open && left > 0 && (
        <button type="button" onClick={toggleOpen} aria-label={`${left} tâches à faire`} className="mx-auto mt-2 rounded-pill bg-primary-button px-1.5 text-xs font-semibold text-white">
          {left}
        </button>
      )}

      {open && (
        <>
          <ul className="flex-1 overflow-auto px-3 py-2">
            {visible.map((i) => (
              <li key={i.id} className="group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-[#FAFAF8]">
                <input type="checkbox" checked={i.done} onChange={(e) => check(i.id, e.target.checked)} className="mt-1 shrink-0 cursor-pointer" />
                <span className={`min-w-0 flex-1 break-words text-sm leading-snug ${i.done ? "text-text-muted line-through" : "text-ink"}`}>{i.text}</span>
                <button type="button" onClick={() => remove(i.id)} aria-label="Supprimer la tâche" className="text-text-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100">
                  ×
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-1 py-2 text-sm text-text-muted">{items.length === 0 ? "Aucune tâche pour l'instant." : "Toutes les tâches sont terminées."}</li>}
          </ul>
          {done > 0 && (
            <button type="button" onClick={toggleHideDone} className="px-4 pb-2 text-left text-xs text-text-muted hover:text-ink">
              {hideDone ? "Afficher" : "Masquer"} {done > 1 ? `les ${done} tâches terminées` : "la tâche terminée"}
            </button>
          )}
          <div className="shrink-0 border-t border-border p-3 pb-20">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Nouvelle tâche"
              aria-label="Nouvelle tâche"
              maxLength={300}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30"
            />
          </div>
        </>
      )}
    </aside>
  );
}
