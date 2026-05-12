/**
 * Shardtown Support Bot.
 *
 * Lightweight Discord bot focused on three things:
 *   1. Stay online (custom Watching presence pointing at shardtwn.fr).
 *   2. Slash commands : /ping, /version, /ticket (open a support thread),
 *      /close (close a ticket channel).
 *   3. Ticket panel posted in any channel via /ticket-panel (admin), with
 *      a button that opens a private channel under the SUPPORT_CATEGORY_ID
 *      category, accessible only to the requester + SUPPORT_STAFF_ROLE_ID.
 *
 * Reads SHARDTOWN_TOKEN, SUPPORT_CATEGORY_ID, SUPPORT_STAFF_ROLE_ID
 * from the repo-root .env (loaded by sharder.js).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
    Client, GatewayIntentBits, ActivityType,
    SlashCommandBuilder, REST, Routes,
    PermissionFlagsBits, ChannelType,
    EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle,
    MessageFlags,
} = require('discord.js');

const SUPPORT_CATEGORY_ID    = process.env.SUPPORT_CATEGORY_ID    || '';
const SUPPORT_STAFF_ROLE_ID  = process.env.SUPPORT_STAFF_ROLE_ID  || '';
const MANIFEST_URL           = process.env.MANIFEST_URL           || 'https://shardtwn.fr/updates/latest.json';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ],
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
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ouvrir un ticket de support.')
        .addStringOption(o =>
            o.setName('sujet')
                .setDescription('Sujet rapide du ticket (optionnel).')
                .setRequired(false)
                .setMaxLength(80))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('close')
        .setDescription('Fermer le ticket courant (à utiliser dans un salon de ticket).')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('ticket-panel')
        .setDescription('[Admin] Poste un panneau de support cliquable dans ce salon.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),
];

async function registerCommands() {
    if (!process.env.SHARDTOWN_TOKEN) return;
    const rest = new REST({ version: '10' }).setToken(process.env.SHARDTOWN_TOKEN);
    try {
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
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case 'ping':         return cmdPing(interaction);
                case 'version':      return cmdVersion(interaction);
                case 'ticket':       return cmdTicket(interaction);
                case 'close':        return cmdClose(interaction);
                case 'ticket-panel': return cmdTicketPanel(interaction);
            }
        } else if (interaction.isButton()) {
            if (interaction.customId === 'shardtown:open-ticket') {
                return openTicket(interaction);
            }
            if (interaction.customId === 'shardtown:close-ticket') {
                return closeTicket(interaction);
            }
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

async function cmdTicket(interaction) {
    const subject = interaction.options.getString('sujet') || null;
    await createTicketChannel(interaction, subject);
}

async function cmdClose(interaction) {
    if (!interaction.channel?.name?.startsWith('ticket-')) {
        return interaction.reply({
            content: 'Cette commande ne fonctionne que dans un salon de ticket.',
            flags: MessageFlags.Ephemeral,
        });
    }
    await closeTicket(interaction);
}

async function cmdTicketPanel(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: 'Permission insuffisante.',
            flags: MessageFlags.Ephemeral,
        });
    }
    const embed = new EmbedBuilder()
        .setTitle('Support Shardtown')
        .setDescription(
            'Une question, un bug, une demande Premium ?\n\n' +
            'Clique sur le bouton ci-dessous pour ouvrir un ticket privé. L\'équipe Shardtown te répondra dès que possible.'
        )
        .setColor(0x5B6DFF);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('shardtown:open-ticket')
            .setLabel('Ouvrir un ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫'),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
}

/* ─── Ticket flow ──────────────────────────────────────────────────── */

async function openTicket(interaction) {
    await createTicketChannel(interaction, null);
}

async function createTicketChannel(interaction, subject) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    if (!guild) {
        return interaction.editReply('Cette action n\'est dispo que dans un serveur.');
    }

    // One open ticket per user — find an existing one before creating a new one.
    const prefix = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 18)}`;
    const existing = guild.channels.cache.find(c =>
        c.name?.startsWith(prefix) && c.permissionOverwrites?.cache?.has(interaction.user.id)
    );
    if (existing) {
        return interaction.editReply(`Tu as déjà un ticket ouvert : <#${existing.id}>.`);
    }

    // Build the permission overwrites: everyone hidden, requester + staff allowed.
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
    ];
    if (SUPPORT_STAFF_ROLE_ID) {
        overwrites.push({
            id: SUPPORT_STAFF_ROLE_ID,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        });
    }

    let channel;
    try {
        channel = await guild.channels.create({
            name: `${prefix}-${Date.now().toString(36).slice(-4)}`,
            type: ChannelType.GuildText,
            parent: SUPPORT_CATEGORY_ID || undefined,
            permissionOverwrites: overwrites,
            topic: subject ? `Ticket de <@${interaction.user.id}> · ${subject}` : `Ticket de <@${interaction.user.id}>`,
        });
    } catch (err) {
        console.error('[Shardtown] Création ticket KO:', err.message);
        return interaction.editReply(
            'Impossible de créer ton ticket — vérifie que le bot a la permission **Gérer les salons** dans la catégorie support.'
        );
    }

    const welcome = new EmbedBuilder()
        .setTitle('Ticket ouvert')
        .setDescription(
            `Bienvenue <@${interaction.user.id}> ! Décris ta demande, l'équipe te répondra dès que possible.\n\n` +
            (subject ? `**Sujet** : ${subject}\n\n` : '') +
            'Tu peux fermer ce ticket avec la commande **/close** ou le bouton ci-dessous.'
        )
        .setColor(0x5B6DFF);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('shardtown:close-ticket')
            .setLabel('Fermer le ticket')
            .setStyle(ButtonStyle.Danger),
    );
    const mention = SUPPORT_STAFF_ROLE_ID ? `<@&${SUPPORT_STAFF_ROLE_ID}>` : '';
    await channel.send({ content: mention || undefined, embeds: [welcome], components: [row] });

    await interaction.editReply(`Ticket créé : <#${channel.id}>`);
}

async function closeTicket(interaction) {
    if (!interaction.channel?.name?.startsWith('ticket-')) {
        return interaction.reply({
            content: 'Cette action ne fonctionne que dans un salon de ticket.',
            flags: MessageFlags.Ephemeral,
        });
    }
    await interaction.reply({
        content: 'Ticket fermé. Le salon sera supprimé dans 5 secondes.',
    });
    setTimeout(() => {
        interaction.channel.delete('Ticket fermé par ' + interaction.user.tag).catch(err => {
            console.error('[Shardtown] Suppression salon KO:', err.message);
        });
    }, 5000);
}

/* ─── Login ─────────────────────────────────────────────────────────── */

client.login(process.env.SHARDTOWN_TOKEN).catch(err => {
    console.error('[Shardtown] Login KO:', err.message);
    process.exit(1);
});
