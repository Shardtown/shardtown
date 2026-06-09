// Ticket system — core business logic.
// Handles ticket creation, closing, transcript export, AFK timeout.

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelType, PermissionFlagsBits, OverwriteType,
} = require('discord.js');
const db = require('./ticketDB');

// ── channel creation ──────────────────────────────────────────────────────────

async function createTicketChannel(guild, ticket, category, config) {
    const staffRoles = config.staff_roles || [];
    const discordCategoryId = category.categoryId || null;

    const permissionOverwrites = [
        // Deny @everyone
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        // Allow ticket author
        {
            id: ticket.authorId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
        // Allow staff roles
        ...staffRoles.map(roleId => ({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ManageMessages,
            ],
        })),
    ];

    const channelOptions = {
        name: `ticket-${ticket.channelName || ticket.id.toLowerCase()}`,
        type: ChannelType.GuildText,
        permissionOverwrites,
        topic: ticket.id,
    };
    if (discordCategoryId) channelOptions.parent = discordCategoryId;

    return guild.channels.create(channelOptions);
}

// ── default config ────────────────────────────────────────────────────────────

function getDefaultCategories() {
    return [
        { id: 'java',    label: 'Support Java',    emoji: '☕', description: 'Problème sur la version Java',    categoryId: null, color: '#f59e0b' },
        { id: 'bedrock', label: 'Support Bedrock',  emoji: '🪨', description: 'Problème sur la version Bedrock', categoryId: null, color: '#6366f1' },
        { id: 'site',    label: 'Support Site',     emoji: '🌐', description: 'Problème avec le site web',       categoryId: null, color: '#10b981' },
        { id: 'discord', label: 'Support Discord',  emoji: '💬', description: 'Problème sur le serveur Discord', categoryId: null, color: '#7c3aed' },
    ];
}

async function getGuildConfig(guildId) {
    const raw = await db.getAllConfig(guildId);
    return {
        categories:            raw.categories            || getDefaultCategories(),
        staff_roles:           raw.staff_roles           || [],
        admin_roles:           raw.admin_roles           || [],
        transcript_channel_id: raw.transcript_channel_id || null,
        log_channel_id:        raw.log_channel_id        || null,
        max_tickets_per_user:  raw.max_tickets_per_user  || 1,
        afk_timeout_minutes:   raw.afk_timeout_minutes   || 0,
        panel_title:           raw.panel_title           || 'Support Shardtown',
        panel_description:     raw.panel_description     || 'Sélectionnez une catégorie ci-dessous pour ouvrir un ticket.\nNotre équipe vous répondra dans les meilleurs délais.',
        panel_footer:          raw.panel_footer          || '',
        panel_color:           raw.panel_color           || '#7c3aed',
    };
}

// ── permission helpers ────────────────────────────────────────────────────────

function isStaff(member, config) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const staffRoles = config.staff_roles || [];
    const adminRoles = config.admin_roles || [];
    return [...staffRoles, ...adminRoles].some(r => member.roles.cache.has(r));
}

// ── panel ─────────────────────────────────────────────────────────────────────

async function buildPanel(config) {
    const categories = config.categories || getDefaultCategories();

    const colorHex = String(config.panel_color || '#7c3aed').replace('#', '');
    const colorInt = parseInt(colorHex, 16) || 0x7c3aed;

    const embed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(config.panel_title || 'Support Shardtown')
        .setDescription(config.panel_description || 'Sélectionnez une catégorie ci-dessous pour ouvrir un ticket.\nNotre équipe vous répondra dans les meilleurs délais.')
        .setTimestamp();

    if (config.panel_footer) {
        embed.setFooter({ text: config.panel_footer });
    }

    // Single select menu — user picks a category then a modal opens for description
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket:pick_cat')
        .setPlaceholder('Choisissez une catégorie…')
        .setMinValues(1)
        .setMaxValues(1);

    for (const cat of categories) {
        const opt = new StringSelectMenuOptionBuilder()
            .setValue(cat.id)
            .setLabel(cat.label);
        if (cat.description) opt.setDescription(cat.description.slice(0, 100));
        if (cat.emoji && !cat.emoji.includes(':')) opt.setEmoji(cat.emoji);
        select.addOptions(opt);
    }

    const row = new ActionRowBuilder().addComponents(select);
    return { embeds: [embed], components: [row] };
}

// ── ticket creation ───────────────────────────────────────────────────────────

async function openTicket(interaction, categoryId, description) {
    const guild   = interaction.guild;
    const guildId = guild.id;
    const config  = await getGuildConfig(guildId);

    const categories = config.categories || getDefaultCategories();
    const category   = categories.find(c => c.id === categoryId);
    if (!category) {
        return interaction.reply({ content: 'Catégorie introuvable. Contactez un administrateur.', ephemeral: true });
    }

    // Max open tickets check
    const max  = config.max_tickets_per_user || 1;
    const open = await db.getOpenTicketsByAuthor(guildId, interaction.user.id);
    if (open.length >= max) {
        return interaction.reply({
            content: `Vous avez déjà ${open.length} ticket(s) ouvert(s). Veuillez les fermer avant d'en ouvrir un nouveau.`,
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const ticketId    = await db.getUniqueTicketId();
    const authorPseudo = interaction.member?.displayName || interaction.user.username;

    // Channel name uses Discord username (sanitized), ID is kept for internal storage
    const channelName = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'user';

    // Create Discord channel
    let channel;
    try {
        channel = await createTicketChannel(guild, { id: ticketId, authorId: interaction.user.id, channelName }, category, config);
    } catch (err) {
        console.error('[ticket] channel creation failed:', err);
        return interaction.editReply({ content: 'Impossible de créer le salon. Vérifiez les permissions du bot.' });
    }

    // Persist ticket
    await db.createTicket(ticketId, guildId, channel.id, interaction.user.id, authorPseudo, categoryId);

    // AFK timeout
    if (config.afk_timeout_minutes > 0) {
        const t = new Date(Date.now() + config.afk_timeout_minutes * 60 * 1000);
        await db.setAfkTimeout(ticketId, t);
    }

    // Send welcome message
    const welcomeEmbed = new EmbedBuilder()
        .setColor(parseInt((category.color || '#7c3aed').replace('#', ''), 16))
        .setTitle(`Ticket #${ticketId}`)
        .addFields(
            { name: 'Membre', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Catégorie', value: `${category.emoji || ''} ${category.label}`, inline: true },
            { name: 'Description', value: description || 'Aucune description fournie.' },
        )
        .setFooter({ text: `ID: ${ticketId}` })
        .setTimestamp();

    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('✋'),
    );

    await channel.send({
        content: `<@${interaction.user.id}> ${config.staff_roles.map(r => `<@&${r}>`).join(' ')}`.trim(),
        embeds: [welcomeEmbed],
        components: [controlRow],
    });

    // Log
    logToChannel(guild, config, `Ticket \`${ticketId}\` ouvert par <@${interaction.user.id}> — catégorie **${category.label}**`, 0x10b981);

    await interaction.editReply({ content: `Votre ticket a été créé : ${channel}` });
}

// ── close ─────────────────────────────────────────────────────────────────────

async function confirmClose(interaction, ticketId) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket:close_confirm:${ticketId}`).setLabel('Confirmer la fermeture').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket:close_cancel:${ticketId}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: 'Voulez-vous vraiment fermer ce ticket ?', components: [row], ephemeral: true });
}

async function doClose(interaction, ticketId, client) {
    const ticket = await db.getTicketById(ticketId);
    if (!ticket) return interaction.reply({ content: 'Ticket introuvable.', ephemeral: true });

    const guild  = interaction.guild;
    const config = await getGuildConfig(guild.id);

    await interaction.deferReply({ ephemeral: true });

    // Generate transcript
    const channel = guild.channels.cache.get(ticket.channel_id);
    if (channel) {
        try {
            const messages = await exportMessages(channel);
            await db.saveTranscript(ticket, messages);
            // Post transcript link to dedicated channel
            if (config.transcript_channel_id) {
                const tChan = guild.channels.cache.get(config.transcript_channel_id);
                if (tChan) {
                    const tEmbed = new EmbedBuilder()
                        .setColor(0x6366f1)
                        .setTitle(`Transcript — Ticket #${ticketId}`)
                        .addFields(
                            { name: 'Membre', value: `<@${ticket.author_id}>`, inline: true },
                            { name: 'Catégorie', value: ticket.category, inline: true },
                            { name: 'Fermé par', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Messages', value: String(messages.length), inline: true },
                        )
                        .setTimestamp();
                    await tChan.send({ embeds: [tEmbed] });
                }
            }
        } catch (err) {
            console.error('[ticket] transcript error:', err);
        }
    }

    await db.closeTicket(ticketId, interaction.user.id);
    logToChannel(guild, config, `Ticket \`${ticketId}\` fermé par <@${interaction.user.id}>`, 0xef4444);

    await interaction.editReply({ content: 'Ticket fermé. Le salon va être supprimé dans 5 secondes.' });
    setTimeout(async () => {
        try { if (channel) await channel.delete(); } catch { /* ignored */ }
    }, 5000);
}

// ── claim ─────────────────────────────────────────────────────────────────────

async function claimTicket(interaction, ticketId) {
    const ticket = await db.getTicketById(ticketId);
    if (!ticket) return interaction.reply({ content: 'Ticket introuvable.', ephemeral: true });

    const config = await getGuildConfig(interaction.guild.id);
    if (!isStaff(interaction.member, config)) {
        return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
    }

    const claimed = await db.claimTicket(ticketId, interaction.user.id);
    if (!claimed) return interaction.reply({ content: 'Vous avez déjà pris en charge ce ticket.', ephemeral: true });

    const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setDescription(`Ticket pris en charge par <@${interaction.user.id}>`);

    await interaction.reply({ embeds: [embed] });
}

// ── transcript export ─────────────────────────────────────────────────────────

async function exportMessages(channel) {
    const all = [];
    let lastId;
    for (;;) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts);
        if (!batch.size) break;
        all.push(...batch.values());
        lastId = batch.last().id;
        if (batch.size < 100) break;
    }
    all.reverse();

    return all.map(msg => ({
        id:        msg.id,
        content:   msg.content,
        timestamp: msg.createdTimestamp,
        edited:    msg.editedTimestamp !== null,
        author: {
            id:          msg.author.id,
            username:    msg.author.username,
            displayName: msg.member?.displayName || msg.author.username,
            avatarURL:   msg.author.displayAvatarURL({ size: 256 }),
            isBot:       msg.author.bot,
        },
        embeds: msg.embeds.map(e => ({
            title:       e.title,
            description: e.description,
            color:       e.color ? `#${e.color.toString(16).padStart(6, '0')}` : null,
            fields:      e.fields,
            image:       e.image?.url || null,
            thumbnail:   e.thumbnail?.url || null,
            footer:      e.footer ? { text: e.footer.text } : null,
            timestamp:   e.timestamp || null,
        })),
        attachments: msg.attachments.map(a => ({ name: a.name, url: a.url, contentType: a.contentType })),
        reactions:   msg.reactions.cache.map(r => ({ emoji: r.emoji.toString(), count: r.count })),
    }));
}

// ── log helper ────────────────────────────────────────────────────────────────

async function logToChannel(guild, config, text, color = 0x6366f1) {
    if (!config.log_channel_id) return;
    try {
        const chan = guild.channels.cache.get(config.log_channel_id);
        if (chan) await chan.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()] });
    } catch { /* non-fatal */ }
}

// ── AFK timeout checker ───────────────────────────────────────────────────────

async function checkAfkTimeouts(client) {
    try {
        const tickets = await db.getExpiredAfkTickets();
        for (const ticket of tickets) {
            try {
                const guild = client.guilds.cache.get(ticket.guild_id);
                if (!guild) continue;
                const channel = guild.channels.cache.get(ticket.channel_id);
                if (!channel) { await db.clearAfkTimeout(ticket.id); continue; }
                const config = await getGuildConfig(ticket.guild_id);
                await db.clearAfkTimeout(ticket.id);
                const embed = new EmbedBuilder()
                    .setColor(0xf59e0b)
                    .setTitle('Ticket inactif')
                    .setDescription('Ce ticket a été fermé automatiquement en raison d\'une inactivité prolongée.')
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket:close_confirm:${ticket.id}`).setLabel('Confirmer la fermeture').setStyle(ButtonStyle.Danger),
                );
                await channel.send({ embeds: [embed], components: [row] });
                logToChannel(guild, config, `Ticket \`${ticket.id}\` inactif — demande de fermeture envoyée.`, 0xf59e0b);
            } catch (err) {
                console.error('[ticket] afk timeout error:', ticket.id, err.message);
            }
        }
    } catch (err) {
        console.error('[ticket] afk check failed:', err.message);
    }
}

module.exports = {
    getGuildConfig,
    getDefaultCategories,
    isStaff,
    buildPanel,
    openTicket,
    confirmClose,
    doClose,
    claimTicket,
    exportMessages,
    checkAfkTimeouts,
};
