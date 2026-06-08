// Ticket system — Express API for the dashboard.
// All routes under /api/support/** require Discord session auth.

const express = require('express');
const axios   = require('axios');
const db      = require('./ticketDB');
const manager = require('./ticketManager');

const router = express.Router();

// ── auth guard ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    next();
}

// Check if Discord user has access to a guild's tickets (is staff or admin)
async function hasGuildAccess(userId, guildId, userGuilds) {
    // User must be in the guild with Manage Guild or Administrator
    const guild = (userGuilds || []).find(g => g.id === guildId);
    if (!guild) return false;
    const MANAGE_GUILD = 0x20;
    const ADMINISTRATOR = 0x8;
    const perms = BigInt(guild.permissions || 0);
    return (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
}

// ── current user ──────────────────────────────────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
    res.json({
        id:       req.user.id,
        username: req.user.username,
        avatar:   req.user.avatar
            ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.webp?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(req.user.discriminator || '0') % 5}.png`,
    });
});

// ── guilds the user can manage ────────────────────────────────────────────────

router.get('/guilds', requireAuth, async (req, res) => {
    try {
        const guilds = req.user.guilds || [];
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const open   = req.query.open === 'true' ? true : req.query.open === 'false' ? false : undefined;
        const [tickets, total] = await Promise.all([
            db.getTicketsByGuild(guildId, { limit, offset, open }),
            db.countTicketsByGuild(guildId, { open }),
        ]);
        res.json({ tickets, total, limit, offset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── transcripts list ──────────────────────────────────────────────────────────

router.get('/transcripts/:guildId', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
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
        if (!await hasGuildAccess(req.user.id, transcript.guild_id, req.user.guilds)) {
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const allowed = ['categories', 'staff_roles', 'admin_roles', 'transcript_channel_id', 'log_channel_id', 'max_tickets_per_user', 'afk_timeout_minutes'];
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
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
    if (!await hasGuildAccess(req.user.id, guildId, req.user.guilds)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    try {
        const incidents = await db.getIncidents(guildId);
        res.json(incidents);
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
