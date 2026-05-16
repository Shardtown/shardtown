require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
    Client, GatewayIntentBits, EmbedBuilder,
    ButtonBuilder, ActionRowBuilder, ButtonStyle,
    MessageFlags, REST, Routes,
    PermissionFlagsBits,
} = require('discord.js');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Handler interactionCreate + helpers partagés (réutilisés par les bots
// custom Premium via lib/customBotManager.js).
const SIH = require('../lib/shardInteractionHandlers');
const {
    hexToInt, safeJsonParse, parseButtonEmoji, resolveButtonStyle,
    translations, generateCaptcha, buildControlPanel,
} = SIH;

// Fair Fisher-Yates shuffle backed by crypto.randomInt. Used for
// giveaway winner draws so paying Premium users actually get a fair
// random draw instead of the biased `sort(() => Math.random() - 0.5)`.
function cryptoShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks
    ]
});

// ---- Runtime stores -------------------------------------------------------
const tempChannels = new Map();
const xpCooldowns = new Map();
const captchaStore = new Map();
const CAPTCHA_TTL_MS = 10 * 60 * 1000;
const raidJoins = new Map();
const statsUpdateCooldowns = new Map();
const spamTracker = new Map();
const settingsCache = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of captchaStore.entries()) {
        if (!v || !v.createdAt || (now - v.createdAt) > CAPTCHA_TTL_MS) captchaStore.delete(k);
    }
}, 60 * 1000).unref();

// ---- MySQL ----------------------------------------------------------------
let db;
async function connectDB() {
    try {
        db = await mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        console.log('✅ Shard connecté à MySQL');

        // Community / Shard tables -----------------------------------------
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_settings (
                guildId VARCHAR(255) PRIMARY KEY,
                welcomeChannelId VARCHAR(255) DEFAULT '',
                welcomeMessage TEXT,
                leaveChannelId VARCHAR(255) DEFAULT '',
                leaveMessage TEXT
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_levels (
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                xp BIGINT DEFAULT 0,
                level INT DEFAULT 0,
                PRIMARY KEY (guildId, userId)
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                status ENUM('open','closed') DEFAULT 'open',
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_status (
                bot_label VARCHAR(50),
                shard_id INT,
                status VARCHAR(20),
                ping INT,
                guild_count INT,
                last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (bot_label, shard_id)
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_guilds (
                bot_label VARCHAR(50),
                shard_id INT,
                guild_id VARCHAR(255),
                guild_name VARCHAR(255),
                PRIMARY KEY (bot_label, guild_id)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_scheduled (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                intervalHours INT NOT NULL DEFAULT 24,
                nextRun DATETIME NOT NULL
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_giveaways (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                messageId VARCHAR(255) DEFAULT '',
                prize TEXT NOT NULL,
                winnersCount INT DEFAULT 1,
                endsAt DATETIME NOT NULL,
                ended TINYINT(1) DEFAULT 0,
                createdBy VARCHAR(255) DEFAULT '',
                minRole VARCHAR(255) DEFAULT '',
                minLevel INT DEFAULT 0
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_giveaway_entries (
                giveawayId INT NOT NULL,
                userId VARCHAR(255) NOT NULL,
                PRIMARY KEY (giveawayId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_birthdays (
                userId VARCHAR(255) NOT NULL,
                guildId VARCHAR(255) NOT NULL,
                day INT NOT NULL,
                month INT NOT NULL,
                PRIMARY KEY (guildId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_polls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                messageId VARCHAR(255) DEFAULT '',
                question TEXT NOT NULL,
                choices JSON NOT NULL,
                endsAt DATETIME DEFAULT NULL,
                ended TINYINT(1) DEFAULT 0,
                anonymous TINYINT(1) DEFAULT 0
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_poll_votes (
                pollId INT NOT NULL,
                userId VARCHAR(255) NOT NULL,
                choiceIndex INT NOT NULL,
                PRIMARY KEY (pollId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                remindAt DATETIME NOT NULL,
                done TINYINT(1) DEFAULT 0
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_invite_cache (
                guildId VARCHAR(255) NOT NULL,
                inviteCode VARCHAR(50) NOT NULL,
                uses INT DEFAULT 0,
                PRIMARY KEY (guildId, inviteCode)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_referrals (
                guildId VARCHAR(255) NOT NULL,
                inviterId VARCHAR(255) NOT NULL,
                inviteeId VARCHAR(255) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guildId, inviteeId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_economy (
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                balance BIGINT DEFAULT 0,
                lastDaily DATETIME DEFAULT NULL,
                PRIMARY KEY (guildId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_shop (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                roleId VARCHAR(255) NOT NULL,
                price INT NOT NULL,
                name VARCHAR(255) DEFAULT ''
            )
        `).catch(() => {});

        // Guard / moderation tables (formerly ShardGuard) ------------------
        await db.execute(`
            CREATE TABLE IF NOT EXISTS warnings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                moderatorId VARCHAR(255),
                moderatorName VARCHAR(255),
                reason TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
    } catch (err) {
        console.error('❌ Erreur MySQL Shard:', err.message);
        process.exit(1);
    }
}

// ---- Settings loaders -----------------------------------------------------
// Two separate config tables persisted from two different dashboards. The
// merged bot reads from both: shard_settings holds community/Shard config
// (welcome, levels, tickets, economy...) and settings holds the security /
// moderation config (verification, captcha, automod, mod thresholds...).
async function getSettings(guildId) {
    try {
        const [rows] = await db.execute('SELECT * FROM shard_settings WHERE guildId = ?', [guildId]);
        return rows[0] || {
            welcomeChannelId: '', welcomeTitle: '', welcomeMessage: 'Bienvenue {user} sur **{server}** !', welcomeFooter: '', welcomeColor: '#3b82f6',
            leaveChannelId: '', leaveTitle: '', leaveMessage: '{username} a quitté **{server}**.', leaveFooter: '', leaveColor: '#6b7280'
        };
    } catch { return null; }
}

async function getGuildSettings(guildId) {
    try {
        const [rows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildId]);
        return rows[0] || { language: 'fr', verifiedRole: '', serverLocked: 'false', accessCode: '', captchaDigits: 6, captchaNoise: 'medium', captchaAttempts: 3, verificationTimeout: 15, autoKickUnverified: 'false' };
    } catch (err) {
        if (err.code !== 'EADDRNOTAVAIL' && err.code !== 'ECONNRESET' && err.code !== 'PROTOCOL_CONNECTION_LOST') {
            console.error('Erreur getGuildSettings:', err.message);
        }
        return { language: 'fr', verifiedRole: '', serverLocked: 'false', accessCode: '', captchaDigits: 6, captchaNoise: 'medium', captchaAttempts: 3, verificationTimeout: 15, autoKickUnverified: 'false' };
    }
}

async function addLog(guildId, userId, username, event, status) {
    try {
        await db.execute(
            'INSERT INTO logs (guildId, userId, username, event, status) VALUES (?, ?, ?, ?, ?)',
            [guildId, userId, username, event, status]
        );
    } catch (err) {
        // logs table comes from the dashboard schema; if missing we just
        // swallow the error rather than spam the console.
    }
}

// ---- Generic helpers ------------------------------------------------------
function fmt(template, member) {
    return String(template || '')
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{memberCount}/g, member.guild.memberCount);
}

// ---- Stats channel sync (verified count) ---------------------------------
async function updateStatsChannels(guild) {
    // Debounced because Discord allows at most 2 channel renames per 10 min.
    if (statsUpdateCooldowns.has(guild.id)) return;

    statsUpdateCooldowns.set(guild.id, true);
    setTimeout(async () => {
        try {
            const settings = await getGuildSettings(guild.id);
            if (!settings.verifiedRole) {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }

            let members;
            try {
                members = await guild.members.fetch({ time: 30000 });
            } catch {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }
            const verifiedCount = members.filter(m => m.roles.cache.has(settings.verifiedRole)).size;

            const category = guild.channels.cache.find(c =>
                c.type === 4 &&
                (c.name.toLowerCase().includes('général') || c.name.toLowerCase().includes('general'))
            );
            if (!category) {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }

            const statsChannel = guild.channels.cache.find(c =>
                c.parentId === category.id &&
                (c.name.toUpperCase().startsWith('VÉRIFIÉS') || c.name.toUpperCase().startsWith('VERIFIES'))
            );
            if (statsChannel) {
                const newName = `VÉRIFIÉS: ${verifiedCount}`;
                if (statsChannel.name !== newName) await statsChannel.setName(newName);
            }
        } catch (err) {
            if (!['GuildMembersTimeout', 'EADDRNOTAVAIL', 'ECONNRESET'].includes(err.code)) {
                console.error(`Erreur updateStatsChannels pour ${guild.id}:`, err.message);
            }
        } finally {
            setTimeout(() => statsUpdateCooldowns.delete(guild.id), 5 * 60 * 1000);
        }
    }, 10000);
}

async function sendModAlert(settings, guild, message) {
    if (!settings?.isPremium || !settings?.modAlertUserId) return;
    try {
        const modUser = await guild.client.users.fetch(settings.modAlertUserId);
        await modUser.send(`🚨 **[${guild.name}]** ${message}`);
    } catch {}
}


// ---- Automod helpers ------------------------------------------------------
function wildcardToRegex(pattern) {
    const safePattern = String(pattern).slice(0, 100).replace(/\*+/g, '*');
    const escaped = safePattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '[^\\s]{0,50}');
    return new RegExp(`(?:^|\\s|\\b)${regexStr}(?:\\s|\\b|$)`, 'i');
}

const LINK_REGEX = /https?:\/\/\S+|discord\.gg\/\S+|discord\.com\/invite\/\S+/i;

async function applyModAction(message, action, reason, settings = {}) {
    try { if (message.deletable) await message.delete(); } catch (e) {}

    const mention = `<@${message.author.id}>`;
    const autoDelete = settings.notifAutoDelete !== 'false';
    const deleteDelay = (parseInt(settings.notifDeleteDelay) || 5) * 1000;

    const scheduleDelete = (msg) => {
        if (autoDelete) setTimeout(() => msg.delete().catch(() => {}), deleteDelay);
    };

    if (action === 'warn') {
        try {
            const w = await message.channel.send(`<:warn:1494699375216300042> ${mention}, ${reason}.`);
            scheduleDelete(w);
        } catch (e) {}
    } else if (action === 'mute') {
        try {
            if (message.member?.moderatable) {
                await message.member.timeout(10 * 60 * 1000, reason);
                const w = await message.channel.send(`<:mute:1494698925603422238> ${mention} a été mis en sourdine 10 min. (${reason})`);
                scheduleDelete(w);
            }
        } catch (e) {}
    } else if (action === 'kick') {
        try {
            if (message.member?.kickable) {
                const w = await message.channel.send(`<:kick:1494698974328918016> ${mention} a été expulsé. (${reason})`);
                scheduleDelete(w);
                await message.member.kick(reason);
            }
        } catch (e) {}
    } else if (action === 'ban') {
        try {
            if (message.member?.bannable) {
                const w = await message.channel.send(`<:ban:1494699004938813672> ${mention} a été banni. (${reason})`);
                scheduleDelete(w);
                await message.member.ban({ reason });
            }
        } catch (e) {}
    }

    await addLog(message.guild.id, message.author.id, message.author.username, reason, action);
    await sendModAlert(settings, message.guild, `Auto-mod déclenché sur <@${message.author.id}> (\`${message.author.username}\`) — action: **${action}**, raison: **${reason}**`);
}


// =========================== READY ========================================
client.once('ready', async () => {
    await connectDB();
    console.log(`✅ Shard connecté en tant que ${client.user.tag}`);

    // Branche le handler partagé interactionCreate (slash commands +
    // boutons + modals). On lui passe les helpers définis dans ce fichier
    // pour que la logique de mod/eco continue d'utiliser le bon pool db
    // et reste alignée avec messageCreate/guildMemberAdd qui partagent
    // ces fonctions.
    SIH.attach({
        client, db, captchaStore, tempChannels,
        helpers: { getSettings, getGuildSettings, addLog, updateStatsChannels },
    });

    // One-time cleanup: drop legacy 'ShardGuard' bot_label rows now that the
    // two bots are unified under a single 'Shard' label.
    try {
        await db.execute(`DELETE FROM shard_status WHERE bot_label = ?`, ['ShardGuard']);
        await db.execute(`DELETE FROM shard_guilds WHERE bot_label = ?`, ['ShardGuard']);
    } catch (err) {
        console.warn('Nettoyage legacy ShardGuard:', err.message);
    }

    async function updateShardStatus() {
        try {
            const shardId = client.shard ? client.shard.ids[0] : 0;
            const guildCount = client.guilds.cache.size;
            const ping = client.ws.ping;
            await db.execute(
                'INSERT INTO shard_status (bot_label, shard_id, status, ping, guild_count) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), ping = VALUES(ping), guild_count = VALUES(guild_count), last_update = CURRENT_TIMESTAMP',
                ['Shard', shardId, 'Online', ping, guildCount]
            );
        } catch (err) {
            console.error('Erreur mise à jour statut shard:', err.message);
        }
    }
    setInterval(updateShardStatus, 30000);
    updateShardStatus();

    async function syncGuilds() {
        try {
            const shardId = client.shard ? client.shard.ids[0] : 0;
            await db.execute('DELETE FROM shard_guilds WHERE bot_label = ? AND shard_id = ?', ['Shard', shardId]);
            for (const guild of client.guilds.cache.values()) {
                await db.execute(
                    'INSERT INTO shard_guilds (bot_label, shard_id, guild_id, guild_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE shard_id = VALUES(shard_id), guild_name = VALUES(guild_name)',
                    ['Shard', shardId, guild.id, guild.name]
                );
            }
        } catch (err) {
            console.error('Erreur syncGuilds Shard:', err.message);
        }
    }

    syncGuilds();

    // guildCreate: sync + blocked-guilds enforcement + cache reset
    client.on('guildCreate', async (guild) => {
        settingsCache.clear();
        syncGuilds();
        try {
            const [rows] = await db.execute('SELECT id FROM blocked_guilds WHERE guild_id = ?', [guild.id]);
            if (rows.length > 0) {
                console.log(`🚫 Serveur bloqué détecté: ${guild.name} (${guild.id}) — départ automatique.`);
                await guild.leave();
            }
        } catch (err) {
            // blocked_guilds table is optional in some environments.
        }
    });
    client.on('guildDelete', () => {
        settingsCache.clear();
        syncGuilds();
    });

    // ---- Slash commands ---------------------------------------------------
    // Liste partagée avec les bots custom Premium (lib/customBotManager.js)
    // pour qu'une nouvelle commande ajoutée ici apparaisse aussi chez eux.
    const { buildCommandList } = require('../lib/shardCommands');
    const commands = buildCommandList();

    const rest = new REST({ version: '10' }).setToken(process.env.SHARD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.SHARD_CLIENT_ID), { body: commands });
        console.log('✅ Commandes slash Shard enregistrées');
    } catch (err) {
        console.error('Erreur enregistrement commandes:', err.message);
    }

    // ---- Periodic jobs ----------------------------------------------------
    async function runScheduled() {
        try {
            const now = new Date();
            const [rows] = await db.execute(`SELECT * FROM shard_scheduled WHERE nextRun <= ?`, [now]);
            for (const row of rows) {
                try {
                    const guild = client.guilds.cache.get(row.guildId);
                    if (!guild) continue;
                    const channel = guild.channels.cache.get(row.channelId);
                    if (channel) await channel.send(row.message);
                    const next = new Date(now.getTime() + row.intervalHours * 3600000);
                    await db.execute(`UPDATE shard_scheduled SET nextRun = ? WHERE id = ?`, [next, row.id]);
                } catch {}
            }
        } catch {}
    }
    setInterval(runScheduled, 60000);
    runScheduled();

    async function checkGiveaways() {
        try {
            const now = new Date();
            const [rows] = await db.execute(`SELECT * FROM shard_giveaways WHERE ended = 0 AND endsAt <= ?`, [now]);
            for (const gw of rows) {
                try {
                    const [entries] = await db.execute(`SELECT userId FROM shard_giveaway_entries WHERE giveawayId = ?`, [gw.id]);
                    const shuffled = cryptoShuffle(entries);
                    const winnerIds = shuffled.slice(0, gw.winnersCount).map(e => e.userId);
                    const winnersText = winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'Aucun participant';
                    await db.execute(`UPDATE shard_giveaways SET ended = 1 WHERE id = ?`, [gw.id]);
                    const guild = client.guilds.cache.get(gw.guildId);
                    if (!guild) continue;
                    const channel = guild.channels.cache.get(gw.channelId);
                    if (channel) {
                        try {
                            const msg = await channel.messages.fetch(gw.messageId);
                            await msg.edit({
                                embeds: [{ color: 0x6b7280, title: '🎉 GIVEAWAY TERMINÉ', description: `**${gw.prize}**\n\n🏆 Gagnant(s) : ${winnersText}`, footer: { text: `${gw.winnersCount} gagnant(s)` }, timestamp: new Date().toISOString() }],
                                components: [{ type: 1, components: [{ type: 2, style: 2, label: 'Terminé', custom_id: 'giveaway_ended', disabled: true }] }]
                            });
                        } catch {}
                        if (winnerIds.length) await channel.send(`🎊 Félicitations ${winnersText} ! Vous avez gagné **${gw.prize}** !`).catch(() => {});
                    }
                } catch {}
            }
        } catch {}
    }
    setInterval(checkGiveaways, 60000);
    checkGiveaways();

    async function checkBirthdays() {
        try {
            const now = new Date();
            const day = now.getDate();
            const month = now.getMonth() + 1;
            const [birthdays] = await db.execute(`SELECT b.*, s.birthdayChannelId, s.birthdayMessage, s.birthdayRoleId FROM shard_birthdays b JOIN shard_settings s ON b.guildId = s.guildId WHERE b.day = ? AND b.month = ? AND s.birthdayChannelId != ''`, [day, month]);
            for (const bd of birthdays) {
                try {
                    const guild = client.guilds.cache.get(bd.guildId);
                    if (!guild) continue;
                    const member = await guild.members.fetch(bd.userId).catch(() => null);
                    if (!member) continue;
                    if (bd.birthdayChannelId) {
                        const channel = guild.channels.cache.get(bd.birthdayChannelId);
                        if (channel) {
                            const msg = String(bd.birthdayMessage || '🎂 Joyeux anniversaire {user} !')
                                .replace(/{user}/g, `<@${member.id}>`).replace(/{username}/g, member.user.username);
                            await channel.send(msg).catch(() => {});
                        }
                    }
                    if (bd.birthdayRoleId) {
                        try {
                            await member.roles.add(bd.birthdayRoleId);
                            setTimeout(async () => { try { await member.roles.remove(bd.birthdayRoleId); } catch {} }, 86400000);
                        } catch {}
                    }
                } catch {}
            }
        } catch {}
    }
    setInterval(checkBirthdays, 3600000);
    checkBirthdays();

    async function checkPolls() {
        // Native Discord polls auto-expire on their own — we just clean up
        // the local tracking row once the deadline has passed.
        try {
            const now = new Date();
            await db.execute(`UPDATE shard_polls SET ended = 1 WHERE ended = 0 AND endsAt IS NOT NULL AND endsAt <= ?`, [now]);
        } catch {}
    }
    setInterval(checkPolls, 60000);
    checkPolls();

    async function checkReminders() {
        try {
            const now = new Date();
            const [rows] = await db.execute(`SELECT * FROM shard_reminders WHERE done = 0 AND remindAt <= ?`, [now]);
            for (const r of rows) {
                try {
                    const guild = client.guilds.cache.get(r.guildId);
                    if (!guild) continue;
                    const channel = guild.channels.cache.get(r.channelId);
                    if (channel) await channel.send(`⏰ <@${r.userId}> **Rappel :** ${r.message}`).catch(() => {});
                    await db.execute(`UPDATE shard_reminders SET done = 1 WHERE id = ?`, [r.id]);
                } catch {}
            }
        } catch {}
    }
    setInterval(checkReminders, 30000);
    checkReminders();

    // Stats channels init
    for (const guild of client.guilds.cache.values()) {
        updateStatsChannels(guild);
    }

    // Unverified auto-kick loop (every 5 min)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    setInterval(async () => {
        const now = Date.now();
        const guildList = [...client.guilds.cache.values()];
        for (const guild of guildList) {
            try {
                const settings = await getGuildSettings(guild.id);
                if (!settings.verifiedRole) continue;
                updateStatsChannels(guild);
                if (settings.autoKickUnverified !== 'true') continue;

                const timeoutMinutes = settings.verificationTimeout || 15;
                const timeoutMs = timeoutMinutes * 60 * 1000;

                let members;
                try { members = await guild.members.fetch({ time: 30000 }); } catch { continue; }
                const unverified = members.filter(m => !m.user.bot && !m.roles.cache.has(settings.verifiedRole));

                for (const member of unverified.values()) {
                    if (now - member.joinedTimestamp > timeoutMs) {
                        try {
                            if (member.kickable) {
                                await member.kick(`Temps de vérification dépassé (${timeoutMinutes} minutes)`);
                                await addLog(guild.id, member.id, member.user.username, 'Timeout', 'Kicked');
                                await sleep(1500);
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                if (!['EADDRNOTAVAIL', 'ECONNRESET'].includes(e.code)) {
                    console.error(`Erreur timeout guild ${guild.id}:`, e.message);
                }
            }
            await sleep(2000);
        }
    }, 5 * 60 * 1000);
});

// =========================== GUILD MEMBER EVENTS ==========================
client.on('guildMemberAdd', async (member) => {
    // Security checks first: blacklist / raid / quarantine come before welcome.
    const guardSettings = await getGuildSettings(member.guild.id);
    await addLog(member.guild.id, member.id, member.user.username, 'Arrivée', 'Join');

    if (guardSettings?.isPremium) {
        const [blRows] = await db.execute('SELECT userId FROM global_blacklist WHERE userId = ?', [member.id]).catch(() => [[]]);
        if (blRows.length > 0) {
            try {
                if (member.bannable) {
                    await member.ban({ reason: 'Liste noire globale Shardtown' });
                    await sendModAlert(guardSettings, member.guild, `<@${member.id}> (\`${member.user.username}\`) banni automatiquement — présent dans la liste noire globale.`);
                }
            } catch {}
            return;
        }

        if (guardSettings.antiRaidEnabled) {
            const gid = member.guild.id;
            const threshold = parseInt(guardSettings.antiRaidThreshold) || 10;
            const window = (parseInt(guardSettings.antiRaidWindow) || 10) * 1000;
            const now = Date.now();
            if (!raidJoins.has(gid)) raidJoins.set(gid, []);
            const joins = raidJoins.get(gid).filter(t => now - t < window);
            joins.push(now);
            raidJoins.set(gid, joins);
            if (joins.length >= threshold) {
                raidJoins.delete(gid);
                try {
                    await member.guild.setVerificationLevel(4);
                    await sendModAlert(guardSettings, member.guild, `⚠️ Raid détecté ! ${threshold} membres ont rejoint en ${guardSettings.antiRaidWindow}s. Niveau de vérification mis au maximum.`);
                } catch {}
            }
        }

        if (guardSettings.quarantineEnabled && guardSettings.quarantineRoleId) {
            const duration = (parseInt(guardSettings.quarantineDuration) || 10) * 60 * 1000;
            try {
                await member.roles.add(guardSettings.quarantineRoleId, 'Quarantaine automatique');
                setTimeout(async () => {
                    try {
                        const m = await member.guild.members.fetch(member.id);
                        if (m.roles.cache.has(guardSettings.quarantineRoleId)) {
                            await m.roles.remove(guardSettings.quarantineRoleId, 'Fin de quarantaine');
                        }
                    } catch {}
                }, duration);
            } catch {}
        }
    }

    // Then community side: welcome, auto-role, invite tracking, referral.
    const settings = await getSettings(member.guild.id);
    if (!settings) return;

    if (settings.autoRoleId) {
        try { await member.roles.add(settings.autoRoleId); } catch (err) { console.error('Erreur auto role:', err.message); }
    }

    if (settings.isPremium && settings.referralEnabled) {
        try {
            const invites = await member.guild.fetchInvites();
            const [prevRows] = await db.execute(`SELECT inviteCode, uses FROM shard_invite_cache WHERE guildId = ?`, [member.guild.id]).catch(() => [[]]);
            const prevMap = {};
            for (const r of prevRows) prevMap[r.inviteCode] = r.uses;
            let inviterId = null;
            for (const [code, inv] of invites) {
                const prev = prevMap[code] ?? inv.uses;
                if (inv.uses > prev && inv.inviter) { inviterId = inv.inviter.id; break; }
            }
            for (const [code, inv] of invites) {
                await db.execute(`INSERT INTO shard_invite_cache (guildId, inviteCode, uses) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE uses = VALUES(uses)`, [member.guild.id, code, inv.uses]).catch(() => {});
            }
            if (inviterId && inviterId !== member.id) {
                const [existing] = await db.execute(`SELECT inviteeId FROM shard_referrals WHERE guildId = ? AND inviteeId = ?`, [member.guild.id, member.id]).catch(() => [[]]);
                if (existing.length === 0) {
                    await db.execute(`INSERT IGNORE INTO shard_referrals (guildId, inviterId, inviteeId) VALUES (?, ?, ?)`, [member.guild.id, inviterId, member.id]).catch(() => {});
                    const reward = parseInt(settings.referralReward) || 100;
                    const currency = settings.economyCurrencyName || 'coins';
                    await db.execute(`INSERT INTO shard_economy (guildId, userId, balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?`, [member.guild.id, inviterId, reward, reward]).catch(() => {});
                    try {
                        const inviter = await member.guild.members.fetch(inviterId);
                        await inviter.send(`🎉 **[${member.guild.name}]** Vous avez invité **${member.user.username}** et reçu **+${reward} ${currency}** en récompense !`).catch(() => {});
                    } catch {}
                }
            }
        } catch {}
    }

    if (settings.welcomeChannelId) {
        try {
            const channel = await member.guild.channels.fetch(settings.welcomeChannelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(hexToInt(settings.welcomeColor))
                    .setDescription(fmt(settings.welcomeMessage, member) || null)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();
                if (settings.welcomeTitle) embed.setTitle(fmt(settings.welcomeTitle, member));
                if (settings.welcomeFooter) embed.setFooter({ text: fmt(settings.welcomeFooter, member) });
                await channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('Erreur welcome:', err.message);
        }
    }
});

client.on('guildMemberRemove', async (member) => {
    await addLog(member.guild.id, member.id, member.user.username, 'Départ', 'Leave');
    updateStatsChannels(member.guild);

    const settings = await getSettings(member.guild.id);
    if (!settings || !settings.leaveChannelId) return;
    try {
        const channel = await member.guild.channels.fetch(settings.leaveChannelId);
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setColor(hexToInt(settings.leaveColor))
            .setDescription(fmt(settings.leaveMessage, member) || null)
            .setTimestamp();
        if (settings.leaveTitle) embed.setTitle(fmt(settings.leaveTitle, member));
        if (settings.leaveFooter) embed.setFooter({ text: fmt(settings.leaveFooter, member) });
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Erreur leave:', err.message);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const settings = await getGuildSettings(newMember.guild.id);
    if (!settings.verifiedRole) return;
    const hadRole = oldMember.roles.cache.has(settings.verifiedRole);
    const hasRole = newMember.roles.cache.has(settings.verifiedRole);
    if (hadRole !== hasRole) updateStatsChannels(newMember.guild);
});

// =========================== VOICE STATE ==================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = newState.guild.id || oldState.guild.id;
    const settings = await getSettings(guildId);
    if (!settings || !settings.tempVoiceTrigger) return;

    if (newState.channelId === settings.tempVoiceTrigger && newState.member) {
        try {
            const member = newState.member;
            const guild = newState.guild;

            const channelName = String(settings.tempVoiceName || 'Salon de {username}')
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, guild.name);

            const createOptions = { name: channelName, type: 2, reason: 'Salon vocal temporaire' };
            if (settings.tempVoiceCategory) {
                createOptions.parent = settings.tempVoiceCategory;
            } else {
                const triggerChannel = guild.channels.cache.get(settings.tempVoiceTrigger);
                if (triggerChannel?.parentId) createOptions.parent = triggerChannel.parentId;
            }

            const newChannel = await guild.channels.create(createOptions);
            const data = { ownerId: member.id, locked: false, limit: 0, messageId: null };
            tempChannels.set(newChannel.id, data);

            await member.voice.setChannel(newChannel);
            const msg = await newChannel.send(buildControlPanel(data));
            data.messageId = msg.id;
        } catch (err) {
            console.error('Erreur création vocal temporaire:', err.message);
        }
    }

    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        try {
            const channel = oldState.guild.channels.cache.get(oldState.channelId);
            if (channel && channel.members.size === 0) {
                await channel.delete('Salon vocal temporaire vide');
                tempChannels.delete(oldState.channelId);
            }
        } catch (err) {
            console.error('Erreur suppression vocal temporaire:', err.message);
        }
    }
});

// =========================== MESSAGE CREATE ===============================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ---- Auto-moderation pipeline (Guard) ---------------------------------
    const guardSettings = await getGuildSettings(message.guild.id);

    // Skip moderation entirely for staff (modRoles).
    let isStaff = false;
    if (guardSettings.modRoles) {
        try {
            const modRolesArr = JSON.parse(guardSettings.modRoles);
            if (modRolesArr.length > 0 && message.member && modRolesArr.some(rid => message.member.roles.cache.has(rid))) {
                isStaff = true;
            }
        } catch (e) {}
    }

    if (!isStaff) {
        if (guardSettings.bannedWordsEnabled === 'true') {
            let bannedWordsArr = [];
            try { bannedWordsArr = JSON.parse(guardSettings.bannedWords || '[]'); } catch (e) {}
            if (bannedWordsArr.length > 0) {
                const content = message.content.toLowerCase();
                const isMatched = bannedWordsArr.some(word => {
                    if (!word || !word.trim()) return false;
                    return wildcardToRegex(word.trim().toLowerCase()).test(content);
                });
                if (isMatched) {
                    await applyModAction(message, guardSettings.bannedWordsAction || 'delete', 'Mot interdit', guardSettings);
                    return;
                }
            }
        }

        if (guardSettings.automodAntiLinks === 'true') {
            if (LINK_REGEX.test(message.content)) {
                await applyModAction(message, guardSettings.automodLinksAction || 'delete', 'Anti-Liens', guardSettings);
                return;
            }
        }

        if (guardSettings.automodAntiCaps === 'true') {
            const letters = message.content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
            if (letters.length >= 10) {
                const upperCount = (message.content.match(/[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸÇ]/g) || []).length;
                const ratio = (upperCount / letters.length) * 100;
                const threshold = parseInt(guardSettings.automodCapsThreshold) || 70;
                if (ratio >= threshold) {
                    await applyModAction(message, guardSettings.automodCapsAction || 'delete', 'Anti-Caps', guardSettings);
                    return;
                }
            }
        }

        if (guardSettings.automodAntiSpam === 'true') {
            const threshold = parseInt(guardSettings.automodSpamThreshold) || 5;
            const interval = parseInt(guardSettings.automodSpamInterval) || 5;
            const key = `${message.guild.id}-${message.author.id}`;
            const now = Date.now();
            if (!spamTracker.has(key)) spamTracker.set(key, []);
            const entries = spamTracker.get(key).filter(e => now - e.time < interval * 1000);
            entries.push({ time: now, messageId: message.id, channelId: message.channel.id });
            spamTracker.set(key, entries);

            if (entries.length >= threshold) {
                spamTracker.delete(key);
                if (guardSettings.automodSlowmodeEnabled === 'true') {
                    const slowDuration = parseInt(guardSettings.automodSlowmodeDuration) || 10;
                    const slowExpiry = parseInt(guardSettings.automodSlowmodeExpiry) || 5;
                    try {
                        await message.channel.setRateLimitPerUser(slowDuration);
                        setTimeout(() => { message.channel.setRateLimitPerUser(0).catch(() => {}); }, slowExpiry * 60 * 1000);
                    } catch {}
                }
                const byChannel = {};
                for (const e of entries) {
                    if (!byChannel[e.channelId]) byChannel[e.channelId] = [];
                    byChannel[e.channelId].push(e.messageId);
                }
                for (const [chanId, ids] of Object.entries(byChannel)) {
                    try {
                        const ch = message.guild.channels.cache.get(chanId);
                        if (ch?.isTextBased()) await ch.bulkDelete(ids, true).catch(() => {});
                    } catch (e) {}
                }
                await applyModAction(message, guardSettings.automodSpamAction || 'warn', 'Anti-Spam', guardSettings);
                return;
            }
        }
    }

    // ---- Community pipeline (Shard): auto-reactions + XP -----------------
    const settings = await getSettings(message.guild.id);
    if (!settings) return;

    if (settings.autoReactions) {
        const reactions = safeJsonParse(settings.autoReactions, []);
        if (Array.isArray(reactions)) {
            const content = message.content.toLowerCase();
            for (const r of reactions) {
                if (r && r.text && content.includes(String(r.text).toLowerCase())) {
                    await message.react(r.emoji).catch(() => {});
                }
            }
        }
    }

    if (settings.levelsEnabled) {
        const key = `${message.guild.id}:${message.author.id}`;
        const now = Date.now();
        const cooldown = (settings.xpCooldown || 60) * 1000;
        if (xpCooldowns.has(key) && now - xpCooldowns.get(key) < cooldown) return;
        xpCooldowns.set(key, now);

        const xpMin = parseInt(settings.xpMin) || 15;
        const xpMax = parseInt(settings.xpMax) || 25;
        let gained = Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;
        if (settings.isPremium && settings.xpRoleMultipliers) {
            const multipliers = safeJsonParse(settings.xpRoleMultipliers, []);
            if (Array.isArray(multipliers)) {
                for (const { roleId, multiplier } of multipliers) {
                    if (message.member.roles.cache.has(roleId)) {
                        gained = Math.round(gained * (parseFloat(multiplier) || 1));
                        break;
                    }
                }
            }
        }

        const defaultThresholds = [100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11500, 15000];
        let thresholds = settings.levelThresholds;
        if (!thresholds) thresholds = defaultThresholds;
        else if (typeof thresholds === 'string') { try { thresholds = JSON.parse(thresholds); } catch { thresholds = defaultThresholds; } }
        if (!Array.isArray(thresholds) || thresholds.length === 0) thresholds = defaultThresholds;

        function getLevelFromXP(totalXp) {
            let cumulative = 0;
            for (let i = 0; i < thresholds.length; i++) {
                cumulative += thresholds[i];
                if (totalXp < cumulative) return i;
            }
            return thresholds.length;
        }

        try {
            await db.execute(`
                INSERT INTO shard_levels (guildId, userId, xp, level) VALUES (?, ?, ?, 0)
                ON DUPLICATE KEY UPDATE xp = xp + ?
            `, [message.guild.id, message.author.id, gained, gained]);

            const [rows] = await db.execute('SELECT xp, level FROM shard_levels WHERE guildId = ? AND userId = ?', [message.guild.id, message.author.id]);
            const row = rows[0];
            if (!row) return;
            const currentLevel = row.level || 0;
            const newLevel = getLevelFromXP(row.xp || 0);

            if (newLevel > currentLevel) {
                await db.execute('UPDATE shard_levels SET level = ? WHERE guildId = ? AND userId = ?', [newLevel, message.guild.id, message.author.id]);

                if (settings.levelUpChannelId) {
                    try {
                        const chan = await message.guild.channels.fetch(settings.levelUpChannelId);
                        if (chan) {
                            const colorHex = String(settings.levelUpColor || '#3b82f6');
                            const colorInt = parseInt(colorHex.replace('#', ''), 16) || 0x3b82f6;
                            const rawMsg = String(settings.levelUpMessage || '{user} est passé au niveau **{level}** !')
                                .replace(/{user}/g, `<@${message.author.id}>`)
                                .replace(/{username}/g, message.author.username)
                                .replace(/{level}/g, String(newLevel))
                                .replace(/{xp}/g, String(row.xp));
                            const embed = new EmbedBuilder()
                                .setColor(colorInt)
                                .setDescription(rawMsg)
                                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                                .setTimestamp();
                            await chan.send({ embeds: [embed] });
                        }
                    } catch {}
                }

                const rewards = safeJsonParse(settings.levelRewards, []) || [];
                const reward = Array.isArray(rewards) ? rewards.find(r => r && r.level === newLevel) : null;
                if (reward) {
                    try {
                        const member = await message.guild.members.fetch(message.author.id);
                        await member.roles.add(reward.roleId);
                    } catch {}
                }
            }
        } catch (err) { console.error('Erreur XP:', err.message); }
    }
});

// =========================== WEBHOOKS UPDATE ==============================
client.on('webhooksUpdate', async (channel) => {
    try {
        const settings = await getGuildSettings(channel.guild.id);
        if (!settings.webhookAlertEnabled || !settings.webhookAlertChannelId) return;

        const alertChannel = await channel.guild.channels.fetch(settings.webhookAlertChannelId).catch(() => null);
        if (!alertChannel) return;

        await alertChannel.send({
            embeds: [{
                color: 0xf59e0b,
                title: '⚠️ Webhook modifié',
                description: `Un webhook a été créé ou modifié dans <#${channel.id}>.\nVérifiez qu'il n'est pas malveillant.`,
                timestamp: new Date().toISOString(),
                footer: { text: 'Shard — Détection Webhook' }
            }]
        });
    } catch {}
});


// =========================== ERROR HANDLERS ===============================
client.on('error', (err) => console.error('[Shard] client error:', err.message));
client.on('shardError', (err, shardId) => console.error(`[Shard] shard ${shardId} error:`, err.message));
client.on('shardDisconnect', (event, shardId) => console.warn(`[Shard] shard ${shardId} disconnected (code ${event?.code})`));
client.on('shardReconnecting', (shardId) => console.log(`[Shard] shard ${shardId} reconnecting...`));
client.on('invalidated', () => {
    console.error('[Shard] session invalidée — arrêt du process pour redémarrage');
    process.exit(1);
});
process.on('unhandledRejection', (reason) => console.error('[Shard] unhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('[Shard] uncaughtException:', err.message));

if (!process.env.SHARD_TOKEN) {
    console.error('❌ SHARD_TOKEN manquant dans .env');
    process.exit(1);
}
client.login(process.env.SHARD_TOKEN);
