// Manager des bots personnalisés Premium.
//
// Pour chaque ligne `shard_custom_bots`, on maintient en mémoire un client
// discord.js qui se connecte avec le token de l'utilisateur. Le manager :
// - applique la presence/activity configurée
// - enregistre les slash commands Shard sur l'application du bot
// - attache le handler interactionCreate partagé (lib/shardInteractionHandlers)
//   pour que les commandes répondent avec la même logique que Shard officiel
// - expose pushIdentity() pour pousser nom/avatar/bannière via PATCH /users/@me

const { Client, GatewayIntentBits, ActivityType, REST, Routes } = require('discord.js');
const axios = require('axios');
const { buildCommandList } = require('./shardCommands');
const SIH = require('./shardInteractionHandlers');

const ACTIVITY_TYPE_MAP = {
    playing: ActivityType.Playing,
    streaming: ActivityType.Streaming,
    listening: ActivityType.Listening,
    watching: ActivityType.Watching,
    competing: ActivityType.Competing,
};

const PRESENCE_MAP = {
    online: 'online',
    idle: 'idle',
    dnd: 'dnd',
    invisible: 'invisible',
};

let db = null;
let decryptToken = null;

// guildId → { client, row, status, lastError }
const clients = new Map();

function init(deps) {
    db = deps.db;
    decryptToken = deps.decryptToken;
}

async function setStatus(guildId, status, message) {
    if (!db) return;
    try {
        await db.execute(
            'UPDATE shard_custom_bots SET status = ?, statusMessage = ? WHERE guildId = ?',
            [status, message || null, guildId],
        );
    } catch (err) {
        console.error('[customBot] setStatus DB error', guildId, err.message);
    }
}

function buildPresencePayload(row) {
    const status = PRESENCE_MAP[row.presence] || 'online';
    const text = (row.activityText || '').trim();
    if (!text) return { status, activities: [] };
    const type = ACTIVITY_TYPE_MAP[row.activityType] ?? ActivityType.Listening;
    const activity = { name: text, type };
    // Streaming exige une URL Twitch/YouTube valide pour s'afficher comme
    // "Live". Sans URL Discord retombe sur "Playing" — on évite et on remet
    // un Watching faute de mieux pour rester cohérent visuellement.
    if (type === ActivityType.Streaming) {
        activity.url = 'https://www.twitch.tv/discord';
    }
    return { status, activities: [activity] };
}

// PATCH /users/@me sur l'application Discord. Met à jour username/avatar/
// banner. Discord rate-limit username à 2/heure → on n'envoie que les
// champs qui ont changé. Renvoie l'identité retournée par Discord.
async function pushIdentity(rawToken, patch) {
    const body = {};
    if (typeof patch.username === 'string' && patch.username.length > 0) {
        body.username = patch.username;
    }
    if (patch.avatar !== undefined) {
        body.avatar = patch.avatar || null;
    }
    if (patch.banner !== undefined) {
        body.banner = patch.banner || null;
    }
    if (Object.keys(body).length === 0) return null;
    const r = await axios.patch('https://discord.com/api/v10/users/@me', body, {
        headers: { Authorization: `Bot ${rawToken}`, 'Content-Type': 'application/json' },
        timeout: 15000,
        validateStatus: () => true,
        maxBodyLength: 10 * 1024 * 1024,
        maxContentLength: 10 * 1024 * 1024,
    });
    if (r.status !== 200) {
        const err = new Error(r.data?.message || `Discord ${r.status}`);
        err.discordStatus = r.status;
        err.discordBody = r.data;
        throw err;
    }
    return r.data;
}

async function start(row) {
    if (!row || !row.guildId || !row.tokenEncrypted) return false;
    const guildId = row.guildId;

    // Si un client tourne déjà pour ce guild, on le dégage avant.
    await stop(guildId);

    const token = decryptToken(row.tokenEncrypted);
    if (!token) {
        await setStatus(guildId, 'error', 'Token illisible (clé de chiffrement différente ?).');
        return false;
    }

    // Intents minimaux : Guilds suffit pour les slash commands + boutons.
    // GuildMembers est utile pour les commandes mod (warn/kick/ban) qui
    // fetchent un member par ID ; on l'ajoute pour parité avec Shard.
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    // Maps locaux par client custom — état isolé de Shard officiel.
    const captchaStore = new Map();
    const tempChannels = new Map();

    // Handler partagé : slash commands, boutons, modals — même logique que
    // Shard officiel. Les helpers sont créés à partir de db (server.js pool).
    SIH.attach({ client, db, captchaStore, tempChannels });

    const entry = { client, row, status: 'starting', lastError: null };
    clients.set(guildId, entry);

    client.once('ready', async () => {
        entry.status = 'running';
        try {
            client.user.setPresence(buildPresencePayload(row));
        } catch (e) {
            console.error('[customBot] setPresence failed', guildId, e.message);
        }
        // Enregistre les slash commands sur l'application du bot custom —
        // sinon Discord n'affiche aucune commande quand l'utilisateur tape /.
        // On utilise la même liste que Shard officiel (lib/shardCommands.js)
        // pour garantir la parité.
        try {
            const rest = new REST({ version: '10' }).setToken(token);
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: buildCommandList() },
            );
            console.log(`[customBot] ${guildId} commands registered (${buildCommandList().length})`);
        } catch (e) {
            console.error('[customBot] register commands failed', guildId, e.message);
        }
        await setStatus(guildId, 'running', null);
        console.log(`[customBot] ${guildId} online as ${client.user.tag}`);
    });

    client.on('error', err => {
        console.error('[customBot] client error', guildId, err.message);
        entry.lastError = err.message;
    });
    client.on('shardError', err => {
        console.error('[customBot] shardError', guildId, err.message);
        entry.lastError = err.message;
    });

    try {
        await client.login(token);
        return true;
    } catch (err) {
        clients.delete(guildId);
        try { client.destroy(); } catch { /* ignore */ }
        const msg = err?.message || 'Connexion Discord refusée.';
        await setStatus(guildId, 'error', msg);
        console.error('[customBot] login failed', guildId, msg);
        return false;
    }
}

async function stop(guildId) {
    const entry = clients.get(guildId);
    if (!entry) return false;
    clients.delete(guildId);
    try {
        await entry.client.destroy();
    } catch (err) {
        console.error('[customBot] destroy error', guildId, err.message);
    }
    await setStatus(guildId, 'stopped', null);
    return true;
}

async function restart(row) {
    await stop(row.guildId);
    return start(row);
}

// Au boot serveur : recharge tous les bots configurés et tente de les
// connecter. On séquence avec un petit délai pour ne pas se faire jeter
// par les identify rate-limits si plusieurs bots cohabitent.
async function startAll() {
    if (!db) return;
    try {
        const [rows] = await db.execute(
            `SELECT id, guildId, name, avatarUrl, bannerUrl, botUserId, tokenEncrypted,
                    presence, activityType, activityText
             FROM shard_custom_bots
             WHERE tokenEncrypted IS NOT NULL AND tokenEncrypted <> ''`,
        );
        console.log(`[customBot] booting ${rows.length} custom bot(s)…`);
        for (const row of rows) {
            await start(row);
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (err) {
        console.error('[customBot] startAll error', err.message);
    }
}

function getRuntimeStatus(guildId) {
    const entry = clients.get(guildId);
    if (!entry) return { running: false };
    return {
        running: entry.status === 'running',
        status: entry.status,
        lastError: entry.lastError,
        botTag: entry.client.user?.tag || null,
    };
}

module.exports = {
    init,
    start,
    stop,
    restart,
    startAll,
    pushIdentity,
    getRuntimeStatus,
};
