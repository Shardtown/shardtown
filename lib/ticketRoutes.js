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
    const user = getAuthUser(req);
    if (!user) return false;
    const guild = (user.guilds || []).find(g => g.id === guildId);
    if (!guild) return false;
    const MANAGE_GUILD = 0x20n;
    const ADMINISTRATOR = 0x8n;
    const perms = BigInt(guild.permissions || 0);
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
            const p = BigInt(g.permissions || 0);
            return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n;
        });
        res.json(accessible);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

router.put('/config/:guildId', requireAuth, express.json(), async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const allowed = ['categories', 'staff_roles', 'admin_roles', 'transcript_channel_id', 'log_channel_id', 'max_tickets_per_user', 'afk_timeout_minutes', 'panel_title', 'panel_description', 'panel_footer', 'panel_color', 'welcome_title', 'welcome_color', 'welcome_footer'];
        for (const key of allowed) {
            if (key in req.body) await db.setConfig(guildId, key, req.body[key]);
        }
        const updated = await manager.getGuildConfig(guildId);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

// ── incidents ─────────────────────────────────────────────────────────────────

router.get('/incidents/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req, guildId)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const incidents = await db.getIncidents(guildId);
        res.json(incidents);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

// ── Uptime Kuma webhook ───────────────────────────────────────────────────────
// POST /api/support/webhook/uptime?guild=GUILD_ID&secret=SECRET

router.post('/webhook/uptime', express.json(), async (req, res) => {
    const secret = process.env.UPTIME_WEBHOOK_SECRET;
    if (secret && req.query.secret !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const guildId = req.query.guild || '';

    try {
        const { heartbeat, monitor } = req.body || {};
        if (!heartbeat || !monitor) return res.status(400).json({ error: 'Invalid payload' });

        const serviceName = monitor.name || monitor.url || 'unknown';
        const statusMap   = { 0: 'down', 1: 'up', 2: 'degraded' };
        const status      = statusMap[heartbeat.status] || 'down';
        const message     = heartbeat.msg || null;

        await db.upsertIncident(guildId, serviceName, status, message);
        res.json({ ok: true });
    } catch (err) {
        console.error('[ticket] uptime webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
