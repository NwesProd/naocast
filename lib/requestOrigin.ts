// Adresse publique à utiliser pour les liens de retour (Stripe...) : celle sur laquelle
// l'utilisateur se trouve, pour qu'il revienne au même endroit (notamment dans le cadre du back
// office nwes, sur EMBED_HOST). Seuls les domaines connus sont acceptés, jamais un en-tête Host
// arbitraire : sinon un lien de paiement pourrait renvoyer vers un site tiers.
export function requestOrigin(req: Request): string {
  const base = (process.env.NEXTAUTH_URL || req.headers.get("origin") || "http://localhost:3000").replace(/\/$/, "");
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  const known = [process.env.NEXTAUTH_URL, process.env.EMBED_HOST, process.env.ADMIN_HOST]
    .filter((v): v is string => !!v)
    .map((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase());
  if (host && known.includes(host)) {
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return base;
}
