/**
 * Shardtown Support Bot.
 *
 * Minimal Discord bot:
 *   1. Stays online with a "Watching shardtwn.fr" presence.
 *   2. Slash commands: /ping, /version, /release (owner only),
 *      /promo create|list|delete (owner only).
 *
 * Env (repo-root .env, loaded by sharder.js) :
 *   SHARDTOWN_TOKEN       — bot Discord token (requis)
 *   SHARDTOWN_GH_TOKEN    — PAT GitHub avec `contents:write` sur
 *                           Shardtown/shardtown (requis pour /release)
 *   SHARDTOWN_DEV_GUILD_ID — guild id pour enregistrement instantané (optionnel)
 *   MANIFEST_URL          — override de l'URL du manifest updater (optionnel)
 *   SHARDTOWN_OWNER_ID    — owner(s) /promo, liste séparée par virgules (optionnel)
 *   WEB_URL / APP_URL     — base URL du site (défaut http://localhost:3000)
 *   BOT_API_KEY           — clé partagée avec /api/bot/promo-codes (≥16 chars)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {
    Client, GatewayIntentBits,
    SlashCommandBuilder, REST, Routes, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');

const MANIFEST_URL = process.env.MANIFEST_URL || 'https://shardtwn.fr/updates/latest.json';

// Single Discord user authorized to trigger releases via /release. Hardcoded
// on purpose — this is a one-person owner override, not a role.
const RELEASE_OWNER_ID = '1394404648084832389';
const RELEASE_REPO_OWNER = 'Shardtown';
const RELEASE_REPO_NAME = 'shardtown';

// When set, slash commands are registered ON THIS SPECIFIC GUILD (instant
// availability, no 1h propagation delay) and the *global* command set is
// wiped to avoid duplicates in clients that previously cached it. Leave
// empty to fall back to the legacy global registration.
const DEV_GUILD_ID = process.env.SHARDTOWN_DEV_GUILD_ID || '1409954518682042462';

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
    new SlashCommandBuilder()
        .setName('release')
        .setDescription('Bump + build de l\'app desktop (owner only).')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('promo')
        .setDescription('[Owner] Gérer les codes promo Shardtown Premium')
        .addSubcommand(s => s.setName('create')
            .setDescription('Créer un code promo')
            .addStringOption(o => o.setName('code').setDescription('Ex: SUMMER25 (3-64 chars A-Z 0-9 _ -)').setRequired(true))
            .addIntegerOption(o => o.setName('valeur').setDescription('Pourcentage 1-100, OU centimes pour fixed').setRequired(true).setMinValue(1))
            .addStringOption(o => o.setName('type').setDescription('Type de discount').addChoices(
                { name: 'Pourcentage (1-100)', value: 'percent' },
                { name: 'Montant fixe (centimes)', value: 'fixed' },
            ))
            .addStringOption(o => o.setName('plan').setDescription('Plan concerné').addChoices(
                { name: 'Tous les plans', value: 'all' },
                { name: 'Mensuel uniquement', value: 'monthly' },
                { name: 'Annuel uniquement', value: 'yearly' },
                { name: 'Lifetime uniquement', value: 'lifetime' },
            ))
            .addIntegerOption(o => o.setName('utilisations').setDescription('Nombre max d\'utilisations (0 = illimité)').setMinValue(0))
            .addStringOption(o => o.setName('expire').setDescription('Date d\'expiration ISO (ex: 2026-12-31) — laisser vide pour aucune')))
        .addSubcommand(s => s.setName('list')
            .setDescription('Lister tous les codes promo'))
        .addSubcommand(s => s.setName('delete')
            .setDescription('Supprimer un code promo')
            .addStringOption(o => o.setName('code').setDescription('Code à supprimer').setRequired(true)))
        .toJSON(),
];

async function registerCommands() {
    if (!process.env.SHARDTOWN_TOKEN) return;
    const rest = new REST({ version: '10' }).setToken(process.env.SHARDTOWN_TOKEN);
    try {
        if (DEV_GUILD_ID) {
            // Guild-scoped registration → commands appear instantly in the
            // target server, no 1h propagation delay.
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, DEV_GUILD_ID),
                { body: commands },
            );
            console.log(`[Shardtown] ${commands.length} slash commands enregistrées sur la guild ${DEV_GUILD_ID}.`);
            // Wipe the global set so users don't see ghost duplicates from
            // previous deployments. Safe to run every boot — empty body just
            // overwrites whatever was there.
            try {
                await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
                console.log('[Shardtown] Anciennes commandes globales nettoyées.');
            } catch (err) {
                console.warn('[Shardtown] Nettoyage commandes globales KO:', err.message);
            }
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log(`[Shardtown] ${commands.length} slash commands enregistrées globalement.`);
        }
    } catch (err) {
        console.error('[Shardtown] Échec enregistrement commands:', err.message);
    }
}

/* ─── Lifecycle ────────────────────────────────────────────────────── */

client.once('clientReady', () => {
    console.log(`[Shardtown] Connecté en tant que ${client.user.tag} (shard ${client.shard?.ids?.[0] ?? '?'}).`);
    client.user.setActivity('shardtwn.fr', { type: 3 }); // 3 = Watching
    registerCommands();
});

/* ─── Interactions ─────────────────────────────────────────────────── */

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case 'ping':    return cmdPing(interaction);
                case 'version': return cmdVersion(interaction);
                case 'release': return cmdRelease(interaction);
                case 'promo':   return cmdPromo(interaction);
            }
        } else if (interaction.isModalSubmit() && interaction.customId === 'release-modal') {
            return onReleaseSubmit(interaction);
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

/* ─── /promo (owner only) ──────────────────────────────────────────── */

async function cmdPromo(interaction) {
    const ownerIds = String(process.env.SHARDTOWN_OWNER_ID || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (ownerIds.length === 0) ownerIds.push(RELEASE_OWNER_ID);
    if (!ownerIds.includes(interaction.user.id)) {
        return interaction.reply({
            content: '⛔ Commande réservée au propriétaire du bot.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const webUrl = process.env.WEB_URL || process.env.APP_URL || 'http://localhost:3000';
    const botKey = process.env.BOT_API_KEY;
    if (!botKey || botKey.length < 16) {
        return interaction.reply({
            content: '⚠️ `BOT_API_KEY` non configuré côté bot. Ajoute-le dans `.env` (≥16 chars).',
            flags: MessageFlags.Ephemeral,
        });
    }
    const headers = { 'Content-Type': 'application/json', 'X-Bot-Key': botKey };

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (sub === 'create') {
            const code = interaction.options.getString('code', true).trim().toUpperCase();
            const valeur = interaction.options.getInteger('valeur', true);
            const type = interaction.options.getString('type') || 'percent';
            const plan = interaction.options.getString('plan') || 'all';
            const utilisations = interaction.options.getInteger('utilisations') ?? 0;
            const expire = interaction.options.getString('expire');

            const body = {
                code,
                discountType: type,
                discountValue: valeur,
                appliesTo: plan,
                maxUses: utilisations,
                expiresAt: expire || null,
                createdBy: interaction.user.id,
            };
            const res = await fetch(`${webUrl}/api/bot/promo-codes`, {
                method: 'POST', headers, body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return interaction.editReply({ content: `❌ ${data.error || `HTTP ${res.status}`}` });
            }
            const valStr = type === 'percent' ? `-${valeur}%` : `-${(valeur/100).toFixed(2)} €`;
            const usesStr = utilisations === 0 ? 'illimitées' : `${utilisations}`;
            const expStr = expire ? ` · expire le ${expire}` : '';
            return interaction.editReply({
                content: `✅ Code **${code}** créé\n• Discount : **${valStr}**\n• Plan : ${plan}\n• Utilisations : ${usesStr}${expStr}`,
            });
        }

        if (sub === 'list') {
            const res = await fetch(`${webUrl}/api/bot/promo-codes`, { headers });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return interaction.editReply({ content: `❌ ${data.error || `HTTP ${res.status}`}` });
            }
            const codes = Array.isArray(data.codes) ? data.codes : [];
            if (codes.length === 0) {
                return interaction.editReply({ content: 'Aucun code promo enregistré.' });
            }
            const lines = codes.slice(0, 25).map(c => {
                const val = c.discount_type === 'percent' ? `-${c.discount_value}%` : `-${(c.discount_value/100).toFixed(2)}€`;
                const uses = c.max_uses === 0 ? `${c.used_count} utilisations` : `${c.used_count}/${c.max_uses}`;
                const exp = c.expires_at ? ` · exp ${new Date(c.expires_at).toISOString().slice(0,10)}` : '';
                return `• **${c.code}** — ${val} sur ${c.applies_to} (${uses})${exp}`;
            }).join('\n');
            const footer = codes.length > 25 ? `\n\n…et ${codes.length - 25} autres.` : '';
            return interaction.editReply({ content: `**Codes promo (${codes.length})**\n${lines}${footer}` });
        }

        if (sub === 'delete') {
            const code = interaction.options.getString('code', true).trim().toUpperCase();
            const res = await fetch(`${webUrl}/api/bot/promo-codes/${encodeURIComponent(code)}`, {
                method: 'DELETE', headers,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return interaction.editReply({ content: `❌ ${data.error || `HTTP ${res.status}`}` });
            }
            return interaction.editReply({ content: `🗑️ Code **${code}** supprimé.` });
        }

        return interaction.editReply({ content: 'Sous-commande inconnue.' });
    } catch (err) {
        console.error('[Shardtown] Erreur /promo:', err);
        return interaction.editReply({ content: `❌ Erreur réseau : ${err.message}` });
    }
}

/* ─── Release pipeline ─────────────────────────────────────────────── */

async function cmdRelease(interaction) {
    if (interaction.user.id !== RELEASE_OWNER_ID) {
        return interaction.reply({
            content: 'Commande réservée.',
            flags: MessageFlags.Ephemeral,
        });
    }

    // Suggest the next patch version based on what's currently published, so
    // the modal pre-fills the obvious next value but stays editable.
    let suggested = '';
    try {
        const r = await fetch(MANIFEST_URL);
        if (r.ok) {
            const j = await r.json();
            suggested = bumpPatch(j.version) || '';
        }
    } catch {}

    const input = new TextInputBuilder()
        .setCustomId('version')
        .setLabel('Version cible (semver X.Y.Z)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(16)
        .setPlaceholder('0.1.36');
    if (suggested) input.setValue(suggested);

    const modal = new ModalBuilder()
        .setCustomId('release-modal')
        .setTitle('Release Shardtown desktop')
        .addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
}

async function onReleaseSubmit(interaction) {
    if (interaction.user.id !== RELEASE_OWNER_ID) {
        return interaction.reply({ content: 'Refusé.', flags: MessageFlags.Ephemeral });
    }
    const version = interaction.fields.getTextInputValue('version').trim().replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return interaction.reply({
            content: `\`${version}\` n'est pas une version semver valide (attendu : X.Y.Z).`,
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const result = await bumpAndTriggerRelease(version);
        const shortSha = result.commitSha.slice(0, 7);
        await interaction.editReply(
            `Release **v${version}** lancée.\n` +
            `• Bump committé sur \`main\` : [\`${shortSha}\`](https://github.com/${RELEASE_REPO_OWNER}/${RELEASE_REPO_NAME}/commit/${result.commitSha})\n` +
            `• Branche déclencheur : \`${result.branch}\`\n` +
            `• Suivi : https://github.com/${RELEASE_REPO_OWNER}/${RELEASE_REPO_NAME}/actions`
        );
    } catch (err) {
        console.error('[Shardtown] /release failed:', err);
        await interaction.editReply(`Échec : ${err.message}`);
    }
}

function bumpPatch(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
    if (!m) return null;
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

async function gh(path, init = {}) {
    const token = process.env.SHARDTOWN_GH_TOKEN;
    if (!token) throw new Error('SHARDTOWN_GH_TOKEN manquant dans .env');
    const r = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'shardtown-release-bot',
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
    if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`GitHub API ${r.status} sur ${path} — ${txt.slice(0, 180)}`);
    }
    return r.status === 204 ? null : r.json();
}

// Atomic version bump: writes tauri.conf.json + Cargo.toml in a single commit
// on main, then creates a `release-trigger-<version>` branch ref so the
// release.yml workflow picks it up exactly once.
async function bumpAndTriggerRelease(version) {
    const repo = `/repos/${RELEASE_REPO_OWNER}/${RELEASE_REPO_NAME}`;
    const tauriPath = 'desktop-tauri/src-tauri/tauri.conf.json';
    const cargoPath = 'desktop-tauri/src-tauri/Cargo.toml';

    // Refuse to overwrite an existing release-trigger branch — that means a
    // build for this version is already in flight (or finished).
    try {
        await gh(`${repo}/git/ref/heads/release-trigger-${version}`);
        throw new Error(`La branche release-trigger-${version} existe déjà.`);
    } catch (err) {
        if (!/404/.test(err.message)) throw err;
    }

    const mainRef = await gh(`${repo}/git/ref/heads/main`);
    const baseSha = mainRef.object.sha;
    const baseCommit = await gh(`${repo}/git/commits/${baseSha}`);

    const [tauriFile, cargoFile] = await Promise.all([
        gh(`${repo}/contents/${encodeURIComponent(tauriPath)}?ref=main`),
        gh(`${repo}/contents/${encodeURIComponent(cargoPath)}?ref=main`),
    ]);
    const tauriContent = Buffer.from(tauriFile.content, 'base64').toString('utf8');
    const cargoContent = Buffer.from(cargoFile.content, 'base64').toString('utf8');

    const newTauri = tauriContent.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`);
    const newCargo = cargoContent.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
    if (newTauri === tauriContent) throw new Error('Pattern version introuvable dans tauri.conf.json.');
    if (newCargo === cargoContent) throw new Error('Pattern version introuvable dans Cargo.toml.');
    if (newTauri === tauriContent && newCargo === cargoContent) {
        throw new Error('Aucun changement à committer — version déjà appliquée ?');
    }

    const [tauriBlob, cargoBlob] = await Promise.all([
        gh(`${repo}/git/blobs`, {
            method: 'POST',
            body: JSON.stringify({ content: newTauri, encoding: 'utf-8' }),
        }),
        gh(`${repo}/git/blobs`, {
            method: 'POST',
            body: JSON.stringify({ content: newCargo, encoding: 'utf-8' }),
        }),
    ]);

    const newTree = await gh(`${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
            base_tree: baseCommit.tree.sha,
            tree: [
                { path: tauriPath, mode: '100644', type: 'blob', sha: tauriBlob.sha },
                { path: cargoPath, mode: '100644', type: 'blob', sha: cargoBlob.sha },
            ],
        }),
    });

    const newCommit = await gh(`${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
            message: `bump v${version}\n\nDéclenché depuis /release sur le bot Shardtown.`,
            tree: newTree.sha,
            parents: [baseSha],
        }),
    });

    // Fast-forward main, then create the release-trigger branch off the same
    // commit. The branch is what fires release.yml.
    await gh(`${repo}/git/refs/heads/main`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit.sha }),
    });
    await gh(`${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
            ref: `refs/heads/release-trigger-${version}`,
            sha: newCommit.sha,
        }),
    });

    return { commitSha: newCommit.sha, branch: `release-trigger-${version}` };
}

/* ─── Login ─────────────────────────────────────────────────────────── */

client.login(process.env.SHARDTOWN_TOKEN).catch(err => {
    console.error('[Shardtown] Login KO:', err.message);
    process.exit(1);
});
