// Bindings the OAuth provider adds to `env` for the Worker's handlers. The
// generated worker-configuration.d.ts declares a global Env; this extends it.
interface Env {
  OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
  /** Optional (architecture §3): only the AI integrations read it, through core/ai.ts. */
  ANTHROPIC_API_KEY?: string;
  /** Optional (architecture §3): only exam files the app writes (ST-13c). */
  GITHUB_WRITE_TOKEN?: string;
}
