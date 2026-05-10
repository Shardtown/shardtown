import { useMemo } from "react";
import { useAuth, avatarUrl } from "@/api/auth";

/**
 * Discord-style message preview, used for live-rendering of welcome
 * messages, embed builder output, and any text that uses Discord's
 * substitution variables ({user}, {memberCount}, …).
 *
 * Variables supported (subset, matches what the bots render server-side):
 *   {user}         → @username (clickable mention style)
 *   {user.name}    → username plain
 *   {server}       → guild name
 *   {memberCount}  → guild member count (formatted with thin space)
 *
 * Pass `serverName` and `memberCount` from the parent so the preview
 * uses real data.
 */

interface PreviewProps {
  /** Raw template text. Plain text or Markdown-light. */
  text: string;
  /** Embed object — when present, renders below the message. */
  embed?: {
    title?: string;
    description?: string;
    color?: string; // CSS color or hex
    image?: string;
    thumbnail?: string;
    footer?: string;
  } | null;
  /** Optional context. Defaults are sensible for testing. */
  serverName?: string;
  memberCount?: number;
  /** Override author display — defaults to the logged-in user. */
  authorName?: string;
  authorAvatar?: string;
}

export function DiscordPreview({
  text,
  embed,
  serverName = "Mon serveur",
  memberCount = 1234,
  authorName,
  authorAvatar,
}: PreviewProps) {
  const { user } = useAuth();

  const displayName = authorName ?? user?.global_name ?? user?.username ?? "Utilisateur";
  const avatar = authorAvatar ?? (user ? avatarUrl(user, 64) : null);

  const rendered = useMemo(
    () => substitute(text, displayName, serverName, memberCount),
    [text, displayName, serverName, memberCount],
  );

  const embedColor = (embed?.color || "").trim() || "#5865f2";
  const renderedEmbedTitle = embed?.title
    ? substitute(embed.title, displayName, serverName, memberCount)
    : "";
  const renderedEmbedDescription = embed?.description
    ? substitute(embed.description, displayName, serverName, memberCount)
    : "";

  return (
    <div className="discord-preview">
      <div className="dp-message">
        <div className="dp-avatar">
          {avatar ? <img src={avatar} alt="" /> : <div className="dp-avatar-fallback">{displayName[0]?.toUpperCase()}</div>}
        </div>
        <div className="dp-content">
          <div className="dp-header">
            <span className="dp-author">{displayName}</span>
            <span className="dp-time">aujourd'hui à {fmtTime()}</span>
          </div>
          {rendered && <div className="dp-text">{linkify(rendered)}</div>}

          {embed && (embed.title || embed.description || embed.image || embed.thumbnail) && (
            <div className="dp-embed" style={{ borderLeftColor: embedColor }}>
              <div className="dp-embed-body">
                {renderedEmbedTitle && <div className="dp-embed-title">{linkify(renderedEmbedTitle)}</div>}
                {renderedEmbedDescription && (
                  <div className="dp-embed-desc">{linkify(renderedEmbedDescription)}</div>
                )}
                {embed.image && (
                  <div className="dp-embed-image">
                    <img src={embed.image} alt="" />
                  </div>
                )}
                {embed.footer && <div className="dp-embed-footer">{embed.footer}</div>}
              </div>
              {embed.thumbnail && (
                <div className="dp-embed-thumb">
                  <img src={embed.thumbnail} alt="" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .discord-preview {
          background: #313338;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 14px;
          padding: 14px 16px 16px;
          color: #dbdee1;
          font-family: "gg sans", "Helvetica Neue", -apple-system, system-ui, sans-serif;
          font-size: 13.5px;
          line-height: 1.45;
        }
        .dp-message { display: flex; gap: 12px; align-items: flex-start; }
        .dp-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          flex-shrink: 0;
          overflow: hidden;
          background: #5865f2;
        }
        .dp-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .dp-avatar-fallback {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; color: white; font-size: 14px;
        }
        .dp-content { flex: 1; min-width: 0; }
        .dp-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
        .dp-author { color: #f2f3f5; font-weight: 500; font-size: 14px; }
        .dp-time { color: #949ba4; font-size: 11px; }
        .dp-text { color: #dbdee1; word-break: break-word; white-space: pre-wrap; }
        .dp-text a, .dp-mention { color: #00a8fc; }
        .dp-mention {
          background: rgba(88, 101, 242, 0.3);
          color: #c9cdfb;
          padding: 0 2px;
          border-radius: 3px;
        }

        .dp-embed {
          margin-top: 6px;
          background: #2b2d31;
          border-radius: 4px;
          border-left: 4px solid #5865f2;
          padding: 8px 12px;
          display: flex;
          gap: 12px;
          max-width: 520px;
        }
        .dp-embed-body { flex: 1; min-width: 0; }
        .dp-embed-title {
          color: #f2f3f5;
          font-weight: 600;
          font-size: 15px;
          margin-bottom: 4px;
        }
        .dp-embed-desc {
          color: #dbdee1;
          font-size: 13px;
          margin-bottom: 8px;
          white-space: pre-wrap;
        }
        .dp-embed-image { margin-top: 6px; }
        .dp-embed-image img {
          max-width: 100%;
          max-height: 260px;
          border-radius: 4px;
          display: block;
        }
        .dp-embed-thumb {
          width: 80px; height: 80px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .dp-embed-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .dp-embed-footer {
          color: #949ba4;
          font-size: 11px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}

function substitute(text: string, user: string, server: string, memberCount: number): string {
  return text
    .replace(/\{user\.name\}/g, user)
    .replace(/\{user\}/g, `__MENTION__${user}__/MENTION__`)
    .replace(/\{server\}/g, server)
    .replace(/\{memberCount\}/g, memberCount.toLocaleString("fr-FR"));
}

/**
 * Lightweight inline parser: converts our __MENTION__/__/MENTION__
 * placeholders to a styled span, and wraps URLs in clickable links.
 */
function linkify(s: string): React.ReactNode {
  const parts: Array<string | React.ReactNode> = [];
  let remaining = s;
  const mentionRe = /__MENTION__(.+?)__\/MENTION__/g;
  const urlRe = /(https?:\/\/[^\s]+)/g;

  // First split on mentions, then linkify URLs in the remaining text chunks.
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(remaining)) !== null) {
    if (m.index > last) parts.push(...splitUrls(remaining.slice(last, m.index), urlRe, parts.length));
    parts.push(<span key={`m${parts.length}`} className="dp-mention">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < remaining.length) parts.push(...splitUrls(remaining.slice(last), urlRe, parts.length));
  return parts;
}

function splitUrls(text: string, urlRe: RegExp, baseKey: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  urlRe.lastIndex = 0;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<a key={`u${baseKey}_${m.index}`} href={m[1]} onClick={e => e.preventDefault()}>{m[1]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function fmtTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
