// Ticket system — Express API for the dashboard.
// All routes under /api/support/** require Discord session auth.

const express = require('express');
const axios   = require('axios');
const db      = require('./ticketDB');
const manager = require('./ticketManager');

const router = express.Router();

// ── auth guard ────────────────────────────────────────────────────────────────

// Accepts both Discord OAuth (req.user) and Shard dashboard session (req.session.shardUser).
function getAuthUser(req) {
    if (req.user) return req.user;
    if (req.session?.shardUser) return req.session.shardUser;
    return null;
}

function requireAuth(req, res, next) {
    if (!getAuthUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    next();
}

async function hasGuildAccess(req, guildId) {
    // Site admin (argon2 key session) → accès complet
    if (req.session?.isAdmin) return true;
    const user = getAuthUser(req);
    if (!user) return false;
    const guild = (user.guilds || []).find(g => g.id === guildId);
    if (!guild) return false;
    // Si permissions non stockées (cache vide), on fait confiance au fait
    // que la guild est dans la liste (Discord ne retourne que les guilds
    // où l'utilisateur est présent).
    if (!guild.permissions) return true;
    const MANAGE_GUILD = 0x20n;
    const ADMINISTRATOR = 0x8n;
    const perms = BigInt(guild.permissions);
    return (perms & MANAGE_GUILD) !== 0n || (perms & ADMINISTRATOR) !== 0n;
}

// ── current user ──────────────────────────────────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
    const user = getAuthUser(req);
    res.json({
        id:       user.id,
        username: user.username,
        avatar:   user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`,
    });
});

// ── guilds the user can manage ────────────────────────────────────────────────

router.get('/guilds', requireAuth, async (req, res) => {
    try {
        const guilds = getAuthUser(req).guilds || [];
        const accessible = guilds.filter(g => {
            // Si les permissions ne sont pas en cache, on fait confiance
            // à la présence de la guild (Discord ne retourne que les guilds
            // où l'utilisateur est présent). Cohérent avec hasGuildAccess.
            if (!g.permissions) return true;
            const p = BigInt(g.permissions);
            return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n;
        });
        res.json(accessible);
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── stats ─────────────────────────────────────────────────────────────────────

router.get('/stats/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const [stats, openCount, closedCount] = await Promise.all([
            db.getStats(guildId, days),
            db.countTicketsByGuild(guildId, { open: true }),
            db.countTicketsByGuild(guildId, { open: false }),
        ]);
        res.json({ ...stats, openCount, closedCount });
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── tickets list ──────────────────────────────────────────────────────────────

router.get('/tickets/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const open   = req.query.open === 'true' ? true : req.query.open === 'false' ? false : undefined;
        const [rawTickets, total] = await Promise.all([
            db.getTicketsByGuild(guildId, { limit, offset, open }),
            db.countTicketsByGuild(guildId, { open }),
        ]);
        const tickets = rawTickets.map(t => ({
            ...t,
            status: t.closed_at ? 'closed' : 'open',
        }));
        res.json({ tickets, total, limit, offset });
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── delete ticket (closed only) ───────────────────────────────────────────

router.delete('/ticket/:id', requireAuth, async (req, res) => {
    try {
        const meta = await db.getTicketMeta(req.params.id);
        if (!meta) return res.status(404).json({ error: 'Ticket introuvable' });
        if (meta.closed_at === null) return res.status(400).json({ error: 'Impossible de supprimer un ticket ouvert' });
        if (!await hasGuildAccess(req, meta.guild_id)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        await db.deleteTicket(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /ticket] error:', err);
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── delete transcript ─────────────────────────────────────────────────────

router.delete('/transcript/:id', requireAuth, async (req, res) => {
    try {
        // Use lightweight meta query — avoids loading LONGTEXT messages column
        const meta = await db.getTranscriptMeta(req.params.id);
        if (!meta) return res.status(404).json({ error: 'Transcript introuvable' });
        if (!await hasGuildAccess(req, meta.guild_id)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        await db.deleteTranscript(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /transcript] error:', err);
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── transcripts list ──────────────────────────────────────────────────────────

router.get('/transcripts/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const [transcripts, total] = await Promise.all([
            db.getTranscriptsByGuild(guildId, { limit, offset }),
            db.countTranscriptsByGuild(guildId),
        ]);
        res.json({ transcripts, total, limit, offset });
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── single transcript ─────────────────────────────────────────────────────────

router.get('/transcript/:id', requireAuth, async (req, res) => {
    try {
        const transcript = await db.getTranscriptById(req.params.id);
        if (!transcript) return res.status(404).json({ error: 'Transcript introuvable' });
        if (!await hasGuildAccess(req, transcript.guild_id)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        res.json(transcript);
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── guild config ──────────────────────────────────────────────────────────────

router.get('/config/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const config = await manager.getGuildConfig(guildId);
        res.json(config);
    } catch (err) {
        console.error('[ticketRoutes] GET /config error:', err.message, err.stack?.split('\n')[1]?.trim());
        res.status(500).json({ error: err.message || 'Erreur serveur' });
    }
});

router.put('/config/:guildId', requireAuth, express.json(), async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const allowed = ['categories', 'staff_roles', 'admin_roles', 'transcript_channel_id', 'log_channel_id', 'max_tickets_per_user', 'afk_timeout_minutes', 'panel_title', 'panel_description', 'panel_footer', 'panel_color', 'welcome_title', 'welcome_color', 'welcome_footer', 'claim_enabled'];
        for (const key of allowed) {
            if (key in req.body) await db.setConfig(guildId, key, req.body[key]);
        }
        const updated = await manager.getGuildConfig(guildId);
        res.json(updated);
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Discord resources (channels / roles) for config UI ───────────────────────

router.get('/discord/channels/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const r = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` },
        });
        const GUILD_TEXT     = 0;
        const GUILD_CATEGORY = 4;
        const channels = r.data
            .filter(c => c.type === GUILD_TEXT || c.type === GUILD_CATEGORY)
            .map(c => ({ id: c.id, name: c.name, type: c.type, position: c.position, parent_id: c.parent_id }))
            .sort((a, b) => a.position - b.position);
        res.json(channels);
    } catch (err) {
        const status = err?.response?.status;
        console.warn('[ticketRoutes] Discord channels fetch failed for', guildId, '—', status ?? err.message);
        res.json([]); // non-fatal: UI falls back to empty dropdown
    }
});

router.get('/discord/roles/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const r = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` },
        });
        const roles = r.data
            .filter(role => !role.managed && role.id !== guildId)
            .map(r => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
            .sort((a, b) => b.position - a.position);
        res.json(roles);
    } catch (err) {
        const status = err?.response?.status;
        console.warn('[ticketRoutes] Discord roles fetch failed for', guildId, '—', status ?? err.message);
        res.json([]); // non-fatal: UI falls back to empty dropdown
    }
});

// ── staff stats ───────────────────────────────────────────────────────────────

router.get('/staff-stats/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) return res.status(403).json({ error: 'Accès refusé' });
    try {
        const stats = await db.getStaffStats(guildId);
        res.json(stats);
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// ── deploy panel ─────────────────────────────────────────────────────────────

router.post('/panel/:guildId/deploy', requireAuth, express.json(), async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const { channelId } = req.body || {};
        if (!channelId) return res.status(400).json({ error: 'channelId requis' });
        const config = await manager.getGuildConfig(guildId);
        const { embeds, components } = await manager.buildPanel(config);
        await axios.post(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            { embeds: embeds.map(e => e.toJSON()), components: components.map(c => c.toJSON()) },
            { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } },
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[ticketRoutes]', req.method, req.path, err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


module.exports = router;
