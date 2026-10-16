// Bindings the OAuth provider adds to `env` for the Worker's handlers. The
// generated worker-configuration.d.ts declares a global Env; this extends it.
interface Env {
  OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
}
