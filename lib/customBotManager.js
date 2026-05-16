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
    // Discord type 4 — texte affiché sans préfixe ("Joue à", "Écoute" …).
    custom: ActivityType.Custom,
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
    // activityType=none ou texte vide → bot online sans activité.
    if (row.activityType === 'none') return { status, activities: [] };
    const text = (row.activityText || '').trim();
    if (!text) return { status, activities: [] };
    // Custom Status (type 4) : Discord affiche le `state` sans préfixe.
    // `name` est requis par l'API mais ignoré dans le rendu pour ce type.
    if (row.activityType === 'custom') {
        return { status, activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: text }] };
    }
    const type = ACTIVITY_TYPE_MAP[row.activityType] ?? ActivityType.Listening;
    const activity = { name: text, type };
    // Streaming exige une URL Twitch/YouTube valide pour s'afficher comme
    // "Live". Sans URL Discord retombe sur "Playing" — on en met une par
    // défaut pour préserver l'affichage Live.
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

// Quand `purge` est vrai (appelé par DELETE), avant de couper la session
// on fait quitter au bot tous ses serveurs Discord et on wipe les slash
// commands enregistrées sur son application. Ça évite que le bot reste
// présent dans les serveurs du user après suppression côté dashboard.
async function stop(guildId, opts = {}) {
    const entry = clients.get(guildId);
    if (!entry) return false;
    clients.delete(guildId);
    if (opts.purge) {
        try {
            const guilds = Array.from(entry.client.guilds.cache.values());
            for (const g of guilds) {
                try { await g.leave(); } catch (e) {
                    console.error('[customBot] leave guild failed', guildId, g.id, e.message);
                }
            }
            // Wipe les slash commands au niveau de l'application.
            const rawToken = entry.client.token;
            if (rawToken && entry.client.user?.id) {
                try {
                    const rest = new REST({ version: '10' }).setToken(rawToken);
                    await rest.put(Routes.applicationCommands(entry.client.user.id), { body: [] });
                } catch (e) {
                    console.error('[customBot] clear commands failed', guildId, e.message);
                }
            }
        } catch (err) {
            console.error('[customBot] purge error', guildId, err.message);
        }
    }
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
    if (!entry) return { running: false, inMemory: false };
    return {
        running: entry.status === 'running',
        inMemory: true,
        status: entry.status,
        lastError: entry.lastError,
        botTag: entry.client.user?.tag || null,
        // Combien de serveurs Discord le bot a rejoint. 0 = le bot est en
        // ligne mais pas (encore) invité sur le serveur du user.
        guildCount: entry.client.guilds?.cache?.size ?? 0,
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
