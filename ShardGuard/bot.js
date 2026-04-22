require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); 
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    REST,
    Routes,
    MessageFlags,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} = require('discord.js');
const { createCanvas } = require('canvas');
const mysql = require('mysql2/promise');

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
] });
const captchaStore = new Map();
const CAPTCHA_TTL_MS = 10 * 60 * 1000;
const raidJoins = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of captchaStore.entries()) {
        if (!v || !v.createdAt || (now - v.createdAt) > CAPTCHA_TTL_MS) captchaStore.delete(k);
    }
}, 60 * 1000).unref();
const settingsCache = new Map();
const statsUpdateCooldowns = new Map();
const spamTracker = new Map();

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
        console.log('✅ Connecté à MySQL');
        try {
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
            `);
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
        } catch (e) {}
    } catch (err) {
        console.error('❌ Erreur MySQL:', err.message);
        process.exit(1);
    }
}

async function getGuildSettings(guildId) {
    try {
        const [rows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildId]);
        const settings = rows[0] || { language: 'fr', verifiedRole: '', serverLocked: 'false', accessCode: '', captchaDigits: 6, captchaNoise: 'medium', captchaAttempts: 3, verificationTimeout: 15, autoKickUnverified: 'false' };
        return settings;
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
        console.error('Erreur addLog:', err);
    }
}

async function updateStatsChannels(guild) {
    // Debounce & Throttling pour éviter les rate limits Discord (2 changements par 10 mins)
    if (statsUpdateCooldowns.has(guild.id)) return;

    statsUpdateCooldowns.set(guild.id, true);
    setTimeout(async () => {
        try {
            const settings = await getGuildSettings(guild.id);
            if (!settings.verifiedRole) {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }

            // Fetch des membres pour avoir le rôle à jour
            let members;
            try {
                members = await guild.members.fetch({ time: 30000 });
            } catch {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }
            const verifiedCount = members.filter(m => m.roles.cache.has(settings.verifiedRole)).size;

            // Chercher la catégorie "général" (insensible à la casse)
            const category = guild.channels.cache.find(c => 
                c.type === 4 && // Category
                (c.name.toLowerCase().includes('général') || c.name.toLowerCase().includes('general'))
            );

            if (!category) {
                statsUpdateCooldowns.delete(guild.id);
                return;
            }

            // Chercher un salon commençant par "VÉRIFIÉS" dans cette catégorie
            const statsChannel = guild.channels.cache.find(c => 
                c.parentId === category.id && 
                (c.name.toUpperCase().startsWith('VÉRIFIÉS') || c.name.toUpperCase().startsWith('VERIFIES'))
            );

            if (statsChannel) {
                const newName = `VÉRIFIÉS: ${verifiedCount}`;
                if (statsChannel.name !== newName) {
                    await statsChannel.setName(newName);
                }
            }
        } catch (err) {
            if (!['GuildMembersTimeout', 'EADDRNOTAVAIL', 'ECONNRESET'].includes(err.code)) {
                console.error(`Erreur updateStatsChannels pour ${guild.id}:`, err.message);
            }
        } finally {
            // On laisse le cooldown pendant 5 minutes pour respecter les rate limits
            setTimeout(() => statsUpdateCooldowns.delete(guild.id), 5 * 60 * 1000);
        }
    }, 10000); // Attente de 10 secondes avant l'exécution pour grouper les changements
}

const translations = {
    fr: {
        welcome_title: "Bienvenue sur {guild} !",
        welcome_desc: "Afin d'obtenir un accès complet au serveur, vous devez compléter le processus de vérification suivant.\n\n<:dot:1492857051444019240> Cliquez sur `Vérifier` pour commencer\n<:dot:1492857051444019240> Cliquez sur `FAQ` pour en savoir plus",
        btn_verify: "Vérifier",
        btn_faq: "FAQ",
        faq_title: "<:chat:1492857699556266004> Foire Aux Questions",
        faq_desc: "<:dot:1492857051444019240> **Pourquoi un système de vérification ?**\n\nShardGuard protège les serveurs des messages non sollicités.\n\n<:dot:1492857051444019240> **Pourquoi ne pas simplement me donner le rôle ?**\n\nL'attribution manuelle compromettrait la sécurité.\n\n<:dot:1492857051444019240> **Ce bot est-il sûr ?**\n\nNous ne vous demanderons jamais de scanner de QR code.\n\n<:dot:1492857051444019240> **Comment ajouter ce bot ?**\n\nGratuitement via notre site !",
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
        success_desc: "[🔗・Ajouter ShardGuard](https://discord.com/)\n[🔗・Documentation](https://shardtown.com/)\n[🔗・Voter](https://top.gg/)",
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
        faq_desc: "<:dot:1492857051444019240> **Why have a verification system?**\n\nShardGuard protects communities from unsolicited messages.\n\n<:dot:1492857051444019240> **Can't you just give me the role?**\n\nManual role assignment defeats the purpose of this system.\n\n<:dot:1492857051444019240> **Is this bot safe?**\n\nShardGuard will never DM you or ask for personal info.\n\n<:dot:1492857051444019240> **How can I add this bot?**\n\nYou can add ShardGuard for free here!",
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
        success_desc: "[🔗・Add ShardGuard](https://discord.com/)\n[🔗・Documentation](https://shardtown.com/)\n[🔗・Vote](https://top.gg/)",
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

const commands = [
    { name: 'setup-verification', description: 'Envoie l\'embed de vérification' },
    {
        name: 'warn',
        description: 'Avertir un membre',
        options: [
            { name: 'user', description: 'Membre à avertir', type: 6, required: true },
            { name: 'reason', description: 'Raison de l\'avertissement', type: 3, required: false }
        ]
    },
    {
        name: 'kick',
        description: 'Expulser un membre',
        options: [
            { name: 'user', description: 'Membre à expulser', type: 6, required: true },
            { name: 'reason', description: 'Raison de l\'expulsion', type: 3, required: false }
        ]
    },
    {
        name: 'ban',
        description: 'Bannir un membre',
        options: [
            { name: 'user', description: 'Membre à bannir', type: 6, required: true },
            { name: 'reason', description: 'Raison du bannissement', type: 3, required: false }
        ]
    },
    {
        name: 'untempban',
        description: 'Débannir un membre',
        options: [
            { name: 'id', description: 'ID de l\'utilisateur à débannir', type: 3, required: true }
        ]
    },
    {
        name: 'mute',
        description: 'Rendre muet un membre',
        options: [
            { name: 'user', description: 'Membre à rendre muet', type: 6, required: true },
            { name: 'duration', description: 'Durée en minutes', type: 4, required: false },
            { name: 'reason', description: 'Raison du mute', type: 3, required: false }
        ]
    },
    {
        name: 'unmute',
        description: 'Rendre la parole à un membre',
        options: [
            { name: 'user', description: 'Membre à rendre la parole', type: 6, required: true }
        ]
    },
    { name: 'dashboard', description: 'Lien vers le dashboard' },
    { name: 'invite', description: 'Inviter le bot' }
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Slash commands OK');
    } catch (e) { console.error(e); }
})();

client.once('ready', async (c) => {
    console.log(`Bot prêt: ${c.user.tag}`);
    await connectDB();

    // Mise à jour périodique du statut du shard
    async function updateShardStatus() {
        try {
            const shardId = client.shard ? client.shard.ids[0] : 0;
            const guildCount = client.guilds.cache.size;
            const ping = client.ws.ping;
            
            await db.execute(
                'INSERT INTO shard_status (bot_label, shard_id, status, ping, guild_count) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), ping = VALUES(ping), guild_count = VALUES(guild_count), last_update = CURRENT_TIMESTAMP',
                ['ShardGuard', shardId, 'Online', ping, guildCount]
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
            await db.execute('DELETE FROM shard_guilds WHERE bot_label = ? AND shard_id = ?', ['ShardGuard', shardId]);
            for (const guild of client.guilds.cache.values()) {
                await db.execute(
                    'INSERT INTO shard_guilds (bot_label, shard_id, guild_id, guild_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE shard_id = VALUES(shard_id), guild_name = VALUES(guild_name)',
                    ['ShardGuard', shardId, guild.id, guild.name]
                );
            }
        } catch (err) {
            console.error('Erreur syncGuilds ShardGuard:', err.message);
        }
    }

    syncGuilds();
    client.on('guildCreate', syncGuilds);
    client.on('guildDelete', syncGuilds);

    // Initialisation des compteurs de statistiques
    for (const guild of client.guilds.cache.values()) {
        await updateStatsChannels(guild);
    }

    // Système d'expulsion des non-vérifiés
    setInterval(async () => {
        const now = Date.now();
        
        for (const guild of client.guilds.cache.values()) {
            await updateStatsChannels(guild);
            const settings = await getGuildSettings(guild.id);
            if (!settings.verifiedRole || settings.autoKickUnverified !== 'true') continue;

            const timeoutMinutes = settings.verificationTimeout || 15;
            const timeoutMs = timeoutMinutes * 60 * 1000;

            try {
                const members = await guild.members.fetch();
                const unverified = members.filter(m => !m.user.bot && !m.roles.cache.has(settings.verifiedRole));

                for (const member of unverified.values()) {
                    if (now - member.joinedTimestamp > timeoutMs) {
                        try {
                            if (member.kickable) {
                                await member.kick(`Temps de vérification dépassé (${timeoutMinutes} minutes)`);
                                await addLog(guild.id, member.id, member.user.username, "Timeout", "Kicked");
                            }
                        } catch (e) { /* Console error suppressed for bulk operations */ }
                    }
                }
            } catch (e) { console.error(`Erreur timeout guild ${guild.id}:`, e.message); }
        }
    }, 5 * 60 * 1000); // Vérification toutes les 5 minutes
});

async function sendModAlert(settings, guild, message) {
    if (!settings.isPremium || !settings.modAlertUserId) return;
    try {
        const modUser = await guild.client.users.fetch(settings.modAlertUserId);
        await modUser.send(`🚨 **[${guild.name}]** ${message}`);
    } catch {}
}

client.on('guildMemberAdd', async member => {
    const settings = await getGuildSettings(member.guild.id);
    await addLog(member.guild.id, member.id, member.user.username, 'Arrivée', 'Join');

    if (settings.isPremium) {
        const [blRows] = await db.execute('SELECT userId FROM global_blacklist WHERE userId = ?', [member.id]).catch(() => [[]]);
        if (blRows.length > 0) {
            try {
                if (member.bannable) {
                    await member.ban({ reason: 'Liste noire globale Shardtown' });
                    await sendModAlert(settings, member.guild, `<@${member.id}> (\`${member.user.username}\`) banni automatiquement — présent dans la liste noire globale.`);
                }
            } catch {}
            return;
        }

        if (settings.antiRaidEnabled) {
            const gid = member.guild.id;
            const threshold = parseInt(settings.antiRaidThreshold) || 10;
            const window = (parseInt(settings.antiRaidWindow) || 10) * 1000;
            const now = Date.now();
            if (!raidJoins.has(gid)) raidJoins.set(gid, []);
            const joins = raidJoins.get(gid).filter(t => now - t < window);
            joins.push(now);
            raidJoins.set(gid, joins);
            if (joins.length >= threshold) {
                raidJoins.delete(gid);
                try {
                    await member.guild.setVerificationLevel(4);
                    await sendModAlert(settings, member.guild, `⚠️ Raid détecté ! ${threshold} membres ont rejoint en ${settings.antiRaidWindow}s. Niveau de vérification mis au maximum.`);
                } catch {}
            }
        }

        if (settings.quarantineEnabled && settings.quarantineRoleId) {
            const duration = (parseInt(settings.quarantineDuration) || 10) * 60 * 1000;
            try {
                await member.roles.add(settings.quarantineRoleId, 'Quarantaine automatique');
                setTimeout(async () => {
                    try {
                        const m = await member.guild.members.fetch(member.id);
                        if (m.roles.cache.has(settings.quarantineRoleId)) {
                            await m.roles.remove(settings.quarantineRoleId, 'Fin de quarantaine');
                        }
                    } catch {}
                }, duration);
            } catch {}
        }
    }
});

client.on('guildMemberRemove', async member => {
    await addLog(member.guild.id, member.id, member.user.username, 'Départ', 'Leave');
    await updateStatsChannels(member.guild);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const settings = await getGuildSettings(newMember.guild.id);
    if (!settings.verifiedRole) return;

    const hadRole = oldMember.roles.cache.has(settings.verifiedRole);
    const hasRole = newMember.roles.cache.has(settings.verifiedRole);

    if (hadRole !== hasRole) {
        await updateStatsChannels(newMember.guild);
    }
});

const generateCaptcha = (digits = 6, noise = 'medium') => {
    const width = 450, height = 150;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    
    // Générer le code
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const code = Math.floor(min + Math.random() * (max - min + 1)).toString();

    // Bruit de fond (chiffres gris aléatoires)
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

    // Points de bruit supplémentaires pour le mode élevé
    if (noise === 'high') {
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = `rgba(128, 128, 128, ${Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Ligne de traversée (doit être tracée avant ou après les chiffres)
    // On définit sY et eY pour qu'ils soient au milieu
    const sY = height / 2 + (Math.random() * 20 - 10);
    const eY = height / 2 + (Math.random() * 20 - 10);
    
    // Chiffres principaux (Verts)
    ctx.font = 'bold 70px Sans';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#10b981'; // Un beau vert
    
    for (let i = 0; i < code.length; i++) {
        const x = (width / (code.length + 1)) * (i + 1);
        // Calcul du Y pour que le chiffre soit sur la trajectoire de la ligne
        const y = sY + (eY - sY) * (x / width);
        
        ctx.save();
        ctx.translate(x, y + (Math.random() * 10 - 5)); // Petit décalage Y pour le désordre
        ctx.rotate((Math.random() * 0.6) - 0.3); // Rotation pour le désordre
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
    }

    // Ligne verte qui coupe les chiffres
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = noise === 'high' ? 8 : (noise === 'medium' ? 5 : 3);
    ctx.beginPath();
    ctx.moveTo(0, sY);
    ctx.lineTo(width, eY);
    ctx.stroke();

    // Lignes de bruit supplémentaires
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

    return { image: canvas.toBuffer(), code: code };
};

client.on('interactionCreate', async interaction => {
    const settings = await getGuildSettings(interaction.guildId);
    const t = translations[settings.language] || translations.fr;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup-verification') {
            const bannerPath = require('path').join(__dirname, '../image/banner.png');
            const bannerAttachment = new AttachmentBuilder(bannerPath, { name: 'banner.png' });

            const container = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ${t.welcome_title.replace('{guild}', interaction.guild.name)}`)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(t.welcome_desc)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                    )
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('verify_btn').setLabel(t.btn_verify).setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('faq_btn').setLabel(t.btn_faq).setStyle(ButtonStyle.Secondary)
                    )
                );

            await interaction.reply({
                components: [container],
                files: [bannerAttachment],
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (interaction.commandName === 'warn') {
            let isAuthorized = interaction.member.permissions.has('ModerateMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nMembre introuvable.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            if (member.user.bot) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
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

            const thresholdMute = parseInt(settings.warnThresholdMute) || 0;
            const thresholdKick = parseInt(settings.warnThresholdKick) || 0;
            const thresholdBan  = parseInt(settings.warnThresholdBan)  || 0;
            const muteDurationMin = parseInt(settings.warnMuteDuration) || 60;
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
        }

        if (interaction.commandName === 'kick') {
            let isAuthorized = interaction.member.permissions.has('KickMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member || !member.kickable) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
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
        }

        if (interaction.commandName === 'ban') {
            let isAuthorized = interaction.member.permissions.has('BanMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member || !member.bannable) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
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
        }

        if (interaction.commandName === 'untempban') {
            let isAuthorized = interaction.member.permissions.has('BanMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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
        }

        if (interaction.commandName === 'mute') {
            let isAuthorized = interaction.member.permissions.has('ModerateMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const duration = interaction.options.getInteger('duration') || 60;
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member || !member.moderatable) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
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
        }

        if (interaction.commandName === 'unmute') {
            let isAuthorized = interaction.member.permissions.has('ModerateMembers');
            if (!isAuthorized && settings.modRoles) {
                try {
                    const modRolesArr = JSON.parse(settings.modRoles);
                    isAuthorized = modRolesArr.some(r => interaction.member.roles.cache.has(r));
                } catch {}
            }
            if (!isAuthorized) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Erreur\nVous n\'avez pas les permissions nécessaires.'));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member || !member.moderatable) {
                const c = new ContainerBuilder()
                    .setAccentColor(0xef4444)
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
        }

        if (interaction.commandName === 'dashboard') {
            const logoPath = require('path').join(__dirname, '../image/shardguard.png');
            const logoAttachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Dashboard\nAccédez au dashboard de ShardGuard pour configurer votre serveur.`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://logo.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Dashboard').setURL('https://shardtown.com/dashboard').setStyle(ButtonStyle.Link)
                ));
            await interaction.reply({ components: [c], files: [logoAttachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'invite') {
            const logoPath = require('path').join(__dirname, '../image/shardguard.png');
            const logoAttachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Inviter ShardGuard\nAjoutez ShardGuard à votre serveur pour une sécurité optimale.`))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://logo.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Inviter le bot').setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`).setStyle(ButtonStyle.Link)
                ));
            await interaction.reply({ components: [c], files: [logoAttachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    } else if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'faq_btn' || customId === 'faq') {
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.faq_title}\n${t.faq_desc}`));
            await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (customId === 'verify_btn' || customId === 'verify' || customId === 'back_btn') {
            if (settings.serverLocked === 'true') {
                const c = new ContainerBuilder()
                    .setAccentColor(0x2b2d31)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.locked_msg}\n${t.locked_desc}`))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('enter_code_btn').setLabel(t.btn_enter_code).setStyle(ButtonStyle.Primary)
                    ));
                return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.step1_title}\n${t.step1_desc}`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://mprivate.png')
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('continue_btn').setLabel(t.btn_continue).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('more_info_btn').setLabel(t.btn_more_info).setStyle(ButtonStyle.Secondary)
                ));
            const opt = { components: [c], files: ['./image/mprivate.png'], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (customId === 'back_btn') await interaction.update(opt); else await interaction.reply(opt);

        } else if (customId === 'enter_code_btn' || customId === 'enter_access_code') {
            const modal = new ModalBuilder().setCustomId('access_code_modal').setTitle(t.modal_code_title);
            const input = new TextInputBuilder().setCustomId('code_input').setLabel(t.modal_code_label).setPlaceholder('SHARDTOWN').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);

        } else if (interaction.customId === 'more_info_btn') {
            const c = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.more_info_title}\n${t.more_info_desc}`))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('back_btn').setLabel(t.btn_back).setStyle(ButtonStyle.Secondary)
                ));
            await interaction.update({ components: [c], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (interaction.customId === 'continue_btn') {
            const rawRules = settings[`rules_${settings.language || 'fr'}`];
            let formattedRules = t.step2_desc;

            if (rawRules) {
                try {
                    const rulesArray = JSON.parse(rawRules);
                    if (Array.isArray(rulesArray) && rulesArray.length > 0) {
                        formattedRules = rulesArray.map(r => `<:dot:1492857051444019240> ${r}`).join('\n\n');
                    } else if (typeof rawRules === 'string' && rawRules.trim()) {
                        formattedRules = rawRules;
                    }
                } catch (e) {
                    formattedRules = rawRules;
                }
            }

            const rulesBannerPath = require('path').join(__dirname, '../image/banner.png');
            const rulesBannerAttachment = require('fs').existsSync(rulesBannerPath)
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
            await interaction.update({ components: [c], files: rulesBannerAttachment ? [rulesBannerAttachment] : [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (interaction.customId === 'rules_continue_btn' || interaction.customId === 'retry_captcha_btn') {
            const numDigits = settings.captchaDigits || 6;
            const { image, code } = generateCaptcha(numDigits, settings.captchaNoise || 'medium');
            const existing = captchaStore.get(interaction.user.id);
            const attempts = existing ? existing.attempts : (settings.captchaAttempts || 3);
            captchaStore.set(interaction.user.id, { code, currentInput: '', attempts, createdAt: Date.now() });
            const attachment = new AttachmentBuilder(image, { name: 'captcha.png' });

            const currentDesc = (settings.language === 'en' ? translations.en.step3_desc : translations.fr.step3_desc)
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
            await interaction.update({ components: [c], files: [attachment], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (interaction.customId.startsWith('num_')) {
            const userData = captchaStore.get(interaction.user.id);
            if (!userData) return interaction.reply({ content: t.session_expired, flags: [MessageFlags.Ephemeral] });
            const action = interaction.customId.replace('num_', '');
            if (action === 'delete') userData.currentInput = userData.currentInput.slice(0, -1);
            else if (action === 'submit') {
                if (userData.currentInput === userData.code) {
                    captchaStore.delete(interaction.user.id);
                    if (settings.verifiedRole) {
                        try {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            await member.roles.add(settings.verifiedRole);
                            await updateStatsChannels(interaction.guild);
                        } catch (e) { console.error("Erreur role:", e); }
                    }
                    await addLog(interaction.guildId, interaction.user.id, interaction.user.username, "Captcha", `Réussi`);
                    const successC = new ContainerBuilder()
                        .setAccentColor(0x00ff00)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${t.success_msg}\n${t.success_desc}\n\n-# ${t.footer}`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${t.premium_title}\n${t.premium_desc}`));
                    return interaction.update({ components: [successC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                } else {
                    userData.attempts -= 1;
                    if (userData.attempts <= 0) {
                        await addLog(interaction.guildId, interaction.user.id, interaction.user.username, "Captcha", `Échoué (Expulsé)`);
                        captchaStore.delete(interaction.user.id);
                        try {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            if (member.kickable) await member.kick("Trop d'échecs au captcha");
                        } catch (e) { console.error("Erreur kick:", e); }
                        const failC = new ContainerBuilder()
                            .setAccentColor(0xff0000)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.failed_msg));
                        return interaction.update({ components: [failC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                    await addLog(interaction.guildId, interaction.user.id, interaction.user.username, "Captcha", `Échoué`);
                    const retryC = new ContainerBuilder()
                        .setAccentColor(0xff0000)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.retry_msg.replace('{attempts}', userData.attempts)))
                        .addActionRowComponents(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('retry_captcha_btn').setLabel(t.btn_retry).setStyle(ButtonStyle.Secondary)
                        ));
                    return interaction.update({ components: [retryC], files: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
            } else {
                if (userData.currentInput.length < (settings.captchaDigits || 6)) userData.currentInput += action;
            }

            const numDigitsCur = settings.captchaDigits || 6;
            const currentDescCur = (settings.language === 'en' ? translations.en.step3_desc : translations.fr.step3_desc).replace('{digits}', numDigitsCur);
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
            await interaction.update({ components: [updC], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'access_code_modal') {
            const code = interaction.fields.getTextInputValue('code_input');
            if (code === settings.accessCode) {
                await addLog(interaction.guildId, interaction.user.id, interaction.user.username, "Access Code", "Success");
                
                // Si le code est bon, on donne le rôle directement
                if (settings.verifiedRole) {
                    try {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        await member.roles.add(settings.verifiedRole);
                        await updateStatsChannels(interaction.guild);
                    } catch (e) { console.error("Erreur role:", e); }
                }

                const sEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle(t.success_msg).setDescription(t.success_desc).setFooter({ text: t.footer });
                const pEmbed = new EmbedBuilder().setColor(0x2b2d31).setTitle(t.premium_title).setDescription(t.premium_desc);
                await interaction.reply({ embeds: [sEmbed, pEmbed], flags: [MessageFlags.Ephemeral] });
            } else {
                await addLog(interaction.guildId, interaction.user.id, interaction.user.username, "Access Code", "Failed");
                await interaction.reply({ content: t.wrong_access_code, flags: [MessageFlags.Ephemeral] });
            }
        }
    }
});

function wildcardToRegex(pattern) {
    const safePattern = String(pattern).slice(0, 100).replace(/\*+/g, '*');
    const escaped = safePattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '[^\\s]{0,50}');
    return new RegExp(`(?:^|\\s|\\b)${regexStr}(?:\\s|\\b|$)`, 'i');
}

const LINK_REGEX = /https?:\/\/\S+|discord\.gg\/\S+|discord\.com\/invite\/\S+/i;

async function applyModAction(message, action, reason, settings = {}) {
    try { if (message.deletable) await message.delete(); } catch(e) {}

    const mention     = `<@${message.author.id}>`;
    const autoDelete  = settings.notifAutoDelete !== 'false';
    const deleteDelay = (parseInt(settings.notifDeleteDelay) || 5) * 1000;

    const scheduleDelete = (msg) => {
        if (autoDelete) setTimeout(() => msg.delete().catch(() => {}), deleteDelay);
    };

    if (action === 'warn') {
        try {
            const w = await message.channel.send(`<:warn:1494699375216300042> ${mention}, ${reason}.`);
            scheduleDelete(w);
        } catch(e) {}
    } else if (action === 'mute') {
        try {
            if (message.member?.moderatable) {
                await message.member.timeout(10 * 60 * 1000, reason);
                const w = await message.channel.send(`<:mute:1494698925603422238> ${mention} a été mis en sourdine 10 min. (${reason})`);
                scheduleDelete(w);
            }
        } catch(e) {}
    } else if (action === 'kick') {
        try {
            if (message.member?.kickable) {
                const w = await message.channel.send(`<:kick:1494698974328918016> ${mention} a été expulsé. (${reason})`);
                scheduleDelete(w);
                await message.member.kick(reason);
            }
        } catch(e) {}
    } else if (action === 'ban') {
        try {
            if (message.member?.bannable) {
                const w = await message.channel.send(`<:ban:1494699004938813672> ${mention} a été banni. (${reason})`);
                scheduleDelete(w);
                await message.member.ban({ reason });
            }
        } catch(e) {}
    }

    await addLog(message.guild.id, message.author.id, message.author.username, reason, action);
    await sendModAlert(settings, message.guild, `Auto-mod déclenché sur <@${message.author.id}> (\`${message.author.username}\`) — action: **${action}**, raison: **${reason}**`);
}

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const settings = await getGuildSettings(message.guild.id);

    // Skip les membres ayant un rôle de modération
    if (settings.modRoles) {
        try {
            const modRolesArr = JSON.parse(settings.modRoles);
            if (modRolesArr.length > 0 && message.member) {
                if (modRolesArr.some(roleId => message.member.roles.cache.has(roleId))) return;
            }
        } catch(e) {}
    }

    // Filtre mots interdits
    if (settings.bannedWordsEnabled === 'true') {
        let bannedWordsArr = [];
        try { bannedWordsArr = JSON.parse(settings.bannedWords || '[]'); } catch(e) {}

        if (bannedWordsArr.length > 0) {
            const content = message.content.toLowerCase();
            const isMatched = bannedWordsArr.some(word => {
                if (!word || !word.trim()) return false;
                return wildcardToRegex(word.trim().toLowerCase()).test(content);
            });
            if (isMatched) {
                await applyModAction(message, settings.bannedWordsAction || 'delete', 'Mot interdit', settings);
                return;
            }
        }
    }

    // Anti-Liens
    if (settings.automodAntiLinks === 'true') {
        if (LINK_REGEX.test(message.content)) {
            await applyModAction(message, settings.automodLinksAction || 'delete', 'Anti-Liens', settings);
            return;
        }
    }

    // Anti-Caps
    if (settings.automodAntiCaps === 'true') {
        const letters = message.content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (letters.length >= 10) {
            const upperCount = (message.content.match(/[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸÇ]/g) || []).length;
            const ratio = (upperCount / letters.length) * 100;
            const threshold = parseInt(settings.automodCapsThreshold) || 70;
            if (ratio >= threshold) {
                await applyModAction(message, settings.automodCapsAction || 'delete', 'Anti-Caps', settings);
                return;
            }
        }
    }

    // Anti-Spam
    if (settings.automodAntiSpam === 'true') {
        const threshold = parseInt(settings.automodSpamThreshold) || 5;
        const interval  = parseInt(settings.automodSpamInterval)  || 5;
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();

        if (!spamTracker.has(key)) spamTracker.set(key, []);
        const entries = spamTracker.get(key).filter(e => now - e.time < interval * 1000);
        entries.push({ time: now, messageId: message.id, channelId: message.channel.id });
        spamTracker.set(key, entries);

        if (entries.length >= threshold) {
            spamTracker.delete(key);
            // Slowmode dynamique
            if (settings.automodSlowmodeEnabled === 'true') {
                const slowDuration = parseInt(settings.automodSlowmodeDuration) || 10;
                const slowExpiry   = parseInt(settings.automodSlowmodeExpiry)   || 5;
                try {
                    await message.channel.setRateLimitPerUser(slowDuration);
                    setTimeout(() => { message.channel.setRateLimitPerUser(0).catch(() => {}); }, slowExpiry * 60 * 1000);
                } catch {}
            }
            // Bulk delete tous les messages du spam window par salon
            const byChannel = {};
            for (const e of entries) {
                if (!byChannel[e.channelId]) byChannel[e.channelId] = [];
                byChannel[e.channelId].push(e.messageId);
            }
            for (const [chanId, ids] of Object.entries(byChannel)) {
                try {
                    const ch = message.guild.channels.cache.get(chanId);
                    if (ch?.isTextBased()) await ch.bulkDelete(ids, true).catch(() => {});
                } catch(e) {}
            }
            await applyModAction(message, settings.automodSpamAction || 'warn', 'Anti-Spam', settings);
            return;
        }
    }
});

client.on('guildCreate', async (guild) => {
    settingsCache.clear();
    try {
        const [rows] = await db.execute('SELECT id FROM blocked_guilds WHERE guild_id = ?', [guild.id]);
        if (rows.length > 0) {
            console.log(`🚫 Serveur bloqué détecté: ${guild.name} (${guild.id}) — départ automatique.`);
            await guild.leave();
        }
    } catch (err) {
        console.error('Erreur vérification blocage guildCreate:', err.message);
    }
});
client.on('guildDelete', () => settingsCache.clear());

client.login(process.env.DISCORD_TOKEN);