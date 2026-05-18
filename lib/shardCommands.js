// Liste partagée des slash commands Shard.
//
// Utilisée à la fois par Shard/bot.js (enregistrement sur l'app officielle
// via REST) et par lib/customBotManager.js (enregistrement sur l'app du bot
// personnalisé Premium). Garder la liste ici évite la dérive entre le bot
// principal et les bots custom — quand on ajoute une commande, elle apparaît
// partout automatiquement.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

function buildCommandList() {
    return [
        // Community (Shard)
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
        new SlashCommandBuilder().setName('daily').setDescription('Réclamez votre récompense quotidienne').toJSON(),
        new SlashCommandBuilder()
            .setName('balance').setDescription('Voir votre solde ou celui d\'un membre')
            .addUserOption(o => o.setName('membre').setDescription('Membre cible'))
            .toJSON(),
        new SlashCommandBuilder().setName('shop').setDescription('Voir les articles disponibles dans le shop').toJSON(),
        new SlashCommandBuilder()
            .setName('buy').setDescription('Acheter un rôle dans le shop')
            .addStringOption(o => o.setName('role_id').setDescription('ID du rôle à acheter').setRequired(true))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('birthday').setDescription('Gérer votre date d\'anniversaire')
            .addSubcommand(s => s.setName('set').setDescription('Définir votre date d\'anniversaire')
                .addIntegerOption(o => o.setName('jour').setDescription('Jour (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(o => o.setName('mois').setDescription('Mois (1-12)').setRequired(true).setMinValue(1).setMaxValue(12)))
            .addSubcommand(s => s.setName('remove').setDescription('Supprimer votre date d\'anniversaire'))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('pay').setDescription('[Premium] Transférer des coins à un autre membre')
            .addUserOption(o => o.setName('membre').setDescription('Membre destinataire').setRequired(true))
            .addIntegerOption(o => o.setName('montant').setDescription('Montant à transférer').setRequired(true).setMinValue(1))
            .toJSON(),
        new SlashCommandBuilder()
            .setName('remind').setDescription('[Premium] Créer un rappel automatique')
            .addStringOption(o => o.setName('message').setDescription('Message du rappel').setRequired(true))
            .addStringOption(o => o.setName('delai').setDescription('Délai (ex: 30m, 2h, 1d)').setRequired(true))
            .toJSON(),

        // Security / moderation (formerly ShardGuard)
        { name: 'setup-verification', description: 'Envoie l\'embed de vérification' },
        {
            name: 'warn', description: 'Avertir un membre',
            options: [
                { name: 'user', description: 'Membre à avertir', type: 6, required: true },
                { name: 'reason', description: 'Raison de l\'avertissement', type: 3, required: false },
            ],
        },
        {
            name: 'kick', description: 'Expulser un membre',
            options: [
                { name: 'user', description: 'Membre à expulser', type: 6, required: true },
                { name: 'reason', description: 'Raison de l\'expulsion', type: 3, required: false },
            ],
        },
        {
            name: 'ban', description: 'Bannir un membre',
            options: [
                { name: 'user', description: 'Membre à bannir', type: 6, required: true },
                { name: 'reason', description: 'Raison du bannissement', type: 3, required: false },
            ],
        },
        {
            name: 'untempban', description: 'Débannir un membre',
            options: [
                { name: 'id', description: 'ID de l\'utilisateur à débannir', type: 3, required: true },
            ],
        },
        {
            name: 'mute', description: 'Rendre muet un membre',
            options: [
                { name: 'user', description: 'Membre à rendre muet', type: 6, required: true },
                { name: 'duration', description: 'Durée en minutes', type: 4, required: false },
                { name: 'reason', description: 'Raison du mute', type: 3, required: false },
            ],
        },
        {
            name: 'unmute', description: 'Rendre la parole à un membre',
            options: [{ name: 'user', description: 'Membre à rendre la parole', type: 6, required: true }],
        },
        { name: 'dashboard', description: 'Lien vers le dashboard' },
        { name: 'invite', description: 'Inviter le bot' },
    ];
}

module.exports = { buildCommandList };
