import { requireAdminPage } from "@/lib/admin";
import { AdminNav } from "./AdminNav";

// Toutes les pages de la console passent par ce layout : le contrôle d'accès
// est fait ici côté serveur, avant tout rendu (session admin propre, cf.
// lib/admin.ts). Les routes /api/admin vérifient l'accès elles-mêmes.
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  return (
    <div className="admin-root">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          naocast.
          <small>back office</small>
        </div>
        <AdminNav />
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
