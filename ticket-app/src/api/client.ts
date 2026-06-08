const BASE = '/api/support';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  me:             ()              => req<Me>('/me'),
  guilds:         ()              => req<Guild[]>('/guilds'),
  stats:          (gid: string, days?: number) => req<Stats>(`/stats/${gid}?days=${days ?? 30}`),
  tickets:        (gid: string, p: TicketsParams = {}) => req<TicketPage>(`/tickets/${gid}?${qs(p)}`),
  transcripts:    (gid: string, p: PageParams   = {}) => req<TranscriptPage>(`/transcripts/${gid}?${qs(p)}`),
  transcript:     (id: string)    => req<Transcript>(`/transcript/${id}`),
  config:         (gid: string)   => req<GuildConfig>(`/config/${gid}`),
  saveConfig:     (gid: string, body: Partial<GuildConfig>) => req<GuildConfig>(`/config/${gid}`, { method: 'PUT', body: JSON.stringify(body) }),
  channels:       (gid: string)   => req<DiscordChannel[]>(`/discord/channels/${gid}`),
  roles:          (gid: string)   => req<DiscordRole[]>(`/discord/roles/${gid}`),
  incidents:      (gid: string)   => req<Incident[]>(`/incidents/${gid}`),
};

function qs(p: Record<string, unknown>) {
  return Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('&');
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface Me { id: string; username: string; avatar: string; }

export interface Guild {
  id: string; name: string; icon: string | null; permissions: string;
}

export interface Ticket {
  id: string; guild_id: string; channel_id: string;
  author_id: string; author_pseudo: string | null;
  category: string; claimed_by: string[];
  closed_by: string | null;
  created_at: string; closed_at: string | null;
}

export interface TicketPage { tickets: Ticket[]; total: number; limit: number; offset: number; }
export interface TicketsParams extends PageParams { open?: boolean; }
export interface PageParams { limit?: number; offset?: number; }

export interface TranscriptSummary {
  id: string; guild_id: string; author_id: string; author_pseudo: string | null;
  category: string; claimed_by: string[]; created_at: string; closed_at: string;
}
export interface TranscriptPage { transcripts: TranscriptSummary[]; total: number; limit: number; offset: number; }

export interface Message {
  id: string; content: string; timestamp: number; edited: boolean;
  author: { id: string; username: string; displayName: string; avatarURL: string; isBot: boolean; };
  embeds: { title?: string; description?: string; color?: string; fields: { name: string; value: string; inline: boolean }[]; image?: string; thumbnail?: string; footer?: { text: string }; timestamp?: string; }[];
  attachments: { name: string; url: string; contentType: string; }[];
  reactions: { emoji: string; count: number; }[];
}
export interface Transcript extends TranscriptSummary { messages: Message[]; }

export interface Category {
  id: string; label: string; emoji: string; description: string; categoryId: string | null; color: string;
}
export interface GuildConfig {
  categories: Category[];
  staff_roles: string[]; admin_roles: string[];
  transcript_channel_id: string | null;
  log_channel_id: string | null;
  max_tickets_per_user: number;
  afk_timeout_minutes: number;
}

export interface DiscordChannel { id: string; name: string; type: number; position: number; parent_id: string | null; }
export interface DiscordRole    { id: string; name: string; color: number; position: number; }

export interface Incident {
  id: number; guild_id: string; service_name: string;
  status: 'up' | 'down' | 'degraded'; message: string | null;
  started_at: string; ended_at: string | null;
}

export interface StatRow { day: string; cnt: number; }
export interface Stats {
  opened: StatRow[]; closed: StatRow[];
  byCategory: { category: string; cnt: number; }[];
  totals: { event_type: string; cnt: number; }[];
  openCount: number; closedCount: number;
}
