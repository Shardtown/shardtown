export interface Me {
  id: string;
  username: string;
  avatar: string;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
}

export interface TicketCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
  discord_category_id: string | null;
}

export interface SupportConfig {
  categories: TicketCategory[];
  staff_roles: string[];
  admin_roles: string[];
  transcript_channel_id: string | null;
  log_channel_id: string | null;
  max_tickets_per_user: number;
  afk_timeout_minutes: number;
  panel_title: string;
  panel_description: string;
  panel_footer: string;
  panel_color: string;
  welcome_title: string;
  welcome_color: string;
  welcome_footer: string;
  claim_enabled: boolean;
}

export interface StaffStat {
  staff_id: string;
  staff_pseudo: string;
  ticket_count: number;
  total_messages: number;
  ticket_ids: string[];
  avg_response_seconds: number | null;
}

export interface Ticket {
  id: string;
  guild_id: string;
  author_id: string;
  author_pseudo: string | null;
  category: string;
  channel_id: string;
  claimed_by: string[];
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface Transcript {
  id: string;
  author_pseudo: string;
  category: string;
  created_at: string;
  closed_at: string;
}

export interface Stats {
  opened: { day: string; cnt: number }[];
  closed: { day: string; cnt: number }[];
  byCategory: { category: string; cnt: number }[];
  totals: { event_type: string; cnt: number }[];
  openCount: number;
  closedCount: number;
}

export interface Incident {
  id: number;
  service_name: string;
  status: "up" | "down" | "degraded";
  message: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface DChannel {
  id: string;
  name: string;
  type: number;
}

export interface DRole {
  id: string;
  name: string;
  color: number;
}
