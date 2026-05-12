export interface DChannel { id: string; name: string }
export interface DRole { id: string; name: string; color: number }
export interface DEmoji { id: string; name: string; animated: boolean }

export interface ShardSettings {
  // Welcome
  welcomeChannelId: string;
  welcomeTitle: string;
  welcomeMessage: string;
  welcomeFooter: string;
  welcomeColor: string;
  // Leave
  leaveChannelId: string;
  leaveTitle: string;
  leaveMessage: string;
  leaveFooter: string;
  leaveColor: string;
  // AutoRole
  autoRoleId: string;
  // TempVoice
  tempVoiceTrigger: string;
  tempVoiceCategory: string;
  tempVoiceName: string;
  // Levels
  levelsEnabled: number | string;
  xpMin: number;
  xpMax: number;
  xpCooldown: number;
  levelUpChannelId: string;
  levelUpMessage: string;
  levelUpColor: string;
  levelThresholds: number[] | string;
  levelRewards?: { level: number; roleId: string }[] | string;
  xpRoleMultipliers?: { roleId: string; multiplier: number }[] | string;
  // Tickets
  ticketEnabled: number | string;
  ticketCategoryId: string;
  ticketSupportRoleId: string;
  ticketLogChannelId: string;
  ticketMaxPerUser: number;
  ticketPanelChannelId: string;
  ticketPanelTitle: string;
  ticketPanelDescription: string;
  ticketPanelColor: string;
  ticketPanelButtonLabel: string;
  ticketPanelButtonEmoji: string;
  ticketPanelButtonStyle: number | string;
  // Welcome embed posted inside a freshly opened ticket channel
  ticketOpenTitle: string;
  ticketOpenDescription: string;
  ticketOpenFooter: string;
  ticketOpenColor: string;
  ticketCloseButtonLabel: string;
  ticketCloseButtonEmoji: string;
  ticketCloseButtonStyle: number | string;
  // Log embeds posted in the staff log channel
  ticketLogOpenTitle: string;
  ticketLogOpenColor: string;
  ticketLogCloseTitle: string;
  ticketLogCloseColor: string;
  // Birthdays
  birthdayChannelId: string;
  birthdayMessage: string;
  birthdayRoleId: string;
  // Economy
  economyEnabled: number | string;
  economyCurrencyName: string;
  economyDailyMin: number;
  economyDailyMax: number;
  // Misc
  isPremium?: number | string;
  referralEnabled?: number | string;
  referralReward?: number;
  autoReactions?: { text: string; emoji: string }[];
}

export interface Poll {
  id: number;
  channelId: string;
  question: string;
  choices: string[] | string;
  endsAt: string | null;
  ended: number;
  anonymous?: number;
}

export interface Giveaway {
  id: number;
  channelId: string;
  prize: string;
  winnersCount: number;
  endsAt: string;
  ended: number;
  minRole?: string;
  minLevel?: number;
}

export interface ScheduledAnnouncement {
  id: number;
  channelId: string;
  message: string;
  intervalHours: number;
  nextRun: string;
}

export interface ShopItem {
  id: number;
  roleId: string;
  price: number;
  name: string;
}

export interface ShardGuildData {
  guild: { id: string; name: string; icon: string | null };
  channels: DChannel[];
  voiceChannels: DChannel[];
  categories: DChannel[];
  roles: DRole[];
  guildEmojis: DEmoji[];
  settings: ShardSettings;
  giveaways: Giveaway[];
  scheduledAnnouncements: ScheduledAnnouncement[];
  shopItems: ShopItem[];
  polls: Poll[];
}

export const DURATION_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Heures" },
  { value: "days", label: "Jours" },
];

export function parseInts(v: number[] | string | null | undefined): number[] {
  if (Array.isArray(v)) return v.map(n => Number(n)).filter(n => !isNaN(n));
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.map(n => Number(n)).filter(n => !isNaN(n)) : [];
    } catch { return []; }
  }
  return [];
}

export function parseObjects<T>(v: T[] | string | null | undefined): T[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  return [];
}

export function isOn(v: unknown): boolean {
  return v === 1 || v === "1" || v === true || v === "true";
}

export function to01(b: boolean): number {
  return b ? 1 : 0;
}
