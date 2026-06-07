/**
 * Demo / offline mode.
 *
 * When the user enters the magic token `DEMO_TOKEN`, the app skips the
 * real API entirely and serves mock responses from this module. Works
 * fully offline. Useful for sales demos, beta testers without an account,
 * or just to explore the UI without spinning up a backend.
 *
 * The demo flag is held in localStorage so it persists across launches.
 * Logout clears it.
 */

import type { Account } from "@/api/account";
import type { DiscordUser } from "@/api/types";

export const DEMO_TOKEN = "jr_demo_shardtown_2026";
const DEMO_FLAG_KEY = "shardtown.demo.v1";

export function isDemoToken(token: string): boolean {
  return token.trim() === DEMO_TOKEN;
}

export function isDemoMode(): boolean {
  try { return localStorage.getItem(DEMO_FLAG_KEY) === "on"; } catch { return false; }
}

export function enableDemoMode() {
  try { localStorage.setItem(DEMO_FLAG_KEY, "on"); } catch { /* */ }
}

export function disableDemoMode() {
  try { localStorage.removeItem(DEMO_FLAG_KEY); } catch { /* */ }
}

/* ─── Mock data ─────────────────────────────────────────────────────── */

const DEMO_DISCORD_ID = "100000000000000001";

const DEMO_GUILDS_SG = [
  { id: "200000000000000001", name: "Shardtown Demo",      icon: null, owner: true,  bot_present: true },
  { id: "200000000000000002", name: "Mon Serveur Gaming",  icon: null, owner: true,  bot_present: true },
  { id: "200000000000000003", name: "Communauté Dev",      icon: null, owner: false, bot_present: true },
  { id: "200000000000000004", name: "Le Salon",            icon: null, owner: false, bot_present: false },
  { id: "200000000000000005", name: "Famille & Amis",      icon: null, owner: true,  bot_present: false },
];

const DEMO_GUILDS_SHARD = [
  { id: "200000000000000001", name: "Shardtown Demo",      icon: null, owner: true,  bot_present: true },
  { id: "200000000000000002", name: "Mon Serveur Gaming",  icon: null, owner: true,  bot_present: false },
  { id: "200000000000000006", name: "Streaming Crew",      icon: null, owner: false, bot_present: true },
];

const DEMO_ACCOUNT: Account = {
  id: 999999,
  email: "demo@shardtwn.fr",
  email_verified: true,
  pseudo: "Demo",
  discord_id: DEMO_DISCORD_ID,
  discord_username: "demo-user",
  discord_avatar: null,
  oauth_google_id: null,
  oauth_google_email: null,
  oauth_github_id: null,
  oauth_github_username: null,
  shard_id: DEMO_DISCORD_ID,
  shard_username: "demo-user",
  shard_avatar: null,
  shard_linked_at: new Date().toISOString(),
  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
  totp_enabled: false,
  email_2fa_enabled: false,
  verified: false,
};

const DEMO_DISCORD_USER: DiscordUser = {
  id: DEMO_DISCORD_ID,
  username: "demo-user",
  global_name: "Démo Shardtown",
  avatar: null,
};

const DEMO_CHANNELS = [
  { id: "300000000000000001", name: "général",     type: 0 },
  { id: "300000000000000002", name: "annonces",    type: 0 },
  { id: "300000000000000003", name: "modération",  type: 0 },
  { id: "300000000000000004", name: "logs",        type: 0 },
  { id: "300000000000000005", name: "bienvenue",   type: 0 },
];

const DEMO_ROLES = [
  { id: "400000000000000001", name: "@everyone",     color: 0,       position: 0  },
  { id: "400000000000000002", name: "Membre",        color: 0x5865f2, position: 1  },
  { id: "400000000000000003", name: "Vérifié",       color: 0x57f287, position: 2  },
  { id: "400000000000000004", name: "Modérateur",    color: 0xfee75c, position: 5  },
  { id: "400000000000000005", name: "Administrateur",color: 0xed4245, position: 10 },
];

/* ─── Router: maps path → mock response ────────────────────────────── */

interface MockResponse<T = unknown> {
  status: number;
  body: T;
}

function ok<T>(body: T): MockResponse<T> {
  return { status: 200, body };
}

export function mockApiCall(method: string, path: string, _body?: unknown): MockResponse | null {
  // Strip leading host prefix when set (desktop adds https://shardtwn.fr).
  const cleanPath = path.replace(/^https?:\/\/[^/]+/, "");
  const url = new URL(cleanPath, "http://demo");
  const p = url.pathname;
  const q = url.searchParams;

  /* ── /api/csrf ── */
  if (method === "GET" && p === "/api/csrf") {
    return ok({ csrfToken: "demo-csrf" });
  }

  /* ── /api/account/me ── */
  if (method === "GET" && p === "/api/account/me") {
    return ok({ account: DEMO_ACCOUNT });
  }

  /* ── /api/me (Discord user shape) ── */
  if (method === "GET" && p === "/api/me") {
    return ok({ user: DEMO_DISCORD_USER });
  }

  /* ── /api/account/guilds?bot=… ── */
  if (method === "GET" && p === "/api/account/guilds") {
    const bot = q.get("bot");
    const guilds = bot === "shard" ? DEMO_GUILDS_SHARD : DEMO_GUILDS_SG;
    return ok({
      bot,
      guilds,
      fetched_at: new Date().toISOString(),
      stale: false,
    });
  }

  /* ── /api/account/{discord|shard}/refresh-guilds ── */
  if (method === "POST" && /^\/api\/account\/(discord|shard)\/refresh-guilds$/.test(p)) {
    // "discord" oauth = side moderation (le bot Discord historique).
    const isMod = p.includes("discord");
    const list = isMod ? DEMO_GUILDS_SG : DEMO_GUILDS_SHARD;
    return ok({ success: true, guilds_count: list.length });
  }

  /* ── /api/account/tokens (list / create / delete) ── */
  if (method === "GET" && p === "/api/account/tokens") {
    return ok({
      tokens: [{
        id: 1,
        name: "Demo session",
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }],
    });
  }
  if (method === "POST" && p === "/api/account/tokens") {
    return { status: 403, body: { error: "Création de token désactivée en démo" } };
  }
  if (method === "DELETE" && /^\/api\/account\/tokens\/\d+$/.test(p)) {
    return ok({ success: true });
  }

  /* ── /api/shard/server + /api/shard/mod/server (legacy: /api/shardguard/server) ── */
  if (method === "GET" && /^\/api\/(shardguard|shard\/mod|shard)\/server$/.test(p)) {
    const isMod = p.includes("/mod/") || p.includes("shardguard");
    const list = isMod ? DEMO_GUILDS_SG : DEMO_GUILDS_SHARD;
    return ok({
      user: { id: DEMO_DISCORD_ID, username: "demo-user", avatar: null },
      guilds: list.map(g => ({ id: g.id, name: g.name, icon: g.icon })),
      botGuildIds: list.filter(g => g.bot_present).map(g => g.id),
      clientId: "demo-client-id",
    });
  }

  /* ── /api/{bot}/guild/:id, config view ── */
  if (method === "GET" && /^\/api\/shard\/mod\/guild\/\d+$/.test(p)) {
    return ok(mockShardModGuild(p.split("/").pop()!));
  }
  if (method === "GET" && /^\/api\/shardguard\/guild\/\d+$/.test(p)) {
    return ok(mockShardModGuild(p.split("/").pop()!));
  }
  if (method === "GET" && /^\/api\/shard\/guild\/\d+$/.test(p)) {
    return ok(mockShardGuild(p.split("/").pop()!));
  }

  /* ── POST endpoints (settings, etc.), pretend success ── */
  if (method === "POST" && /^\/(shardguard|shard\/mod|shard)\//.test(p)) {
    return ok({ success: true });
  }
  if (method === "POST" && p.startsWith("/api/")) {
    return ok({ success: true });
  }

  /* ── /api/account/logout ── */
  if (method === "POST" && p === "/api/account/logout") {
    return ok({ success: true });
  }

  // Anything else: gentle empty body so the SPA doesn't blow up.
  return ok({ guilds: [], user: null, success: true });
}

function buildChartData(): Record<string, { join: number; leave: number; success: number; failed: number }> {
  // 14 days of fake activity so the live-stats cards render charts.
  const out: Record<string, { join: number; leave: number; success: number; failed: number }> = {};
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const join = 5 + Math.floor(Math.random() * 18);
    const leave = Math.floor(Math.random() * 4);
    const success = Math.max(0, join - Math.floor(Math.random() * 3));
    const failed = join - success;
    out[key] = { join, leave, success, failed };
  }
  return out;
}

function mockShardModGuild(guildId: string) {
  const guild = DEMO_GUILDS_SG.find(g => g.id === guildId) ?? DEMO_GUILDS_SG[0];
  return {
    guild: { id: guild.id, name: guild.name, icon: guild.icon },
    channels: DEMO_CHANNELS,
    roles: DEMO_ROLES,
    settings: {
      language: "fr",
      verifiedRole: "400000000000000003",
      rules_fr: "1. Sois respectueux.\n2. Pas de spam.\n3. Amuse-toi !",
      rules_en: "1. Be respectful.\n2. No spam.\n3. Have fun!",
      serverLocked: "false",
      accessCode: "",
      verificationChannelId: "300000000000000005",
      accessCodeChannelId: "",
      captchaDigits: 5,
      captchaNoise: "medium",
      captchaAttempts: 3,
      verificationTimeout: 5,
      autoKickUnverified: "false",
      modRoles: JSON.stringify(["400000000000000004", "400000000000000005"]),
      bannedWords: JSON.stringify(["spam", "raid"]),
      bannedWordsEnabled: "true",
      bannedWordsAction: "warn",
      automodAntiSpam: "true",
      automodSpamThreshold: 5,
      automodSpamInterval: 10,
      automodSpamAction: "mute",
      automodAntiLinks: "false",
      automodLinksAction: "delete",
      automodAntiRaid: "true",
      automodRaidThreshold: 5,
      automodRaidAction: "lockdown",
      warnMessage: "Tu as reçu un avertissement.",
      muteMessage: "Tu es mute pour {duration}.",
      kickMessage: "Tu as été kick.",
      banMessage: "Tu as été ban.",
      notifAutoDelete: "true",
      notifDeleteDelay: 30,
      automodAntiCaps: "false",
      automodCapsThreshold: 70,
      automodCapsAction: "delete",
      automodSlowmodeEnabled: "false",
      automodSlowmodeDuration: 10,
      automodSlowmodeExpiry: 5,
      warnThresholdMute: 3,
      warnThresholdKick: 5,
      warnThresholdBan: 7,
      warnMuteDuration: 10,
      isPremium: "0",
      antiRaidEnabled: "true",
      antiRaidThreshold: 5,
      antiRaidWindow: 10,
      quarantineEnabled: "false",
      quarantineRoleId: "",
      quarantineDuration: 30,
      modAlertUserId: "",
      webhookAlertEnabled: "false",
      webhookAlertChannelId: "",
    },
    stats: {
      totalMembers: 1247,
      verifiedCount: 1098,
    },
    chartData: buildChartData(),
  };
}

function mockShardGuild(guildId: string) {
  const guild = DEMO_GUILDS_SHARD.find(g => g.id === guildId) ?? DEMO_GUILDS_SHARD[0];
  return {
    guild: { id: guild.id, name: guild.name, icon: guild.icon },
    channels: DEMO_CHANNELS,
    voiceChannels: [
      { id: "600000000000000001", name: "Vocal général" },
      { id: "600000000000000002", name: "Création vocal" },
    ],
    categories: [{ id: "500000000000000001", name: "Tickets" }],
    roles: DEMO_ROLES,
    guildEmojis: [],
    settings: {
      welcomeChannelId: "300000000000000005",
      welcomeTitle: "Bienvenue !",
      welcomeMessage: "Salut {user}, content de t'avoir parmi nous !",
      welcomeFooter: "Shardtown Demo",
      welcomeColor: "#5865f2",
      leaveChannelId: "300000000000000005",
      leaveTitle: "À bientôt",
      leaveMessage: "{username} a quitté le serveur.",
      leaveFooter: "",
      leaveColor: "#ed4245",
      autoRoleId: "400000000000000002",
      tempVoiceTrigger: "600000000000000002",
      tempVoiceCategory: "500000000000000001",
      tempVoiceName: "Salon de {user}",
      levelsEnabled: "true",
      xpMin: 15,
      xpMax: 25,
      xpCooldown: 60,
      levelUpChannelId: "300000000000000001",
      levelUpMessage: "{user} vient de passer niveau {level} !",
      levelUpColor: "#5865f2",
      levelThresholds: JSON.stringify([100, 250, 500, 1000, 2500]),
      levelRewards: JSON.stringify([]),
      xpRoleMultipliers: JSON.stringify([]),
      ticketEnabled: "true",
      ticketCategoryId: "500000000000000001",
      ticketSupportRoleId: "400000000000000004",
      ticketLogChannelId: "300000000000000004",
      ticketMaxPerUser: 1,
      ticketPanelChannelId: "300000000000000001",
      ticketPanelTitle: "Support",
      ticketPanelDescription: "Clique pour ouvrir un ticket",
      ticketPanelColor: "#5865f2",
      birthdayChannelId: "300000000000000002",
      birthdayRoleId: "400000000000000003",
      birthdayMessage: "🎂 Joyeux anniversaire {user} !",
      economyEnabled: "true",
      economyCurrencyName: "Pièces",
      economyDailyMin: 50,
      economyDailyMax: 150,
      isPremium: "0",
      referralEnabled: "false",
      referralReward: 100,
      autoReactions: [],
    },
    giveaways: [],
    scheduledAnnouncements: [],
    shopItems: [],
    polls: [],
  };
}
