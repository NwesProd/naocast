// Toujours en ton plein (jamais pastel) : le badge doit trancher sur le
// panneau de zone pastel qui l'entoure.
const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: "Brouillon", bg: "#EEEAE4", text: "#57524B" },
  QUEUED: { label: "En traitement", bg: "#0F6B67", text: "#FFFFFF" },
  PROCESSING: { label: "En traitement", bg: "#0F6B67", text: "#FFFFFF" },
  READY_FOR_REVIEW: { label: "Prêt pour relecture", bg: "#EEEAE4", text: "#57524B" },
  EXPORTED: { label: "Publié", bg: "#1F2A2E", text: "#FFFFFF" },
  HUMAN_EDITOR_REQUESTED: { label: "Chez le monteur", bg: "#E85A2A", text: "#FFFFFF" },
  // Affichés une fois tous les modules de post-production validés (cf. displayStatus, lib/moduleProgress.ts).
  READY_TO_PUBLISH: { label: "Prêt à diffuser", bg: "#2E7D4F", text: "#FFFFFF" },
  PUBLISHED: { label: "Diffusé", bg: "#1F2A2E", text: "#FFFFFF" },
  FAILED: { label: "Échec", bg: "#8A2E1F", text: "#FFFFFF" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, bg: "#EEEAE4", text: "#57524B" };
  return (
    <span
      className="inline-block rounded-pill px-3.5 py-1.5 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
