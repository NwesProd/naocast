import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { validateAuthorizeParams } from "@/lib/oauthRequest";

// Page de consentement OAuth du connecteur Claude : l'utilisateur (connecté à naocast)
// autorise ou refuse l'accès de l'application (claude.ai) à son compte.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const get = (name: string) => (typeof sp[name] === "string" ? (sp[name] as string) : null);

  const session = await auth();
  if (!session?.user?.id) {
    const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }

  const request = await validateAuthorizeParams(get);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  const access = await getUserAccess(session.user.id);
  const allowed = hasModuleAccess(access.plan, "mcp", access.extraModules);

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-white p-6">
        <h1 className="text-2xl font-bold">naocast.</h1>

        {"error" in request ? (
          <p className="text-sm text-[#8A2E1F]">{request.error} Retournez dans Claude et relancez la connexion.</p>
        ) : !allowed ? (
          <p className="text-sm rounded-md bg-peach p-3 text-peach-ink">
            Le connecteur Claude est réservé à naocast infinity et naocast lifetime. Votre forfait actuel n&apos;y donne pas accès.
          </p>
        ) : (
          <form method="POST" action="/api/oauth/authorize" className="space-y-4">
            <input type="hidden" name="client_id" value={request.clientId} />
            <input type="hidden" name="redirect_uri" value={request.redirectUri} />
            <input type="hidden" name="code_challenge" value={request.codeChallenge} />
            <input type="hidden" name="code_challenge_method" value="S256" />
            {request.state && <input type="hidden" name="state" value={request.state} />}

            <p className="text-sm text-ink">
              <strong>{request.clientName}</strong> demande l&apos;accès à votre compte naocast ({user?.email}).
            </p>
            <ul className="text-sm text-text-muted list-disc pl-5 space-y-1">
              <li>Lire votre podcast, vos épisodes, vos transcripts, vos scripts et vos invités.</li>
              <li>Enregistrer un script, des messages aux invités et des mots clés d&apos;invités.</li>
            </ul>
            <p className="text-xs text-text-muted">
              Aucune suppression ni validation d&apos;épisode n&apos;est possible. Vous pourrez révoquer cet accès à tout moment dans Paramètres.
              Retour vers : {new URL(request.redirectUri).host}
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                name="decision"
                value="approve"
                className="flex-1 text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110"
              >
                Autoriser
              </button>
              <button
                type="submit"
                name="decision"
                value="deny"
                className="flex-1 text-sm font-semibold rounded-[10px] bg-white border border-border text-ink px-4 py-2 hover:bg-[#FAFAF8]"
              >
                Refuser
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
