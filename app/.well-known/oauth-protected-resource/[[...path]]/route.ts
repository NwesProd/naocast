import { baseUrl, mcpResourceUrl, CORS_HEADERS } from "@/lib/oauth";

// RFC 9728 : indique aux connecteurs MCP quel serveur d'autorisation protège /api/mcp.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { resource: mcpResourceUrl(), authorization_servers: [baseUrl()], bearer_methods_supported: ["header"], resource_name: "naocast" },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
