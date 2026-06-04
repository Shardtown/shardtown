export interface Shard {
  shard_id: number;
  bot_label: string;
  ping: number;
  status: "Online" | "Offline" | string;
  guild_count: number;
  last_update: string;
  guilds_list?: { guild_id: string; guild_name: string }[];
}

export interface Bot {
  label: string;
  online: boolean;
  guilds: number;
  members: number;
  shards: Shard[];
}

export interface HistoryRow {
  bot_label: string;
  timestamp: string;
  guild_count: number;
  member_count: number;
  shard_count?: number;
  avg_latency?: number;
}

export interface StatsResponse {
  current: Bot[];
  history: HistoryRow[];
  discordApiPing: number | null;
}
