require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
    Client, GatewayIntentBits, EmbedBuilder,
    ButtonBuilder, ActionRowBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, SlashCommandBuilder, REST, Routes,
    PermissionFlagsBits
} = require('discord.js');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

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
        GatewayIntentBits.GuildInvites
    ]
});

const tempChannels = new Map();
const xpCooldowns = new Map();

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
    } catch (err) {
        console.error('❌ Erreur MySQL Shard:', err.message);
        process.exit(1);
    }
}

async function getSettings(guildId) {
    try {
        const [rows] = await db.execute('SELECT * FROM shard_settings WHERE guildId = ?', [guildId]);
        return rows[0] || {
            welcomeChannelId: '', welcomeTitle: '', welcomeMessage: 'Bienvenue {user} sur **{server}** !', welcomeFooter: '', welcomeColor: '#3b82f6',
            leaveChannelId: '', leaveTitle: '', leaveMessage: '{username} a quitté **{server}**.', leaveFooter: '', leaveColor: '#6b7280'
        };
    } catch { return null; }
}

function fmt(template, member) {
    return String(template || '')
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{memberCount}/g, member.guild.memberCount);
}

function hexToInt(hex) {
    return parseInt(String(hex || '#3b82f6').replace('#', ''), 16) || 0x3b82f6;
}

function safeJsonParse(value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

client.once('ready', async () => {
    await connectDB();
    console.log(`✅ Shard connecté en tant que ${client.user.tag}`);

    // Mise à jour périodique du statut du shard
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

    // Synchronisation des serveurs du shard
    async function syncGuilds() {
        try {
            const shardId = client.shard ? client.shard.ids[0] : 0;
            // Supprimer les anciens serveurs de ce shard pour ce bot
            await db.execute('DELETE FROM shard_guilds WHERE bot_label = ? AND shard_id = ?', ['Shard', shardId]);
            
            // Insérer les nouveaux
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
    client.on('guildCreate', syncGuilds);
    client.on('guildDelete', syncGuilds);

    const commands = [
        new SlashCommandBuilder()
            .setName('embed')
            .setDescription('Crée et envoie un embed personnalisé')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addStringOption(o => o.setName('description').setDescription('Contenu principal').setRequired(true))
            .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed'))
            .addStringOption(o => o.setName('footer').setDescription('Texte du footer'))
            .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #3b82f6)'))
            .addStringOption(o => o.setName('image').setDescription('URL de l\'image'))
            .addChannelOption(o => o.setName('salon').setDescription('Salon cible (défaut: salon actuel)'))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('daily')
            .setDescription('Réclamez votre récompense quotidienne')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('balance')
            .setDescription('Voir votre solde ou celui d\'un membre')
            .addUserOption(o => o.setName('membre').setDescription('Membre cible'))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('shop')
            .setDescription('Voir les articles disponibles dans le shop')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('buy')
            .setDescription('Acheter un rôle dans le shop')
            .addStringOption(o => o.setName('role_id').setDescription('ID du rôle à acheter').setRequired(true))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('birthday')
            .setDescription('Gérer votre date d\'anniversaire')
            .addSubcommand(s => s.setName('set').setDescription('Définir votre date d\'anniversaire')
                .addIntegerOption(o => o.setName('jour').setDescription('Jour (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(o => o.setName('mois').setDescription('Mois (1-12)').setRequired(true).setMinValue(1).setMaxValue(12)))
            .addSubcommand(s => s.setName('remove').setDescription('Supprimer votre date d\'anniversaire'))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('pay')
            .setDescription('[Premium] Transférer des coins à un autre membre')
            .addUserOption(o => o.setName('membre').setDescription('Membre destinataire').setRequired(true))
            .addIntegerOption(o => o.setName('montant').setDescription('Montant à transférer').setRequired(true).setMinValue(1))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('remind')
            .setDescription('[Premium] Créer un rappel automatique')
            .addStringOption(o => o.setName('message').setDescription('Message du rappel').setRequired(true))
            .addStringOption(o => o.setName('delai').setDescription('Délai (ex: 30m, 2h, 1d)').setRequired(true))
            .toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.SHARD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.SHARD_CLIENT_ID), { body: commands });
        console.log('✅ Commandes slash Shard enregistrées');
    } catch (err) {
        console.error('Erreur enregistrement commandes:', err.message);
    }

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
});

client.on('guildMemberAdd', async (member) => {
    const settings = await getSettings(member.guild.id);
    if (!settings) return;

    if (settings.autoRoleId) {
        try {
            await member.roles.add(settings.autoRoleId);
        } catch (err) {
            console.error('Erreur auto role:', err.message);
        }
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

function buildControlPanel(data) {
    const embed = new EmbedBuilder()
        .setColor(data.locked ? 0xef4444 : 0x3b82f6)
        .setTitle('Gestion du salon')
        .addFields(
            { name: 'Statut', value: data.locked ? 'Fermé' : 'Ouvert', inline: true },
            { name: 'Limite', value: data.limit > 0 ? `${data.limit} membres max` : 'Illimité', inline: true }
        )
        .setFooter({ text: 'Seul le créateur peut modifier ce salon · Supprimé automatiquement si vide' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tv_lock')
            .setLabel(data.locked ? 'Ouvrir' : 'Fermer')
            .setStyle(data.locked ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('tv_limit')
            .setLabel('Limiter')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('tv_rename')
            .setLabel('Renommer')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('tv_delete')
            .setLabel('Supprimer')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

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

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
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

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: 'Permission refusée.', flags: MessageFlags.Ephemeral });
        }
        const description = interaction.options.getString('description');
        const titre = interaction.options.getString('titre');
        const footer = interaction.options.getString('footer');
        const couleur = interaction.options.getString('couleur') || '#3b82f6';
        const image = interaction.options.getString('image');
        const salon = interaction.options.getChannel('salon') || interaction.channel;

        const colorInt = parseInt(couleur.replace('#', ''), 16) || 0x3b82f6;
        const embed = new EmbedBuilder().setColor(colorInt).setDescription(description).setTimestamp();
        if (titre) embed.setTitle(titre);
        if (footer) embed.setFooter({ text: footer });
        if (image && image.startsWith('http')) embed.setImage(image);

        try {
            await salon.send({ embeds: [embed] });
            await interaction.reply({ content: `Embed envoyé dans ${salon}.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            await interaction.reply({ content: `Erreur : ${err.message}`, flags: MessageFlags.Ephemeral });
        }
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'daily') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé sur ce serveur.' });
        const [rows] = await db.execute(`SELECT * FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
        const eco = rows[0];
        if (eco?.lastDaily) {
            const next = new Date(eco.lastDaily).getTime() + 86400000;
            if (Date.now() < next) {
                const remaining = Math.ceil((next - Date.now()) / 3600000);
                return interaction.editReply({ content: `⏰ Vous avez déjà réclamé votre daily. Revenez dans **${remaining}h**.` });
            }
        }
        const min = settings.economyDailyMin || 50;
        const max = settings.economyDailyMax || 200;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        const currency = settings.economyCurrencyName || 'coins';
        await db.execute(`INSERT INTO shard_economy (guildId, userId, balance, lastDaily) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE balance = balance + ?, lastDaily = NOW()`, [interaction.guildId, interaction.user.id, amount, amount]);
        const [newRows] = await db.execute(`SELECT balance FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
        return interaction.editReply({ content: `💰 Vous avez reçu **+${amount} ${currency}** !\nSolde total : **${newRows[0]?.balance || amount} ${currency}**` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'balance') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé.' });
        const target = interaction.options.getUser('membre') || interaction.user;
        const currency = settings.economyCurrencyName || 'coins';
        const [rows] = await db.execute(`SELECT balance FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, target.id]);
        const balance = rows[0]?.balance || 0;
        return interaction.editReply({ content: `💳 **${target.username}** possède **${balance} ${currency}**.` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'shop') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé.' });
        const currency = settings.economyCurrencyName || 'coins';
        const [items] = await db.execute(`SELECT * FROM shard_shop WHERE guildId = ? ORDER BY price ASC`, [interaction.guildId]);
        if (!items.length) return interaction.editReply({ content: 'Le shop est vide.' });
        const lines = items.map(item => {
            const role = interaction.guild.roles.cache.get(item.roleId);
            return `• **@${role?.name || item.roleId}** — ${item.price} ${currency} (ID: \`${item.id}\`)`;
        }).join('\n');
        return interaction.editReply({ content: `🛒 **Shop**\n\n${lines}\n\nUtilisez \`/buy <id>\` pour acheter.` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'buy') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé.' });
        const itemId = interaction.options.getString('role_id');
        const currency = settings.economyCurrencyName || 'coins';
        const [items] = await db.execute(`SELECT * FROM shard_shop WHERE id = ? AND guildId = ?`, [itemId, interaction.guildId]);
        if (!items[0]) return interaction.editReply({ content: 'Article introuvable.' });
        const item = items[0];
        const [rows] = await db.execute(`SELECT balance FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
        const balance = rows[0]?.balance || 0;
        if (balance < item.price) return interaction.editReply({ content: `❌ Solde insuffisant. Vous avez **${balance} ${currency}**, cet article coûte **${item.price} ${currency}**.` });
        await db.execute(`UPDATE shard_economy SET balance = balance - ? WHERE guildId = ? AND userId = ?`, [item.price, interaction.guildId, interaction.user.id]);
        try {
            await interaction.member.roles.add(item.roleId);
            const role = interaction.guild.roles.cache.get(item.roleId);
            return interaction.editReply({ content: `✅ Vous avez acheté **@${role?.name || item.roleId}** pour **${item.price} ${currency}** !` });
        } catch {
            await db.execute(`UPDATE shard_economy SET balance = balance + ? WHERE guildId = ? AND userId = ?`, [item.price, interaction.guildId, interaction.user.id]);
            return interaction.editReply({ content: '❌ Impossible d\'attribuer le rôle. Vérifiez les permissions du bot.' });
        }
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'pay') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.isPremium) return interaction.editReply({ content: '⭐ Cette commande nécessite le **Premium**.' });
        if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé.' });
        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const currency = settings.economyCurrencyName || 'coins';
        if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ Vous ne pouvez pas vous transférer des coins à vous-même.' });
        if (target.bot) return interaction.editReply({ content: '❌ Impossible de transférer à un bot.' });
        const [senderRows] = await db.execute(`SELECT balance FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
        const senderBalance = senderRows[0]?.balance || 0;
        if (senderBalance < amount) return interaction.editReply({ content: `❌ Solde insuffisant. Vous avez **${senderBalance} ${currency}**.` });
        await db.execute(`UPDATE shard_economy SET balance = balance - ? WHERE guildId = ? AND userId = ?`, [amount, interaction.guildId, interaction.user.id]);
        await db.execute(`INSERT INTO shard_economy (guildId, userId, balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?`, [interaction.guildId, target.id, amount, amount]);
        return interaction.editReply({ content: `💸 Vous avez transféré **${amount} ${currency}** à ${target}.` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'remind') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = await getSettings(interaction.guildId);
        if (!settings?.isPremium) return interaction.editReply({ content: '⭐ Cette commande nécessite le **Premium**.' });
        const message = interaction.options.getString('message');
        const delai = interaction.options.getString('delai');
        const match = delai.match(/^(\d+)([mhd])$/i);
        if (!match) return interaction.editReply({ content: '❌ Format invalide. Exemples : `30m`, `2h`, `1d`' });
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = unit === 'm' ? value * 60000 : unit === 'h' ? value * 3600000 : value * 86400000;
        const remindAt = new Date(Date.now() + ms);
        await db.execute(`INSERT INTO shard_reminders (guildId, userId, channelId, message, remindAt) VALUES (?, ?, ?, ?, ?)`, [interaction.guildId, interaction.user.id, interaction.channelId, message, remindAt]);
        const label = unit === 'm' ? `${value} minute(s)` : unit === 'h' ? `${value} heure(s)` : `${value} jour(s)`;
        return interaction.editReply({ content: `⏰ Rappel enregistré dans **${label}** : *${message}*` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'birthday') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
            const day = interaction.options.getInteger('jour');
            const month = interaction.options.getInteger('mois');
            await db.execute(`INSERT INTO shard_birthdays (guildId, userId, day, month) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE day = ?, month = ?`, [interaction.guildId, interaction.user.id, day, month, day, month]);
            return interaction.reply({ content: `🎂 Votre anniversaire a été enregistré : **${day}/${month}**.`, flags: MessageFlags.Ephemeral });
        }
        if (sub === 'remove') {
            await db.execute(`DELETE FROM shard_birthdays WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
            return interaction.reply({ content: 'Votre date d\'anniversaire a été supprimée.', flags: MessageFlags.Ephemeral });
        }
    }

    // Native Discord polls handle voting internally — the old poll_vote_*
    // buttons are no longer emitted by /shard/guild/:guildID/poll. Legacy
    // messages from before the migration will simply ignore clicks.

    if (interaction.isButton() && interaction.customId === 'giveaway_enter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const msgId = interaction.message.id;
        const [rows] = await db.execute(`SELECT * FROM shard_giveaways WHERE messageId = ? AND ended = 0`, [msgId]);
        if (!rows[0]) return interaction.editReply({ content: 'Ce giveaway est terminé.' });
        const gw = rows[0];
        const settings = await getSettings(interaction.guildId);
        if (settings?.isPremium) {
            if (gw.minRole) {
                if (!interaction.member.roles.cache.has(gw.minRole)) {
                    const role = interaction.guild.roles.cache.get(gw.minRole);
                    return interaction.editReply({ content: `❌ Vous devez avoir le rôle **${role?.name || gw.minRole}** pour participer.` });
                }
            }
            if (gw.minLevel > 0) {
                const [lvRows] = await db.execute(`SELECT level FROM shard_levels WHERE guildId = ? AND userId = ?`, [interaction.guildId, interaction.user.id]);
                const userLevel = lvRows[0]?.level || 0;
                if (userLevel < gw.minLevel) {
                    return interaction.editReply({ content: `❌ Vous devez être au moins niveau **${gw.minLevel}** pour participer. (Votre niveau : ${userLevel})` });
                }
            }
        }
        try {
            await db.execute(`INSERT INTO shard_giveaway_entries (giveawayId, userId) VALUES (?, ?)`, [gw.id, interaction.user.id]);
            return interaction.editReply({ content: '🎉 Vous participez au giveaway !' });
        } catch {
            return interaction.editReply({ content: 'Vous participez déjà à ce giveaway.' });
        }
    }

    if (interaction.isButton() && interaction.customId === 'ticket_open') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        const member = interaction.member;
        const settings = await getSettings(guild.id);

        if (!settings || !settings.ticketEnabled) {
            return interaction.editReply({ content: 'Le système de tickets est désactivé.' });
        }

        const maxPerUser = settings.ticketMaxPerUser || 1;
        const [openTickets] = await db.execute(
            `SELECT * FROM shard_tickets WHERE guildId = ? AND userId = ? AND status = 'open'`,
            [guild.id, member.id]
        );

        if (openTickets.length >= maxPerUser) {
            return interaction.editReply({ content: `Vous avez déjà ${openTickets.length} ticket(s) ouvert(s). Fermez-les avant d'en ouvrir un nouveau.` });
        }

        const [ticketCountRows] = await db.execute(`SELECT COUNT(*) as cnt FROM shard_tickets WHERE guildId = ?`, [guild.id]);
        const ticketNumber = (ticketCountRows[0]?.cnt || 0) + 1;
        const channelName = `ticket-${String(ticketNumber).padStart(4, '0')}`;

        const permissionOverwrites = [
            { id: guild.roles.everyone, deny: ['ViewChannel'] },
            { id: member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] }
        ];

        if (settings.ticketSupportRoleId) {
            permissionOverwrites.push({
                id: settings.ticketSupportRoleId,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'ManageMessages']
            });
        }

        let ticketChannel;
        try {
            ticketChannel = await guild.channels.create({
                name: channelName,
                type: 0,
                parent: settings.ticketCategoryId || null,
                permissionOverwrites
            });
        } catch (err) {
            return interaction.editReply({ content: `Impossible de créer le salon : ${err.message}` });
        }

        await db.execute(
            `INSERT INTO shard_tickets (guildId, userId, channelId, status) VALUES (?, ?, ?, 'open')`,
            [guild.id, member.id, ticketChannel.id]
        );

        const colorInt = parseInt((settings.ticketPanelColor || '#3b82f6').replace('#', ''), 16) || 0x3b82f6;
        const ticketEmbed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, '0')}`)
            .setDescription(`Bonjour ${member}, un membre du support va vous répondre prochainement.\n\nDécrivez votre problème ci-dessous.`)
            .setFooter({ text: `Ouvert par ${member.user.username}` })
            .setTimestamp();

        const closeBtn = new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Fermer le ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(closeBtn);
        await ticketChannel.send({ content: `${member} ${settings.ticketSupportRoleId ? `<@&${settings.ticketSupportRoleId}>` : ''}`, embeds: [ticketEmbed], components: [row] });

        if (settings.ticketLogChannelId) {
            const logChannel = guild.channels.cache.get(settings.ticketLogChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(0x3b82f6)
                    .setTitle('🎫 Ticket ouvert')
                    .addFields(
                        { name: 'Membre', value: `${member} (${member.user.username})`, inline: true },
                        { name: 'Salon', value: `${ticketChannel}`, inline: true },
                        { name: 'Ticket', value: `#${String(ticketNumber).padStart(4, '0')}`, inline: true }
                    )
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }

        return interaction.editReply({ content: `Votre ticket a été créé : ${ticketChannel}` });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_close') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        const settings = await getSettings(guild.id);
        const channelId = interaction.channelId;

        const [rows] = await db.execute(
            `SELECT * FROM shard_tickets WHERE channelId = ? AND status = 'open'`,
            [channelId]
        );

        if (!rows[0]) return interaction.editReply({ content: 'Ce ticket est déjà fermé ou introuvable.' });

        const ticket = rows[0];
        const canClose = interaction.member.id === ticket.userId ||
            interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) ||
            (settings?.ticketSupportRoleId && interaction.member.roles.cache.has(settings.ticketSupportRoleId));

        if (!canClose) return interaction.editReply({ content: 'Vous ne pouvez pas fermer ce ticket.' });

        await db.execute(`UPDATE shard_tickets SET status = 'closed' WHERE channelId = ?`, [channelId]);

        if (settings?.ticketLogChannelId) {
            const logChannel = guild.channels.cache.get(settings.ticketLogChannelId);
            if (logChannel) {
                const closedBy = interaction.member;
                const opener = await guild.members.fetch(ticket.userId).catch(() => null);
                const logEmbed = new EmbedBuilder()
                    .setColor(0xef4444)
                    .setTitle('🔒 Ticket fermé')
                    .addFields(
                        { name: 'Ouvert par', value: opener ? `${opener} (${opener.user.username})` : ticket.userId, inline: true },
                        { name: 'Fermé par', value: `${closedBy} (${closedBy.user.username})`, inline: true }
                    )
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }

        await interaction.editReply({ content: 'Ticket fermé. Le salon sera supprimé dans 5 secondes.' });
        setTimeout(async () => {
            try { await interaction.channel.delete('Ticket fermé'); } catch {}
        }, 5000);
        return;
    }

    const channelId = interaction.channelId;
    const data = tempChannels.get(channelId);
    const eph = { flags: MessageFlags.Ephemeral };

    if (interaction.isButton() && ['tv_lock', 'tv_limit', 'tv_rename', 'tv_delete'].includes(interaction.customId)) {
        if (!data) return interaction.reply({ content: 'Ce salon n\'est plus actif.', ...eph });
        if (interaction.user.id !== data.ownerId) {
            return interaction.reply({ content: 'Seul le créateur du salon peut le gérer.', ...eph });
        }

        if (interaction.customId === 'tv_lock') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            data.locked = !data.locked;
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                Connect: data.locked ? false : null
            });
            try {
                const msg = await interaction.channel.messages.fetch(data.messageId);
                await msg.edit(buildControlPanel(data));
            } catch {}
            await interaction.editReply({ content: data.locked ? 'Salon fermé.' : 'Salon ouvert.' });
        }

        if (interaction.customId === 'tv_limit') {
            const modal = new ModalBuilder().setCustomId('tv_limit_modal').setTitle('Limiter le salon');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('tv_limit_input')
                    .setLabel('Nombre max de membres (0 = illimité)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex : 5')
                    .setRequired(true).setMinLength(1).setMaxLength(2)
            ));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'tv_rename') {
            const modal = new ModalBuilder().setCustomId('tv_rename_modal').setTitle('Renommer le salon');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('tv_rename_input')
                    .setLabel('Nouveau nom du salon')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex : Salon Gaming')
                    .setValue(interaction.channel.name)
                    .setRequired(true).setMinLength(1).setMaxLength(100)
            ));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'tv_delete') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            tempChannels.delete(channelId);
            try { await interaction.channel.delete('Supprimé par le propriétaire'); } catch {}
            try { await interaction.editReply({ content: 'Salon supprimé.' }); } catch {}
        }
    }

    if (interaction.isModalSubmit()) {
        if (!data) return interaction.reply({ content: 'Ce salon n\'est plus actif.', ...eph });

        if (interaction.customId === 'tv_limit_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const val = parseInt(interaction.fields.getTextInputValue('tv_limit_input')) || 0;
            const clamped = Math.min(Math.max(val, 0), 99);
            data.limit = clamped;
            await interaction.channel.setUserLimit(clamped);
            try {
                const msg = await interaction.channel.messages.fetch(data.messageId);
                await msg.edit(buildControlPanel(data));
            } catch {}
            await interaction.editReply({ content: clamped === 0 ? 'Limite retirée.' : `Limite fixée à **${clamped}** membres.` });
        }

        if (interaction.customId === 'tv_rename_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const newName = interaction.fields.getTextInputValue('tv_rename_input').trim();
            await interaction.channel.setName(newName);
            await interaction.editReply({ content: `Salon renommé en **${newName}**.` });
        }
    }
});

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
