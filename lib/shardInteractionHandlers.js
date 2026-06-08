// Handler partagé pour les slash commands, boutons et modals.
//
// Extrait du handler interactionCreate historique de Shard/bot.js pour
// pouvoir l'attacher à la fois au bot officiel ET aux bots personnalisés
// Premium (lib/customBotManager.js). Une seule source de vérité pour la
// logique des commandes — pas de dérive entre les bots.
//
// attach({ client, db, captchaStore, tempChannels, helpers })
//   - client : Discord.js Client instance
//   - db : pool mysql2/promise
//   - captchaStore : Map<userId, {code, currentInput, attempts, createdAt}>
//   - tempChannels : Map<channelId, {ownerId, locked, limit, messageId}>
//   - helpers : { getSettings, getGuildSettings, addLog, updateStatsChannels }
//
// Si helpers n'est pas fourni, createDbHelpers(db) est utilisé pour les
// bind à db. updateStatsChannels par défaut est un no-op (les bots custom
// n'ont pas de stats-channel à synchroniser).

const {
    EmbedBuilder,
    ButtonBuilder, ActionRowBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, PermissionFlagsBits, AttachmentBuilder,
    ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    MediaGalleryBuilder, MediaGalleryItemBuilder,
} = require('discord.js');
const { createCanvas } = require('canvas');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function hexToInt(hex) {
    return parseInt(String(hex || '#3b82f6').replace('#', ''), 16) || 0x3b82f6;
}

function safeJsonParse(value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Parse an emoji string from settings into the value expected by
 * ButtonBuilder.setEmoji(). discord.js accepts a unicode glyph, a custom
 * emoji mention ("<:name:id>") or an object — we forward strings as-is and
 * fall back to undefined when empty.
 */
function parseButtonEmoji(raw) {
    const s = String(raw || '').trim();
    if (!s) return undefined;
    return s;
}

const STYLE_TO_BUILDER = {
    1: ButtonStyle.Primary,
    2: ButtonStyle.Secondary,
    3: ButtonStyle.Success,
    4: ButtonStyle.Danger,
};
function resolveButtonStyle(v, fallback) {
    const n = Number(v);
    return STYLE_TO_BUILDER[n] || fallback;
}


const translations = {
    fr: {
        welcome_title: "Bienvenue sur {guild} !",
        welcome_desc: "Afin d'obtenir un accès complet au serveur, vous devez compléter le processus de vérification suivant.\n\n<:dot:1492857051444019240> Cliquez sur `Vérifier` pour commencer\n<:dot:1492857051444019240> Cliquez sur `FAQ` pour en savoir plus",
        btn_verify: "Vérifier",
        btn_faq: "FAQ",
        faq_title: "<:chat:1492857699556266004> Foire Aux Questions",
        faq_desc: "<:dot:1492857051444019240> **Pourquoi un système de vérification ?**\n\nShard protège les serveurs des messages non sollicités.\n\n<:dot:1492857051444019240> **Pourquoi ne pas simplement me donner le rôle ?**\n\nL'attribution manuelle compromettrait la sécurité.\n\n<:dot:1492857051444019240> **Ce bot est-il sûr ?**\n\nNous ne vous demanderons jamais de scanner de QR code.\n\n<:dot:1492857051444019240> **Comment ajouter ce bot ?**\n\nGratuitement via notre site !",
        step1_title: "1・Désactivez vos messages privés",
        step1_desc: "Pour continuer, vous devez désactiver vos MP.\n\n**Comment faire :**\n\n<:dot:1492857051444019240> Clic droit sur l'icône du serveur\n\n<:dot:1492857051444019240> Paramètres de confidentialité\n\n<:dot:1492857051444019240> Désactivez les **Messages privés**\n\n<:dot:1492857051444019240> Cliquez sur **Terminé**",
        btn_continue: "Continuer",
        btn_more_info: "Plus d'infos",
        more_info_title: "<:chat:1492857699556266004> Plus d'infos",
        more_info_desc: "Désactivez les MP globalement dans vos paramètres Discord sous \"Confidentialité et sécurité\".",
        btn_back: "Retour",
        step2_title: "2・Lisez le règlement",
        step2_desc: "<:dot:1492857051444019240> Respectez les [Conditions d'Utilisation](https://discord.com/terms) et les [Directives Communautaires](https://discord.com/guidelines) de Discord.\n<:dot:1492857051444019240> Traitez tout le monde avec respect. Le harcèlement, la chasse aux sorcières, le sexisme, le racisme et les discours haineux sont strictement interdits.\n<:dot:1492857051444019240> Aucun spam ou auto-promotion (invitations de serveur, publicités, etc.) sans autorisation. Cela inclut les messages privés aux membres.\n<:dot:1492857051444019240> Aucun contenu réservé aux adultes ou obscène. Cela inclut textes, images ou liens présentant de la nudité, du sexe, de la violence ou tout autre contenu graphique perturbant.\n<:dot:1492857051444019240> L'ignorance des règles n'est pas une excuse pour les enfreindre. Vous devez accepter ces règles pour obtenir un accès complet au serveur.\n<:dot:1492857051444019240> Cliquez sur **Continuer** si vous acceptez les règles du serveur.",
        step3_title: "3 - Êtes-vous humain ?",
        step3_desc: "Saisissez les {digits} chiffres de l'image ci-dessous.",
        input_empty: "‎",
        btn_validate: "Valider",
        success_msg: "✅・Vous avez été vérifié !",
        success_desc: "[🔗・Ajouter Shard](https://discord.com/)\n[🔗・Documentation](https://shardtown.com/)\n[🔗・Voter](https://top.gg/)",
        premium_title: "Offrez plus à votre communauté avec le Premium",
        premium_desc: "Plus de sécurité et de personnalisation.\n\n➡️ **[S'abonner](https://shardtown.com/premium)**",
        footer: "Fait avec ❤️ par Joe et son équipe.",
        retry_msg: "Veuillez réessayer. Il vous reste {attempts} tentative(s) avant d'être banni.",
        btn_retry: "Réessayer",
        failed_msg: "❌ Trop d'échecs. Vous avez été expulsé pour votre sécurité.",
        session_expired: "Session expirée.",
        wrong_code: "❌ Code incorrect.",
        locked_msg: "🔒 Ce serveur est actuellement verrouillé.",
        locked_desc: "Pour accéder au serveur, vous devez saisir le code d'accès fourni par les administrateurs.",
        btn_enter_code: "Saisir le code",
        modal_code_title: "Code d'accès",
        modal_code_label: "Entrez le code ici",
        wrong_access_code: "❌ Code d'accès invalide."
    },
    en: {
        welcome_title: "Welcome to {guild}!",
        welcome_desc: "In order to get full access to the server, you must complete the following verification process.\n\n<:dot:1492857051444019240> Click on `Verify` to get started\n<:dot:1492857051444019240> Click on `FAQ` to learn more",
        btn_verify: "Verify",
        btn_faq: "FAQ",
        faq_title: "<:chat:1492857699556266004> Frequently Asked Questions",
        faq_desc: "<:dot:1492857051444019240> **Why have a verification system?**\n\nShard protects communities from unsolicited messages.\n\n<:dot:1492857051444019240> **Can't you just give me the role?**\n\nManual role assignment defeats the purpose of this system.\n\n<:dot:1492857051444019240> **Is this bot safe?**\n\nShard will never DM you or ask for personal info.\n\n<:dot:1492857051444019240> **How can I add this bot?**\n\nYou can add Shard for free here!",
        step1_title: "1・Turn off DMs",
        step1_desc: "To continue, you must turn off your DMs.\n\n**How to do it:**\n\n<:dot:1492857051444019240> Right click on server icon\n\n<:dot:1492857051444019240> Click on Privacy Settings\n\n<:dot:1492857051444019240> Turn off direct messages\n\n<:dot:1492857051444019240> Click on Done",
        btn_continue: "Continue",
        btn_more_info: "More Info",
        more_info_title: "<:chat:1492857699556266004> More Info",
        more_info_desc: "Consider closing DMs globally in User Settings -> Privacy & Safety.",
        btn_back: "Back",
        step2_title: "2・Read the rules",
        step2_desc: "<:dot:1492857051444019240> Follow Discord's [Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines).\n<:dot:1492857051444019240> Treat everyone with respect. Absolutely no harassment, witch hunting, sexism, racism or hate speech will be tolerated.\n<:dot:1492857051444019240> No spam or self-promotion (server invites, advertisements, etc.) without permission. This includes DMing fellow members.\n<:dot:1492857051444019240> No age-restricted or obscene content. This includes text, images or links featuring nudity, sex, hard violence or other disturbing graphic content.\n<:dot:1492857051444019240> Not knowing the rules is not an excuse to break them. You must agree to these rules in order to get full access to the server.\n<:dot:1492857051444019240> Click on **Continue** if you agree to the server rules.",
        step3_title: "3 - Are you human?",
        step3_desc: "Enter the {digits} digits from the image below.",
        input_empty: "‎",
        btn_validate: "Validate",
        success_msg: "✅・You have been verified!",
        success_desc: "[🔗・Add Shard](https://discord.com/)\n[🔗・Documentation](https://shardtown.com/)\n[🔗・Vote](https://top.gg/)",
        premium_title: "Give your community more with Premium",
        premium_desc: "More security features, more customization.\n\n➡️ **[Subscribe](https://shardtown.com/premium)**",
        footer: "Made with ❤️ by Joe and his team.",
        retry_msg: "Please try again. You have {attempts} attempt(s) left.",
        btn_retry: "Retry",
        failed_msg: "❌ Too many failures. You have been kicked for security reasons.",
        session_expired: "Session expired.",
        wrong_code: "❌ Wrong code.",
        locked_msg: "🔒 This server is currently locked.",
        locked_desc: "To access the server, you must enter the access code provided by administrators.",
        btn_enter_code: "Enter Code",
        modal_code_title: "Access Code",
        modal_code_label: "Enter code here",
        wrong_access_code: "❌ Invalid access code."
    }
};

// ---- Captcha generator ----------------------------------------------------
const generateCaptcha = (digits = 6, noise = 'medium') => {
    const width = 450, height = 150;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    // Cryptographic RNG so the captcha code can't be predicted from prior
    // outputs (Node's xorshift128+ state can be recovered from a few samples).
    const code = crypto.randomInt(min, max + 1).toString();

    let noiseCount = 15;
    if (noise === 'low') noiseCount = 8;
    if (noise === 'high') noiseCount = 40;

    ctx.font = '24px Sans';
    ctx.fillStyle = 'rgba(128, 128, 128, 0.25)';
    for (let i = 0; i < noiseCount; i++) {
        ctx.save();
        ctx.translate(Math.random() * width, Math.random() * height);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillText(Math.floor(Math.random() * 10).toString(), 0, 0);
        ctx.restore();
    }

    if (noise === 'high') {
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = `rgba(128, 128, 128, ${Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const sY = height / 2 + (Math.random() * 20 - 10);
    const eY = height / 2 + (Math.random() * 20 - 10);

    ctx.font = 'bold 70px Sans';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#10b981';

    for (let i = 0; i < code.length; i++) {
        const x = (width / (code.length + 1)) * (i + 1);
        const y = sY + (eY - sY) * (x / width);
        ctx.save();
        ctx.translate(x, y + (Math.random() * 10 - 5));
        ctx.rotate((Math.random() * 0.6) - 0.3);
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
    }

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = noise === 'high' ? 8 : (noise === 'medium' ? 5 : 3);
    ctx.beginPath();
    ctx.moveTo(0, sY);
    ctx.lineTo(width, eY);
    ctx.stroke();

    if (noise === 'high' || noise === 'medium') {
        const extraLines = noise === 'high' ? 10 : 4;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.lineWidth = 2;
        for (let i = 0; i < extraLines; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * width, Math.random() * height);
            ctx.lineTo(Math.random() * width, Math.random() * height);
            ctx.stroke();
        }
    }

    return { image: canvas.toBuffer(), code };
};

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
        new ButtonBuilder().setCustomId('tv_lock').setLabel(data.locked ? 'Ouvrir' : 'Fermer').setStyle(data.locked ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tv_limit').setLabel('Limiter').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tv_rename').setLabel('Renommer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tv_delete').setLabel('Supprimer').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}


// Factory pour les helpers qui ont besoin d'un pool db.
function createDbHelpers(db) {
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
        } catch (err) { /* logs table optional */ }
    }
    return { getSettings, getGuildSettings, addLog };
}

const ticketHandlers = require('./ticketHandlers');

function attach({ client, db, captchaStore, tempChannels, helpers }) {
    const h = helpers || createDbHelpers(db);
    const { getSettings, getGuildSettings, addLog } = h;
    const updateStatsChannels = h.updateStatsChannels || (() => {});

    // ─── Handler interactionCreate ───────────────────────────────────────
    // Recopie du handler historique de Shard/bot.js — toutes les références
    // aux helpers (getSettings, addLog, …) passent maintenant par le scope
    // local (closures sur les paramètres de attach()).
    // Start AFK timeout checker
    ticketHandlers.attach(client);

    client.on('interactionCreate', async (interaction) => {
    // ----- Ticket system ---------------------------------------------------
    if (ticketHandlers.isTicketInteraction(interaction)) {
        return ticketHandlers.handle(interaction, client);
    }

    // ----- Slash commands --------------------------------------------------
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;

        // ----- Community commands -----------------------------------------
        if (cmd === 'embed') {
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

        if (cmd === 'daily') {
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

        if (cmd === 'balance') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const settings = await getSettings(interaction.guildId);
            if (!settings?.economyEnabled) return interaction.editReply({ content: 'Le système d\'économie est désactivé.' });
            const target = interaction.options.getUser('membre') || interaction.user;
            const currency = settings.economyCurrencyName || 'coins';
            const [rows] = await db.execute(`SELECT balance FROM shard_economy WHERE guildId = ? AND userId = ?`, [interaction.guildId, target.id]);
            const balance = rows[0]?.balance || 0;
            return interaction.editReply({ content: `💳 **${target.username}** possède **${balance} ${currency}**.` });
        }

        if (cmd === 'shop') {
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

        if (cmd === 'buy') {
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

        if (cmd === 'pay') {
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

        if (cmd === 'remind') {
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

        if (cmd === 'birthday') {
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
            return;
        }

        // ----- Guard commands ---------------------------------------------
        const guardSettings = await getGuildSettings(interaction.guildId);

        const checkModAuth = (perm) => {
            let ok = interaction.member.permissions.has(perm);
            if (!ok && guardSettings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(guardSettings.modRoles);
                    ok = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            return ok;
        };

        const denyContainer = () => new ContainerBuilder()
            .setAccentColor(0xef4444)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));

        if (cmd === 'setup-verification') {
            const bannerPath = path.join(__dirname, '../image/banner.png');
            const bannerAttachment = new AttachmentBuilder(bannerPath, { name: 'banner.png' });
            const t = translations[guardSettings.language] || translations.fr;

            const container = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.welcome_title.replace('{guild}', interaction.guild.name)}`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.welcome_desc))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('verify_btn').setLabel(t.btn_verify).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('faq_btn').setLabel(t.btn_faq).setStyle(ButtonStyle.Secondary)
                ));

            await interaction.reply({ components: [container], files: [bannerAttachment], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'warn') {
            if (!checkModAuth('ModerateMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nMembre introuvable.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            if (member.user.bot) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous ne pouvez pas avertir un bot.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            await db.execute(
                'INSERT INTO warnings (guildId, userId, username, moderatorId, moderatorName, reason) VALUES (?, ?, ?, ?, ?, ?)',
                [interaction.guildId, targetUser.id, targetUser.username, interaction.user.id, interaction.user.username, reason]
            );
            const [[{ count }]] = await db.execute(
                'SELECT COUNT(*) as count FROM warnings WHERE guildId = ? AND userId = ?',
                [interaction.guildId, targetUser.id]
            );
            await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Warn', `Raison: ${reason} | Par: ${interaction.user.username}`);

            const thresholdMute = parseInt(guardSettings.warnThresholdMute) || 0;
            const thresholdKick = parseInt(guardSettings.warnThresholdKick) || 0;
            const thresholdBan = parseInt(guardSettings.warnThresholdBan) || 0;
            const muteDurationMin = parseInt(guardSettings.warnMuteDuration) || 60;
            let actionTaken = '';

            if (thresholdBan > 0 && count >= thresholdBan && member.bannable) {
                await member.ban({ reason: `${count} avertissements – ${reason}` });
                await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Auto-Ban', `${count} avertissements`);
                actionTaken = `Banni après ${count} avertissement(s)`;
            } else if (thresholdKick > 0 && count >= thresholdKick && member.kickable) {
                await member.kick(`${count} avertissements – ${reason}`);
                await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Auto-Kick', `${count} avertissements`);
                actionTaken = `Expulsé après ${count} avertissement(s)`;
            } else if (thresholdMute > 0 && count >= thresholdMute && member.moderatable) {
                await member.timeout(muteDurationMin * 60 * 1000, `${count} avertissements – ${reason}`);
                await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Auto-Mute', `${count} avertissements`);
                actionTaken = `Mute ${muteDurationMin} min après ${count} avertissement(s)`;
            }

            const content = actionTaken
                ? `# Avertissement\n**${targetUser.username}** a reçu un avertissement. (${count} total)\n${actionTaken}`
                : `# Avertissement\n**${targetUser.username}** a reçu un avertissement. (**${count}** total)\n**Raison** : ${reason}`;

            const c = new ContainerBuilder()
                .setAccentColor(0xf97316)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(targetUser.displayAvatarURL({ size: 128 }))
                ));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'kick') {
            if (!checkModAuth('KickMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.kickable) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nImpossible d\'expulser ce membre.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            await member.kick(reason);
            await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Kick', `Raison: ${reason} | Par: ${interaction.user.username}`);
            const c = new ContainerBuilder()
                .setAccentColor(0xef4444)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Expulsion\n**${targetUser.username}** a été expulsé.\n**Raison** : ${reason}`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(targetUser.displayAvatarURL({ size: 128 }))
                ));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'ban') {
            if (!checkModAuth('BanMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.bannable) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nImpossible de bannir ce membre.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            await member.ban({ reason });
            await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Ban', `Raison: ${reason} | Par: ${interaction.user.username}`);
            const c = new ContainerBuilder()
                .setAccentColor(0xf87171)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Bannissement\n**${targetUser.username}** a été banni.\n**Raison** : ${reason}`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(targetUser.displayAvatarURL({ size: 128 }))
                ));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'untempban') {
            if (!checkModAuth('BanMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const userId = interaction.options.getString('id');
            try {
                await interaction.guild.members.unban(userId);
                await addLog(interaction.guildId, userId, 'N/A', 'Unban', `Par: ${interaction.user.username}`);
                const c = new ContainerBuilder()
                    .setAccentColor(0x22c55e)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Débannissement\nL'utilisateur avec l'ID **${userId}** a été débanni.`));
                await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nImpossible de débannir cet utilisateur. Vérifiez l\'ID.'));
                await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return;
        }

        if (cmd === 'mute') {
            if (!checkModAuth('ModerateMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const targetUser = interaction.options.getUser('user');
            const duration = interaction.options.getInteger('duration') || 60;
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.moderatable) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nImpossible de rendre muet ce membre.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            await member.timeout(duration * 60 * 1000, reason);
            await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Mute', `Durée: ${duration}m | Raison: ${reason} | Par: ${interaction.user.username}`);
            const c = new ContainerBuilder()
                .setAccentColor(0xeab308)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Mute\n**${targetUser.username}** a été rendu muet.\n**Durée** : ${duration} minutes\n**Raison** : ${reason}`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(targetUser.displayAvatarURL({ size: 128 }))
                ));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'unmute') {
            if (!checkModAuth('ModerateMembers')) {
                return interaction.reply({ components: [denyContainer()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const targetUser = interaction.options.getUser('user');
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.moderatable) {
                const c = new ContainerBuilder().setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nImpossible de rendre la parole à ce membre.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            await member.timeout(null);
            await addLog(interaction.guildId, targetUser.id, targetUser.username, 'Unmute', `Par: ${interaction.user.username}`);
            const c = new ContainerBuilder()
                .setAccentColor(0x22c55e)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Unmute\nLa parole a été rendue à **${targetUser.username}**.`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(targetUser.displayAvatarURL({ size: 128 }))
                ));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (cmd === 'dashboard') {
            const logoPath = path.join(__dirname, '../image/shard.png');
            const logoAttachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Dashboard\nAccédez au dashboard de Shard pour configurer votre serveur.`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://logo.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Dashboard').setURL('https://shardtown.com/dashboard').setStyle(ButtonStyle.Link)
                ));
            await interaction.reply({ components: [c], files: [logoAttachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return;
        }

        if (cmd === 'invite') {
            const logoPath = path.join(__dirname, '../image/shard.png');
            const logoAttachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Inviter Shard\nAjoutez Shard à votre serveur — communauté + sécurité dans un seul bot.`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://logo.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Inviter le bot').setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`).setStyle(ButtonStyle.Link)
                ));
            await interaction.reply({ components: [c], files: [logoAttachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return;
        }

        // /promo a été déplacée sur le bot Shardtown (Shardtown/bot.js).
    }

    // ----- Buttons --------------------------------------------------------
    if (interaction.isButton()) {
        const id = interaction.customId;

        // ---- Giveaway entry ----
        if (id === 'giveaway_enter') {
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

        // ---- Ticket open / close ----
        if (id === 'ticket_open') {
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
                    name: channelName, type: 0,
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

            const ticketNumberStr = String(ticketNumber).padStart(4, '0');
            const subst = (tpl) => String(tpl || '')
                .replace(/{user}/g, `<@${member.id}>`)
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, guild.name)
                .replace(/{ticketNumber}/g, ticketNumberStr);

            const welcomeTitle = subst(settings.ticketOpenTitle || `🎫 Ticket #${ticketNumberStr}`);
            const welcomeDesc = subst(settings.ticketOpenDescription || `Bonjour {user}, un membre du support va vous répondre prochainement.\n\nDécrivez votre problème ci-dessous.`);
            const welcomeFooter = subst(settings.ticketOpenFooter || `Ouvert par {username}`);
            const welcomeColor = hexToInt(settings.ticketOpenColor || settings.ticketPanelColor || '#3b82f6');
            const closeLabel = String(settings.ticketCloseButtonLabel || 'Fermer le ticket').slice(0, 80);

            const ticketEmbed = new EmbedBuilder()
                .setColor(welcomeColor)
                .setTitle(welcomeTitle)
                .setDescription(welcomeDesc)
                .setFooter({ text: welcomeFooter })
                .setTimestamp();

            const closeBtn = new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel(closeLabel)
                .setStyle(resolveButtonStyle(settings.ticketCloseButtonStyle, ButtonStyle.Danger));
            const closeEmoji = parseButtonEmoji(settings.ticketCloseButtonEmoji ?? '🔒');
            if (closeEmoji) closeBtn.setEmoji(closeEmoji);

            const row = new ActionRowBuilder().addComponents(closeBtn);
            await ticketChannel.send({ content: `${member} ${settings.ticketSupportRoleId ? `<@&${settings.ticketSupportRoleId}>` : ''}`, embeds: [ticketEmbed], components: [row] });

            if (settings.ticketLogChannelId) {
                const logChannel = guild.channels.cache.get(settings.ticketLogChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(hexToInt(settings.ticketLogOpenColor || '#3b82f6'))
                        .setTitle(subst(settings.ticketLogOpenTitle || '🎫 Ticket ouvert'))
                        .addFields(
                            { name: 'Membre', value: `${member} (${member.user.username})`, inline: true },
                            { name: 'Salon', value: `${ticketChannel}`, inline: true },
                            { name: 'Ticket', value: `#${ticketNumberStr}`, inline: true }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            return interaction.editReply({ content: `Votre ticket a été créé : ${ticketChannel}` });
        }

        if (id === 'ticket_close') {
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

            const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://shardtwn.fr';
            const closedBy = interaction.member;
            const opener = await guild.members.fetch(ticket.userId).catch(() => null);
            let transcriptUrl = null;

            if (settings?.ticketTranscriptEnabled !== 0 && settings?.ticketTranscriptEnabled !== '0') {
                try {
                    const collected = [];
                    let beforeId = null;
                    while (collected.length < 5000) {
                        const opts = { limit: 100 };
                        if (beforeId) opts.before = beforeId;
                        const batch = await interaction.channel.messages.fetch(opts);
                        if (!batch.size) break;
                        for (const m of batch.values()) collected.push(m);
                        beforeId = batch.last().id;
                        if (batch.size < 100) break;
                    }
                    collected.sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));

                    const users = {};
                    const roles = {};
                    const channelsMap = {};
                    const byId = new Map(collected.map(m => [m.id, m]));

                    for (const m of collected) {
                        if (!users[m.author.id]) {
                            users[m.author.id] = {
                                username: m.member?.displayName || m.author.globalName || m.author.username,
                                avatar: m.author.displayAvatarURL({ size: 64, extension: 'png' }),
                                bot: !!m.author.bot,
                            };
                        }
                        for (const [uid, u] of m.mentions.users) {
                            if (!users[uid]) {
                                users[uid] = {
                                    username: u.globalName || u.username,
                                    avatar: u.displayAvatarURL({ size: 64, extension: 'png' }),
                                    bot: !!u.bot,
                                };
                            }
                        }
                        for (const [rid, r] of m.mentions.roles) {
                            if (!roles[rid]) roles[rid] = { name: r.name, color: r.color };
                        }
                        for (const [cid, c] of m.mentions.channels) {
                            if (!channelsMap[cid]) channelsMap[cid] = { name: c.name, type: c.type };
                        }
                    }

                    const messages = collected.map(m => {
                        const reply = m.reference && byId.get(m.reference.messageId);
                        return {
                            id: m.id,
                            timestamp: m.createdAt.toISOString(),
                            editedAt: m.editedAt ? m.editedAt.toISOString() : null,
                            authorId: m.author.id,
                            authorName: m.member?.displayName || m.author.globalName || m.author.username,
                            authorAvatar: m.author.displayAvatarURL({ size: 64, extension: 'png' }),
                            bot: !!m.author.bot,
                            content: m.content || '',
                            isVoiceMessage: !!(m.flags?.bitfield & 8192),
                            attachments: Array.from(m.attachments.values()).map(a => ({
                                url: a.url, name: a.name,
                                contentType: a.contentType || '', size: a.size || 0,
                                width: a.width || null, height: a.height || null,
                                duration: a.duration || null, waveform: a.waveform || null,
                            })),
                            stickers: Array.from(m.stickers.values()).map(s => ({ id: s.id, name: s.name, format: s.format })),
                            embeds: m.embeds.map(e => ({
                                type: e.data?.type || e.type || '',
                                title: e.title || '', description: e.description || '',
                                url: e.url || '', color: e.color || 0,
                                footer: e.footer?.text || '', footerIcon: e.footer?.iconURL || '',
                                authorName: e.author?.name || '', authorIcon: e.author?.iconURL || '', authorUrl: e.author?.url || '',
                                image: e.image?.url || '', thumbnail: e.thumbnail?.url || '',
                                video: e.video?.url || '', videoWidth: e.video?.width || null, videoHeight: e.video?.height || null,
                                providerName: e.provider?.name || '',
                                fields: (e.fields || []).map(f => ({ name: f.name || '', value: f.value || '', inline: !!f.inline })),
                            })),
                            reply: reply ? {
                                authorId: reply.author.id,
                                authorName: reply.member?.displayName || reply.author.globalName || reply.author.username,
                                content: (reply.content || '').slice(0, 180),
                            } : null,
                        };
                    });

                    const transcriptId = crypto.randomBytes(16).toString('hex');
                    const payload = { messages, users, roles, channels: channelsMap };
                    await db.execute(
                        `INSERT INTO shard_ticket_transcripts (id, guildId, guildName, channelName, openedById, openedByName, closedById, closedByName, openedAt, closedAt, messages)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            transcriptId, guild.id, guild.name, interaction.channel.name,
                            ticket.userId, opener ? opener.user.username : ticket.userId,
                            closedBy.id, closedBy.user.username,
                            ticket.createdAt || new Date(), new Date(),
                            JSON.stringify(payload),
                        ]
                    );
                    transcriptUrl = `${PUBLIC_BASE_URL}/transcripts/${transcriptId}`;
                } catch (err) {
                    console.warn('[ticket-close] Erreur génération transcript:', err.message);
                }
            }

            if (settings?.ticketLogChannelId) {
                const logChannel = guild.channels.cache.get(settings.ticketLogChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(hexToInt(settings.ticketLogCloseColor || '#ef4444'))
                        .setTitle(settings.ticketLogCloseTitle || '🔒 Ticket fermé')
                        .addFields(
                            { name: 'Ouvert par', value: opener ? `${opener} (${opener.user.username})` : ticket.userId, inline: true },
                            { name: 'Fermé par', value: `${closedBy} (${closedBy.user.username})`, inline: true }
                        )
                        .setTimestamp();
                    if (transcriptUrl) {
                        logEmbed.addFields({ name: 'Transcript', value: `[Voir la conversation](${transcriptUrl})`, inline: false });
                    }
                    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            if (transcriptUrl && opener) {
                opener.user.send({ content: `Votre ticket dans **${guild.name}** vient d'être fermé. Vous pouvez consulter la conversation ici : ${transcriptUrl}` }).catch(() => {});
            }

            await interaction.editReply({ content: 'Ticket fermé. Le salon sera supprimé dans 5 secondes.' });
            setTimeout(async () => {
                try { await interaction.channel.delete('Ticket fermé'); } catch {}
            }, 5000);
            return;
        }

        // ---- Temp-voice control ----
        if (['tv_lock', 'tv_limit', 'tv_rename', 'tv_delete'].includes(id)) {
            const channelId = interaction.channelId;
            const data = tempChannels.get(channelId);
            const eph = { flags: MessageFlags.Ephemeral };
            if (!data) return interaction.reply({ content: 'Ce salon n\'est plus actif.', ...eph });
            if (interaction.user.id !== data.ownerId) {
                return interaction.reply({ content: 'Seul le créateur du salon peut le gérer.', ...eph });
            }

            if (id === 'tv_lock') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                data.locked = !data.locked;
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    Connect: data.locked ? false : null
                });
                try {
                    const msg = await interaction.channel.messages.fetch(data.messageId);
                    await msg.edit(buildControlPanel(data));
                } catch {}
                return interaction.editReply({ content: data.locked ? 'Salon fermé.' : 'Salon ouvert.' });
            }

            if (id === 'tv_limit') {
                const modal = new ModalBuilder().setCustomId('tv_limit_modal').setTitle('Limiter le salon');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('tv_limit_input')
                        .setLabel('Nombre max de membres (0 = illimité)')
                        .setStyle(TextInputStyle.Short).setPlaceholder('Ex : 5')
                        .setRequired(true).setMinLength(1).setMaxLength(2)
                ));
                return interaction.showModal(modal);
            }

            if (id === 'tv_rename') {
                const modal = new ModalBuilder().setCustomId('tv_rename_modal').setTitle('Renommer le salon');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('tv_rename_input')
                        .setLabel('Nouveau nom du salon')
                        .setStyle(TextInputStyle.Short).setPlaceholder('Ex : Salon Gaming')
                        .setValue(interaction.channel.name)
                        .setRequired(true).setMinLength(1).setMaxLength(100)
                ));
                return interaction.showModal(modal);
            }

            if (id === 'tv_delete') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                tempChannels.delete(channelId);
                try { await interaction.channel.delete('Supprimé par le propriétaire'); } catch {}
                try { await interaction.editReply({ content: 'Salon supprimé.' }); } catch {}
                return;
            }
        }

        // ---- Verification flow (FAQ / Verify / steps / captcha) ----
        const guardSettings = await getGuildSettings(interaction.guildId);
        const t = translations[guardSettings.language] || translations.fr;

        if (id === 'faq_btn' || id === 'faq') {
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.faq_title}\n${t.faq_desc}`));
            return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (id === 'verify_btn' || id === 'verify' || id === 'back_btn') {
            if (guardSettings.serverLocked === 'true') {
                const c = new ContainerBuilder()
                    .setAccentColor(0x2b2d31)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.locked_msg}\n${t.locked_desc}`))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('enter_code_btn').setLabel(t.btn_enter_code).setStyle(ButtonStyle.Primary)
                    ));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const mprivatePath = path.join(__dirname, '../image/mprivate.png');
            const mprivateAttachment = fs.existsSync(mprivatePath)
                ? new AttachmentBuilder(mprivatePath, { name: 'mprivate.png' })
                : null;

            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.step1_title}\n${t.step1_desc}`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            if (mprivateAttachment) {
                c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://mprivate.png')
                ));
            }
            c.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('continue_btn').setLabel(t.btn_continue).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('more_info_btn').setLabel(t.btn_more_info).setStyle(ButtonStyle.Secondary)
            ));
            const opt = {
                components: [c],
                files: mprivateAttachment ? [mprivateAttachment] : [],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            };
            if (id === 'back_btn') return interaction.update(opt);
            return interaction.reply(opt);
        }

        if (id === 'enter_code_btn' || id === 'enter_access_code') {
            const modal = new ModalBuilder().setCustomId('access_code_modal').setTitle(t.modal_code_title);
            const input = new TextInputBuilder().setCustomId('code_input').setLabel(t.modal_code_label).setPlaceholder('SHARDTOWN').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (id === 'more_info_btn') {
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.more_info_title}\n${t.more_info_desc}`))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('back_btn').setLabel(t.btn_back).setStyle(ButtonStyle.Secondary)
                ));
            return interaction.update({ components: [c], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (id === 'continue_btn') {
            const rawRules = guardSettings[`rules_${guardSettings.language || 'fr'}`];
            let formattedRules = t.step2_desc;
            if (rawRules) {
                try {
                    const rulesArray = JSON.parse(rawRules);
                    if (Array.isArray(rulesArray) && rulesArray.length > 0) {
                        formattedRules = rulesArray.map(r => `<:dot:1492857051444019240> ${r}`).join('\n\n');
                    } else if (typeof rawRules === 'string' && rawRules.trim()) {
                        formattedRules = rawRules;
                    }
                } catch (e) { formattedRules = rawRules; }
            }
            const rulesBannerPath = path.join(__dirname, '../image/banner.png');
            const rulesBannerAttachment = fs.existsSync(rulesBannerPath)
                ? new AttachmentBuilder(rulesBannerPath, { name: 'banner.png' })
                : null;

            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.step2_title}\n${formattedRules}`));
            if (rulesBannerAttachment) {
                c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                ));
            }
            c.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rules_continue_btn').setLabel(t.btn_continue).setStyle(ButtonStyle.Primary)
            ));
            return interaction.update({ components: [c], files: rulesBannerAttachment ? [rulesBannerAttachment] : [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (id === 'rules_continue_btn' || id === 'retry_captcha_btn') {
            const numDigits = guardSettings.captchaDigits || 6;
            const { image, code } = generateCaptcha(numDigits, guardSettings.captchaNoise || 'medium');
            const existing = captchaStore.get(interaction.user.id);
            const attempts = existing ? existing.attempts : (guardSettings.captchaAttempts || 3);
            captchaStore.set(interaction.user.id, { code, currentInput: '', attempts, createdAt: Date.now() });
            const attachment = new AttachmentBuilder(image, { name: 'captcha.png' });

            const currentDesc = (guardSettings.language === 'en' ? translations.en.step3_desc : translations.fr.step3_desc)
                .replace('{digits}', numDigits);

            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.step3_title}\n${currentDesc}`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://captcha.png')
                ))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.input_empty))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            for (let i = 0; i < 3; i++) {
                const row = new ActionRowBuilder();
                for (let j = 1; j <= 3; j++) {
                    const n = i * 3 + j;
                    row.addComponents(new ButtonBuilder().setCustomId(`num_${n}`).setLabel(n.toString()).setStyle(ButtonStyle.Secondary));
                }
                c.addActionRowComponents(row);
            }
            c.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('num_delete').setLabel('✖').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('num_0').setLabel('0').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('num_submit').setLabel(t.btn_validate).setStyle(ButtonStyle.Success)
            ));
            return interaction.update({ components: [c], files: [attachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (id.startsWith('num_')) {
            const userData = captchaStore.get(interaction.user.id);
            if (!userData) return interaction.reply({ content: t.session_expired, flags: [MessageFlags.Ephemeral] });
            const action = id.replace('num_', '');
            if (action === 'delete') {
                userData.currentInput = userData.currentInput.slice(0, -1);
            } else if (action === 'submit') {
                if (userData.currentInput === userData.code) {
                    captchaStore.delete(interaction.user.id);
                    if (guardSettings.verifiedRole) {
                        try {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            await member.roles.add(guardSettings.verifiedRole);
                            updateStatsChannels(interaction.guild);
                        } catch (e) { console.error('Erreur role:', e); }
                    }
                    await addLog(interaction.guildId, interaction.user.id, interaction.user.username, 'Captcha', 'Réussi');
                    const successC = new ContainerBuilder()
                        .setAccentColor(0x00ff00)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.success_msg}\n${t.success_desc}\n\n-# ${t.footer}`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${t.premium_title}\n${t.premium_desc}`));
                    return interaction.update({ components: [successC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                } else {
                    userData.attempts -= 1;
                    if (userData.attempts <= 0) {
                        await addLog(interaction.guildId, interaction.user.id, interaction.user.username, 'Captcha', 'Échoué (Expulsé)');
                        captchaStore.delete(interaction.user.id);
                        try {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            if (member.kickable) await member.kick('Trop d\'échecs au captcha');
                        } catch (e) { console.error('Erreur kick:', e); }
                        const failC = new ContainerBuilder()
                            .setAccentColor(0xff0000)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.failed_msg));
                        return interaction.update({ components: [failC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                    await addLog(interaction.guildId, interaction.user.id, interaction.user.username, 'Captcha', 'Échoué');
                    const retryC = new ContainerBuilder()
                        .setAccentColor(0xff0000)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.retry_msg.replace('{attempts}', userData.attempts)))
                        .addActionRowComponents(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('retry_captcha_btn').setLabel(t.btn_retry).setStyle(ButtonStyle.Secondary)
                        ));
                    return interaction.update({ components: [retryC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
            } else {
                if (userData.currentInput.length < (guardSettings.captchaDigits || 6)) userData.currentInput += action;
            }

            const numDigitsCur = guardSettings.captchaDigits || 6;
            const currentDescCur = (guardSettings.language === 'en' ? translations.en.step3_desc : translations.fr.step3_desc).replace('{digits}', numDigitsCur);
            const inputDisplay = userData.currentInput.length > 0
                ? `### \` ${userData.currentInput.split('').join(' ')} \``
                : t.input_empty;

            const updC = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.step3_title}\n${currentDescCur}`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://captcha.png')
                ))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(inputDisplay))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            for (let i = 0; i < 3; i++) {
                const row = new ActionRowBuilder();
                for (let j = 1; j <= 3; j++) {
                    const n = i * 3 + j;
                    row.addComponents(new ButtonBuilder().setCustomId(`num_${n}`).setLabel(n.toString()).setStyle(ButtonStyle.Secondary));
                }
                updC.addActionRowComponents(row);
            }
            updC.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('num_delete').setLabel('✖').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('num_0').setLabel('0').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('num_submit').setLabel(t.btn_validate).setStyle(ButtonStyle.Success)
            ));
            return interaction.update({ components: [updC], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }

    // ----- Modal submits --------------------------------------------------
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'tv_limit_modal' || id === 'tv_rename_modal') {
            const channelId = interaction.channelId;
            const data = tempChannels.get(channelId);
            const eph = { flags: MessageFlags.Ephemeral };
            if (!data) return interaction.reply({ content: 'Ce salon n\'est plus actif.', ...eph });

            if (id === 'tv_limit_modal') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const val = parseInt(interaction.fields.getTextInputValue('tv_limit_input')) || 0;
                const clamped = Math.min(Math.max(val, 0), 99);
                data.limit = clamped;
                await interaction.channel.setUserLimit(clamped);
                try {
                    const msg = await interaction.channel.messages.fetch(data.messageId);
                    await msg.edit(buildControlPanel(data));
                } catch {}
                return interaction.editReply({ content: clamped === 0 ? 'Limite retirée.' : `Limite fixée à **${clamped}** membres.` });
            }

            if (id === 'tv_rename_modal') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const newName = interaction.fields.getTextInputValue('tv_rename_input').trim();
                await interaction.channel.setName(newName);
                return interaction.editReply({ content: `Salon renommé en **${newName}**.` });
            }
        }

        if (id === 'access_code_modal') {
            const guardSettings = await getGuildSettings(interaction.guildId);
            const t = translations[guardSettings.language] || translations.fr;
            const code = interaction.fields.getTextInputValue('code_input');
            if (code === guardSettings.accessCode) {
                await addLog(interaction.guildId, interaction.user.id, interaction.user.username, 'Access Code', 'Success');
                if (guardSettings.verifiedRole) {
                    try {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        await member.roles.add(guardSettings.verifiedRole);
                        updateStatsChannels(interaction.guild);
                    } catch (e) { console.error('Erreur role:', e); }
                }
                const sEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle(t.success_msg).setDescription(t.success_desc).setFooter({ text: t.footer });
                const pEmbed = new EmbedBuilder().setColor(0x2b2d31).setTitle(t.premium_title).setDescription(t.premium_desc);
                return interaction.reply({ embeds: [sEmbed, pEmbed], flags: [MessageFlags.Ephemeral] });
            }
            await addLog(interaction.guildId, interaction.user.id, interaction.user.username, 'Access Code', 'Failed');
            return interaction.reply({ content: t.wrong_access_code, flags: [MessageFlags.Ephemeral] });
        }
    }
    });
}

module.exports = {
    translations,
    generateCaptcha,
    buildControlPanel,
    hexToInt,
    safeJsonParse,
    parseButtonEmoji,
    resolveButtonStyle,
    createDbHelpers,
    attach,
};
