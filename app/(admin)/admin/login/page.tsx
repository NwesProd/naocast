import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { AdminLoginForm } from "./AdminLoginForm";

// Connexion du back office : indépendante de celle de l'app (cf. lib/admin.ts).
export default async function AdminLoginPage() {
  if (await getAdminUser()) redirect("/admin");

  return (
    <div className="admin-root admin-login">
      <AdminLoginForm />
    </div>
  );
}
