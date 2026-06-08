// Ticket system — Discord interaction router.
// Handles slash commands, buttons, and modals prefixed with "ticket:".

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const db      = require('./ticketDB');
const manager = require('./ticketManager');

// ── public API ────────────────────────────────────────────────────────────────

function isTicketInteraction(interaction) {
    if (interaction.isChatInputCommand()) return interaction.commandName === 'ticket';
    if (interaction.isButton())        return interaction.customId.startsWith('ticket:');
    if (interaction.isModalSubmit())   return interaction.customId.startsWith('ticket:modal:');
    return false;
}

async function handle(interaction, client) {
    try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
            return handleCommand(interaction, client);
        }
        if (interaction.isButton() && interaction.customId.startsWith('ticket:')) {
            return handleButton(interaction, client);
        }
        if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:modal:')) {
            return handleModal(interaction, client);
        }
    } catch (err) {
        console.error('[ticket] unhandled error:', err);
        const reply = { content: 'Une erreur est survenue.', ephemeral: true };
        try {
            if (interaction.deferred || interaction.replied) await interaction.editReply(reply);
            else await interaction.reply({ ...reply, flags: MessageFlags.Ephemeral });
        } catch { /* ignored */ }
    }
}

// attach is called once from Shard/bot.js after SIH.attach()
function attach(client) {
    setInterval(() => manager.checkAfkTimeouts(client), 60_000);
}

// ── slash command: /ticket <subcommand> ───────────────────────────────────────

async function handleCommand(interaction, client) {
    const sub    = interaction.options.getSubcommand();
    const guild  = interaction.guild;
    const config = await manager.getGuildConfig(guild.id);

    if (sub === 'panel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'Administrateur requis.', flags: MessageFlags.Ephemeral });
        }
        const panel = await manager.buildPanel(config);
        await interaction.channel.send(panel);
        return interaction.reply({ content: 'Panel envoyé.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'config') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'Administrateur requis.', flags: MessageFlags.Ephemeral });
        }
        const url = process.env.TICKET_DASHBOARD_URL || `${process.env.BASE_URL || 'https://www.shardtwn.xyz'}/support`;
        return interaction.reply({ content: `Dashboard de configuration : ${url}`, flags: MessageFlags.Ephemeral });
    }

    // Commands below require being inside a ticket channel
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'Cette commande ne peut être utilisée que dans un salon de ticket.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'close') {
        const isAuthor = interaction.user.id === ticket.author_id;
        const isStaff  = manager.isStaff(interaction.member, config);
        if (!isAuthor && !isStaff) {
            return interaction.reply({ content: 'Vous ne pouvez pas fermer ce ticket.', flags: MessageFlags.Ephemeral });
        }
        return manager.confirmClose(interaction, ticket.id);
    }

    if (sub === 'claim') {
        if (!manager.isStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Réservé au staff.', flags: MessageFlags.Ephemeral });
        }
        return manager.claimTicket(interaction, ticket.id);
    }

    if (sub === 'add') {
        if (!manager.isStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Réservé au staff.', flags: MessageFlags.Ephemeral });
        }
        const target = interaction.options.getUser('membre');
        try {
            await interaction.channel.permissionOverwrites.edit(target.id, {
                ViewChannel:       true,
                SendMessages:      true,
                ReadMessageHistory: true,
            });
            return interaction.reply({ content: `<@${target.id}> a été ajouté au ticket.` });
        } catch {
            return interaction.reply({ content: 'Impossible de modifier les permissions.', flags: MessageFlags.Ephemeral });
        }
    }

    if (sub === 'remove') {
        if (!manager.isStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Réservé au staff.', flags: MessageFlags.Ephemeral });
        }
        const target = interaction.options.getUser('membre');
        if (target.id === ticket.author_id) {
            return interaction.reply({ content: 'Impossible de retirer l\'auteur du ticket.', flags: MessageFlags.Ephemeral });
        }
        try {
            await interaction.channel.permissionOverwrites.edit(target.id, { ViewChannel: false });
            return interaction.reply({ content: `<@${target.id}> a été retiré du ticket.` });
        } catch {
            return interaction.reply({ content: 'Impossible de modifier les permissions.', flags: MessageFlags.Ephemeral });
        }
    }

    if (sub === 'rename') {
        if (!manager.isStaff(interaction.member, config)) {
            return interaction.reply({ content: 'Réservé au staff.', flags: MessageFlags.Ephemeral });
        }
        const name = interaction.options.getString('nom').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50);
        try {
            await interaction.channel.setName(`ticket-${name}`);
            return interaction.reply({ content: `Salon renommé : ticket-${name}` });
        } catch {
            return interaction.reply({ content: 'Impossible de renommer le salon.', flags: MessageFlags.Ephemeral });
        }
    }

    if (sub === 'info') {
        const claimed = ticket.claimed_by.map(id => `<@${id}>`).join(', ') || 'Non pris en charge';
        const embed = new EmbedBuilder()
            .setColor(0x6366f1)
            .setTitle(`Ticket #${ticket.id}`)
            .addFields(
                { name: 'Membre', value: `<@${ticket.author_id}>`, inline: true },
                { name: 'Catégorie', value: ticket.category, inline: true },
                { name: 'Pris en charge', value: claimed, inline: true },
                { name: 'Ouvert le', value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:F>`, inline: true },
            )
            .setFooter({ text: `ID: ${ticket.id}` });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

// ── buttons ───────────────────────────────────────────────────────────────────

async function handleButton(interaction, client) {
    const parts    = interaction.customId.split(':');
    const action   = parts[1];
    const payload  = parts[2];

    // ticket:open:CATID — open ticket panel button
    if (action === 'open') {
        const categoryId = payload;
        const config     = await manager.getGuildConfig(interaction.guild.id);
        const categories = config.categories || manager.getDefaultCategories();
        const category   = categories.find(c => c.id === categoryId);
        if (!category) return interaction.reply({ content: 'Catégorie introuvable.', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder()
            .setCustomId(`ticket:modal:${categoryId}`)
            .setTitle(`Ticket — ${category.label}`);

        const descInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Décrivez votre problème')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(20)
            .setMaxLength(1000)
            .setRequired(true)
            .setPlaceholder('Soyez le plus précis possible...');

        modal.addComponents(new ActionRowBuilder().addComponents(descInput));
        return interaction.showModal(modal);
    }

    // ticket:close:TICKETID
    if (action === 'close') {
        const ticket = await db.getTicketById(payload);
        if (!ticket) return interaction.reply({ content: 'Ticket introuvable.', flags: MessageFlags.Ephemeral });
        const config  = await manager.getGuildConfig(interaction.guild.id);
        const isStaff = manager.isStaff(interaction.member, config);
        if (interaction.user.id !== ticket.author_id && !isStaff) {
            return interaction.reply({ content: 'Vous ne pouvez pas fermer ce ticket.', flags: MessageFlags.Ephemeral });
        }
        return manager.confirmClose(interaction, payload);
    }

    // ticket:close_confirm:TICKETID
    if (action === 'close_confirm') {
        return manager.doClose(interaction, payload, client);
    }

    // ticket:close_cancel:TICKETID
    if (action === 'close_cancel') {
        return interaction.reply({ content: 'Fermeture annulée.', flags: MessageFlags.Ephemeral });
    }

    // ticket:claim:TICKETID
    if (action === 'claim') {
        return manager.claimTicket(interaction, payload);
    }
}

// ── modals ────────────────────────────────────────────────────────────────────

async function handleModal(interaction, client) {
    // ticket:modal:CATID
    const categoryId  = interaction.customId.split(':')[2];
    const description = interaction.fields.getTextInputValue('description');
    return manager.openTicket(interaction, categoryId, description);
}

module.exports = { isTicketInteraction, handle, attach };
