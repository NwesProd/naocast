import { NextResponse } from "next/server";
import { AdminError, requireAdmin } from "@/lib/admin";

// Enveloppe des routes /api/admin : vérifie l'accès admin AVANT toute autre
// chose et répond 403 en JSON sinon (le layout de /admin ne couvre pas les
// routes API, chacune doit se protéger elle-même).
export function withAdmin<Ctx>(
  handler: (req: Request, ctx: Ctx, admin: { id: string; email: string }) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const admin = await requireAdmin();
      return await handler(req, ctx, admin);
    } catch (err) {
      if (err instanceof AdminError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  };
}
