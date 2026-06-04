import { IS_DESKTOP, openExternal, API_BASE } from "@/lib/desktop";
import { apiPost } from "@/api/client";

/**
 * Start the "link a Discord/Shard account" OAuth flow.
 *
 * On the web, the API endpoint is a normal redirect, just navigate the
 * tab to it and the user lands back on /account after Discord OAuth.
 *
 * On the desktop (Tauri), the redirect can't run inside the webview:
 * the SPA loads from tauri://localhost and the API session lives on
 * shardtwn.fr (Bearer-authed). So we ask the server for a one-time
 * bridge URL (`/api/account/oauth-bridge/init`), open it in the system
 * browser, and let the user complete the flow there, the server's
 * callback then fires a `shardtwn://open/account?linked=ok` deep link
 * to bring focus back to the desktop app.
 */
export async function startOAuthLink(provider: "discord" | "shard"): Promise<void> {
  if (!IS_DESKTOP) {
    window.location.href = `${API_BASE}/api/account/${provider}/link`;
    return;
  }
  const r = await apiPost<{ url: string }>("/api/account/oauth-bridge/init", { provider });
  await openExternal(r.url);
}
