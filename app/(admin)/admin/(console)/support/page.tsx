import { requireAdminPage } from "@/lib/admin";

// Les tickets reçus arriveront ici (fonctionnalité à construire ensuite).
export default async function AdminSupportPage() {
  await requireAdminPage();

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">support</h1>
          <p className="admin-subtitle">Les tickets envoyés par les utilisateurs.</p>
        </div>
      </div>

      <div className="admin-card admin-empty">
        <h2 className="admin-section-title" style={{ marginBottom: 8 }}>
          pas encore de tickets
        </h2>
        <p style={{ margin: 0 }}>
          Cet espace accueillera les demandes de support (statut, réponse, historique par utilisateur) dès que la
          fonctionnalité sera construite.
        </p>
      </div>
    </>
  );
}
