// The MCP endpoint's handler. OAuthProvider has already checked the access
// token when a request gets here. The server itself arrives with F-15.
export const mcpHandler = {
  fetch(): Response {
    return Response.json({ error: "mcp_not_ready" }, { status: 501 });
  },
} satisfies ExportedHandler<Env>;
