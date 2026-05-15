import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onDeepLink } from "@/lib/desktop";

/**
 * Listens to `shardtwn://` URLs and routes them inside the SPA.
 *
 * Supported actions (extend as needed):
 * - `shardtwn://open/guild/<guildId>` → navigate to that guild's panel
 * - `shardtwn://open/account` → open the account page
 * - `shardtwn://activate?token=<jwt>` → forward token to /api/account/activate
 *
 * Anything else is logged and ignored. Cold-launch URLs are surfaced too —
 * `onDeepLink` re-emits whatever URL opened the app initially.
 *
 * Mounted once at the App level inside PersistentOverlays. Desktop-only.
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    onDeepLink(rawUrl => {
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== "shardtwn:") return;

        // `URL` parses shardtwn://open/account as
        //   protocol: "shardtwn:" / host: "open" / pathname: "/account"
        // We treat `host` as the action and `pathname` as its target.
        const action = u.host;
        const target = u.pathname.replace(/^\/+/, "");

        switch (action) {
          case "open": {
            // Forward the deep link's query string so callbacks can carry
            // status flags (e.g. shardtwn://open/account?linked=ok&provider=discord).
            const search = u.search || "";
            if (target.startsWith("guild/")) {
              const id = target.slice("guild/".length);
              if (/^\d+$/.test(id)) navigate(`/shard/guild/${id}${search}`);
              return;
            }
            if (target === "account") { navigate(`/account${search}`); return; }
            if (target === "preferences") { navigate(`/preferences${search}`); return; }
            if (target === "outils" || target === "") { navigate(`/outils${search}`); return; }
            console.warn("[deep-link] unknown open target:", target);
            return;
          }

          case "activate": {
            // Fire-and-forget POST. The server-side handler returns the
            // updated session and we hard-reload so the auth context picks
            // it up cleanly.
            const token = u.searchParams.get("token");
            if (!token) return;
            void fetch("/api/account/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            }).then(() => window.location.reload());
            return;
          }

          default:
            console.warn("[deep-link] unknown action:", action);
        }
      } catch (e) {
        console.warn("[deep-link] parse failed:", rawUrl, e);
      }
    }).then(unlisten => {
      if (cancelled) unlisten();
      else cleanup = unlisten;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate]);

  return null;
}
