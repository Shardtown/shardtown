export interface DiscordRole { id: string; name: string; color: number }
export interface DiscordChannel { id: string; name: string }
export interface GuildInfo { id: string; name: string; icon: string | null }

export interface SGSettings {
  language: string;
  verifiedRole: string;
  rules_fr: string;
  rules_en: string;
  serverLocked: string;
  accessCode: string;
  verificationChannelId: string;
  accessCodeChannelId: string;
  captchaDigits: number;
  captchaNoise: string;
  captchaAttempts: number;
  verificationTimeout: number;
  autoKickUnverified: string;
  modRoles: string; // JSON-encoded string array
  bannedWords: string; // JSON-encoded string array
  bannedWordsEnabled: string;
  bannedWordsAction: string;
  automodAntiSpam: string;
  automodSpamThreshold: number;
  automodSpamInterval: number;
  automodSpamAction: string;
  automodAntiLinks: string;
  automodLinksAction: string;
  automodAntiRaid: string;
  automodRaidThreshold: number;
  automodRaidAction: string;
  warnMessage: string;
  muteMessage: string;
  kickMessage: string;
  banMessage: string;
  notifAutoDelete: string;
  notifDeleteDelay: number;
  automodAntiCaps: string;
  automodCapsThreshold: number;
  automodCapsAction: string;
  automodSlowmodeEnabled: string;
  automodSlowmodeDuration: number;
  automodSlowmodeExpiry: number;
  warnThresholdMute: number;
  warnThresholdKick: number;
  warnThresholdBan: number;
  warnMuteDuration: number;
  isPremium?: string | number;
  antiRaidEnabled?: string;
  antiRaidThreshold?: number;
  antiRaidWindow?: number;
  quarantineEnabled?: string;
  quarantineRoleId?: string;
  quarantineDuration?: number;
  modAlertUserId?: string;
  webhookAlertEnabled?: string;
  webhookAlertChannelId?: string;
}

export interface ShardGuardGuildData {
  guild: GuildInfo;
  roles: DiscordRole[];
  channels: DiscordChannel[];
  settings: SGSettings;
  stats: { totalMembers: number; verifiedCount: number };
  chartData: Record<string, { join: number; leave: number; success: number; failed: number }>;
}

export const NOISE_OPTIONS = [
  { value: "low", label: "Faible" },
  { value: "medium", label: "Moyen" },
  { value: "high", label: "Élevé" },
];

export const ACTION_OPTIONS = [
  { value: "delete", label: "Supprimer" },
  { value: "warn", label: "Avertir" },
  { value: "mute", label: "Mute" },
  { value: "kick", label: "Kick" },
  { value: "ban", label: "Ban" },
];

export const RAID_ACTION_OPTIONS = [
  { value: "lockdown", label: "Verrouiller le serveur" },
  { value: "quarantine", label: "Quarantaine" },
  { value: "alert", label: "Alerte modérateurs" },
];

export const LANGUAGE_OPTIONS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
];

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
  } catch { return []; }
}

export function isTrue(v: unknown): boolean {
  return v === "true" || v === "1" || v === 1 || v === true;
}

export function toFlag(b: boolean): string {
  return b ? "true" : "false";
}

export function to01(b: boolean): string {
  return b ? "1" : "0";
}
