"use client";

import { useRef, useState } from "react";

const inputClass = "w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";

// Champ d'adresse avec suggestions (API Adresse du gouvernement, adresses en France, sans clé).
// Les suggestions apparaissent après 3 caractères ; choisir une suggestion l'enregistre aussitôt,
// taper librement reste possible (autre pays, lieu sans adresse). Le nom du lieu se garde : tout ce
// qui précède la dernière virgule (« Le Studio Unique, ») est conservé, seule l'adresse qui suit est
// cherchée puis remplacée.
const splitAtLastComma = (text: string): { prefix: string; query: string } => {
  const i = text.lastIndexOf(",");
  return i === -1 ? { prefix: "", query: text } : { prefix: text.slice(0, i + 1) + " ", query: text.slice(i + 1).trimStart() };
};

export function AddressInput({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  function search(query: string) {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      requestId.current += 1;
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const id = ++requestId.current;
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query.trim())}&limit=5&autocomplete=1`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { features?: { properties?: { label?: string } }[] };
        if (id !== requestId.current) return;
        setSuggestions((data.features ?? []).map((f) => f.properties?.label ?? "").filter(Boolean));
        setActive(-1);
      } catch {
        if (id === requestId.current) setSuggestions([]);
      }
    }, 300);
  }

  function pick(label: string) {
    requestId.current += 1;
    setSuggestions([]);
    const full = splitAtLastComma(value).prefix + label;
    onChange(full);
    onCommit(full);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="address-suggestions"
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          search(splitAtLastComma(e.target.value).query);
        }}
        onKeyDown={(e) => {
          if (suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setSuggestions([]);
          }
        }}
        onBlur={() => {
          requestId.current += 1;
          setSuggestions([]);
          onCommit(value);
        }}
        className={inputClass}
      />
      {suggestions.length > 0 && (
        <ul id="address-suggestions" role="listbox" className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-white text-sm">
          {suggestions.map((label, i) => (
            <li key={label} role="option" aria-selected={i === active}>
              {/* onMouseDown plutôt que onClick : le champ perdrait le focus (et fermerait la liste) avant le clic. */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(label);
                }}
                className={`block w-full px-3 py-2 text-left text-ink hover:bg-[#FAFAF8] ${i === active ? "bg-[#FAFAF8]" : ""}`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
