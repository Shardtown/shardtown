/**
 * Shardtown Support Bot.
 *
 * Minimal Discord bot:
 *   1. Stays online with a "Watching shardtwn.fr" presence.
 *   2. Slash commands: /ping, /version.
 *
 * Reads SHARDTOWN_TOKEN from the repo-root .env (loaded by sharder.js).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
    Client, GatewayIntentBits, ActivityType,
    SlashCommandBuilder, REST, Routes, MessageFlags,
} = require('discord.js');

const MANIFEST_URL = process.env.MANIFEST_URL || 'https://shardtwn.fr/updates/latest.json';

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

/* ─── Slash commands ───────────────────────────────────────────────── */

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Latence du bot et de l\'API Discord.')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('version')
        .setDescription('Version actuelle de l\'app desktop Shardtown.')
        .toJSON(),
];

async function registerCommands() {
    if (!process.env.SHARDTOWN_TOKEN) return;
    const rest = new REST({ version: '10' }).setToken(process.env.SHARDTOWN_TOKEN);
    try {
        // Overwriting the global command set wipes any previously deployed
        // commands (eg. /ticket, /close, /ticket-panel from earlier iterations).
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`[Shardtown] ${commands.length} slash commands enregistrées.`);
    } catch (err) {
        console.error('[Shardtown] Échec enregistrement commands:', err.message);
    }
}

/* ─── Lifecycle ────────────────────────────────────────────────────── */

client.once('clientReady', () => {
    console.log(`[Shardtown] Connecté en tant que ${client.user.tag} (shard ${client.shard?.ids?.[0] ?? '?'}).`);
    client.user.setPresence({
        activities: [{ name: 'shardtwn.fr', type: ActivityType.Watching }],
        status: 'online',
    });
    registerCommands();
});

// Refresh presence every 10 min in case Discord drops it.
setInterval(() => {
    if (!client.user) return;
    client.user.setPresence({
        activities: [{ name: 'shardtwn.fr', type: ActivityType.Watching }],
        status: 'online',
    });
}, 10 * 60 * 1000).unref?.();

/* ─── Interactions ─────────────────────────────────────────────────── */

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;
        switch (interaction.commandName) {
            case 'ping':    return cmdPing(interaction);
            case 'version': return cmdVersion(interaction);
        }
    } catch (err) {
        console.error('[Shardtown] Interaction error:', err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'Une erreur est survenue. Réessaie ou contacte un admin.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    }
});

async function cmdPing(interaction) {
    const sent = await interaction.reply({ content: 'Pong…', fetchReply: true, flags: MessageFlags.Ephemeral });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = Math.round(client.ws.ping);
    await interaction.editReply(`Pong ! Round-trip **${latency}ms**, gateway **${ws}ms**.`);
}

async function cmdVersion(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const r = await fetch(MANIFEST_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        await interaction.editReply(
            `Dernière version desktop publiée : **v${j.version}**` +
            (j.pub_date ? ` *(${new Date(j.pub_date).toLocaleString('fr-FR')})*` : '') +
            (j.notes ? `\n\n${String(j.notes).slice(0, 800)}` : '')
        );
    } catch (err) {
        await interaction.editReply(`Impossible de lire \`${MANIFEST_URL}\` : ${err.message}`);
    }
}

/* ─── Login ─────────────────────────────────────────────────────────── */

client.login(process.env.SHARDTOWN_TOKEN).catch(err => {
    console.error('[Shardtown] Login KO:', err.message);
    process.exit(1);
});
