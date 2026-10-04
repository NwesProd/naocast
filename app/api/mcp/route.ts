import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpRequest } from "@/lib/apiTokens";
import { createNaocastMcpServer } from "@/lib/mcp/server";
import { protectedResourceMetadataUrl } from "@/lib/oauth";

// Serveur MCP du connecteur Claude (cf. lib/mcp/server.ts). Sans session côté
// serveur : chaque requête est authentifiée par la clé personnelle de
// l'utilisateur ("Authorization: Bearer nao_...") et traitée isolément.
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: auth.message }, id: null }), {
      status: auth.status,
      headers: { "Content-Type": "application/json", ...(auth.status === 401
          ? {
              // Indique aux connecteurs (claude.ai) où démarrer la connexion OAuth.
              "WWW-Authenticate": `Bearer realm="naocast"${auth.expired ? ', error="invalid_token"' : ""}, resource_metadata="${protectedResourceMetadataUrl()}"`,
            }
          : {}),
      },
    });
  }

  const server = createNaocastMcpServer({ userId: auth.userId, plan: auth.plan, extraModules: auth.extraModules });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
