interface Env {
 /** Server-only optional credentials. Configure with Cloudflare secrets; never NEXT_PUBLIC variables. */
 X_BEARER_TOKEN?: string;
 GITHUB_PUBLIC_TOKEN?: string;
}
