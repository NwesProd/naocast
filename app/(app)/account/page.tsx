import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { appUrl } from "@/lib/email";
import { AccountClient } from "./AccountClient";
import { McpConnector } from "./McpConnector";

// Module "Paramètres" (sidebar, en bas) : informations de compte (email,
// mot de passe), distinct de l'onglet "Paramètres" de /podcast (ADN du
// podcast) qui concerne le podcast, pas le compte utilisateur.
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { email: true } });

  const access = await getUserAccess(session.user.id);
  const hasMcp = hasModuleAccess(access.plan, "mcp", access.extraModules);
  return (
    <main className="p-8 max-w-2xl w-full mx-auto space-y-10">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold mb-1">Paramètres</h1>
        <p className="text-sm text-text-muted mb-6">Informations de connexion à votre compte naocast.</p>
        <AccountClient currentEmail={user.email} />
      </div>
      <McpConnector hasAccess={hasMcp} mcpUrl={`${appUrl()}/api/mcp`} />
    </main>
  );
}
