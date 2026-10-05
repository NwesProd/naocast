// Ouvre une page externe qui refuse d'être affichée dans un cadre (paiement Stripe...). Dans le
// back office nwes, l'app tourne dans un cadre : on navigue alors sur la page entière, à défaut
// dans un nouvel onglet.
export function goExternal(url: string): void {
  if (window.self !== window.top) {
    try {
      window.top!.location.href = url;
      return;
    } catch {
      window.open(url, "_blank", "noopener");
      return;
    }
  }
  window.location.assign(url);
}
