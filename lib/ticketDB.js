// Ticket system — MySQL persistence layer.
// Adapted from PaladiumSupport (PostgreSQL) → MySQL.
// JSON columns stored as TEXT + manual JSON.parse/stringify.

let pool;

async function init(poolInstance) {
    pool = poolInstance;

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS support_tickets (
            id          VARCHAR(8)   NOT NULL PRIMARY KEY,
            guild_id    VARCHAR(20)  NOT NULL,
            channel_id  VARCHAR(20)  NOT NULL,
            author_id   VARCHAR(20)  NOT NULL,
            author_pseudo VARCHAR(100) DEFAULT NULL,
            category    VARCHAR(50)  NOT NULL,
            claimed_by  TEXT         NOT NULL DEFAULT '[]',
            closed_by   VARCHAR(20)  DEFAULT NULL,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at   TIMESTAMP    NULL DEFAULT NULL,
            afk_timeout_at TIMESTAMP NULL DEFAULT NULL,
            INDEX idx_guild   (guild_id),
            INDEX idx_channel (channel_id),
            INDEX idx_author  (author_id),
            INDEX idx_open    (closed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS support_transcripts (
            id           VARCHAR(8)   NOT NULL PRIMARY KEY,
            guild_id     VARCHAR(20)  NOT NULL,
            author_id    VARCHAR(20)  NOT NULL,
            author_pseudo VARCHAR(100) DEFAULT NULL,
            category     VARCHAR(50)  NOT NULL,
            claimed_by   TEXT         NOT NULL DEFAULT '[]',
            messages     LONGTEXT     NOT NULL,
            created_at   TIMESTAMP    NOT NULL,
            closed_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_guild  (guild_id),
            INDEX idx_author (author_id),
            INDEX idx_date   (closed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS support_config (
            guild_id     VARCHAR(20)  NOT NULL,
            config_key   VARCHAR(50)  NOT NULL,
            config_value LONGTEXT     NOT NULL,
            updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, config_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS support_stats (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            ticket_id   VARCHAR(8)   NOT NULL,
            guild_id    VARCHAR(20)  NOT NULL,
            event_type  ENUM('opened','closed','claimed') NOT NULL,
            user_id     VARCHAR(20)  DEFAULT NULL,
            category    VARCHAR(50)  DEFAULT NULL,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_guild  (guild_id),
            INDEX idx_ticket (ticket_id),
            INDEX idx_date   (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS support_incidents (
            id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            guild_id     VARCHAR(20)  NOT NULL DEFAULT '',
            service_name VARCHAR(100) NOT NULL,
            status       ENUM('up','down','degraded') NOT NULL,
            message      TEXT         DEFAULT NULL,
            started_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ended_at     TIMESTAMP    NULL DEFAULT NULL,
            INDEX idx_guild   (guild_id),
            INDEX idx_service (service_name),
            INDEX idx_started (started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseJson(v, fallback = []) {
    if (!v) return fallback;
    try { return JSON.parse(v); } catch { return fallback; }
}

function normalizeTicket(row) {
    if (!row) return null;
    return { ...row, claimed_by: parseJson(row.claimed_by, []) };
}

// ── ID generation ─────────────────────────────────────────────────────────────

function generateTicketId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

async function getUniqueTicketId() {
    let id;
    let attempts = 0;
    do {
        id = generateTicketId();
        attempts++;
        if (attempts > 20) throw new Error('Could not generate unique ticket ID');
    } while (await ticketIdExists(id));
    return id;
}

// ── tickets ───────────────────────────────────────────────────────────────────

async function ticketIdExists(id) {
    const [rows] = await pool.execute('SELECT 1 FROM support_tickets WHERE id = ?', [id]);
    return rows.length > 0;
}

async function getTicketById(id) {
    const [rows] = await pool.execute('SELECT * FROM support_tickets WHERE id = ?', [id]);
    return normalizeTicket(rows[0] || null);
}

async function getTicketByChannelId(channelId) {
    const [rows] = await pool.execute('SELECT * FROM support_tickets WHERE channel_id = ?', [channelId]);
    return normalizeTicket(rows[0] || null);
}

async function getOpenTicketsByAuthor(guildId, authorId) {
    const [rows] = await pool.execute(
        'SELECT * FROM support_tickets WHERE guild_id = ? AND author_id = ? AND closed_at IS NULL',
        [guildId, authorId]
    );
    return rows.map(normalizeTicket);
}

async function createTicket(id, guildId, channelId, authorId, authorPseudo, category) {
    await pool.execute(
        'INSERT INTO support_tickets (id, guild_id, channel_id, author_id, author_pseudo, category, claimed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, guildId, channelId, authorId, authorPseudo, category, '[]']
    );
    await logEvent(id, guildId, 'opened', null, category);
}

async function closeTicket(id, closedBy) {
    await pool.execute(
        'UPDATE support_tickets SET closed_at = CURRENT_TIMESTAMP, closed_by = ?, afk_timeout_at = NULL WHERE id = ?',
        [closedBy, id]
    );
    const ticket = await getTicketById(id);
    if (ticket) await logEvent(id, ticket.guild_id, 'closed', closedBy, ticket.category);
}

// Lightweight: only id + guild_id + closed_at — avoids loading full ticket
async function getTicketMeta(id) {
    const [rows] = await pool.execute(
        'SELECT id, guild_id, closed_at FROM support_tickets WHERE id = ?', [id]
    );
    return rows[0] || null;
}

async function deleteTicket(id) {
    await pool.execute('DELETE FROM support_tickets WHERE id = ?', [id]);
}

async function claimTicket(id, userId) {
    const ticket = await getTicketById(id);
    if (!ticket) return false;
    const claimed = ticket.claimed_by;
    if (claimed.includes(userId)) return false;
    claimed.push(userId);
    await pool.execute(
        'UPDATE support_tickets SET claimed_by = ? WHERE id = ?',
        [JSON.stringify(claimed), id]
    );
    if (claimed.length === 1) await logEvent(id, ticket.guild_id, 'claimed', userId, ticket.category);
    return true;
}

async function setAfkTimeout(id, date) {
    await pool.execute('UPDATE support_tickets SET afk_timeout_at = ? WHERE id = ?', [date, id]);
}

async function clearAfkTimeout(id) {
    await pool.execute('UPDATE support_tickets SET afk_timeout_at = NULL WHERE id = ?', [id]);
}

async function getExpiredAfkTickets() {
    const [rows] = await pool.execute(
        'SELECT * FROM support_tickets WHERE afk_timeout_at IS NOT NULL AND afk_timeout_at <= NOW() AND closed_at IS NULL'
    );
    return rows.map(normalizeTicket);
}

async function getTicketsByGuild(guildId, { limit = 50, offset = 0, open } = {}) {
    let sql = 'SELECT * FROM support_tickets WHERE guild_id = ?';
    const params = [guildId];
    if (open === true)  { sql += ' AND closed_at IS NULL'; }
    if (open === false) { sql += ' AND closed_at IS NOT NULL'; }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(sql, params);
    return rows.map(normalizeTicket);
}

async function countTicketsByGuild(guildId, { open } = {}) {
    let sql = 'SELECT COUNT(*) as cnt FROM support_tickets WHERE guild_id = ?';
    const params = [guildId];
    if (open === true)  sql += ' AND closed_at IS NULL';
    if (open === false) sql += ' AND closed_at IS NOT NULL';
    const [rows] = await pool.execute(sql, params);
    return Number(rows[0]?.cnt || 0);
}

// ── transcripts ───────────────────────────────────────────────────────────────

async function saveTranscript(ticket, messages) {
    await pool.execute(
        `INSERT INTO support_transcripts (id, guild_id, author_id, author_pseudo, category, claimed_by, messages, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE messages = VALUES(messages), closed_at = CURRENT_TIMESTAMP`,
        [
            ticket.id, ticket.guild_id, ticket.author_id, ticket.author_pseudo,
            ticket.category, JSON.stringify(ticket.claimed_by),
            JSON.stringify(messages), ticket.created_at,
        ]
    );
}

async function getTranscriptById(id) {
    const [rows] = await pool.execute('SELECT * FROM support_transcripts WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return null;
    return {
        ...row,
        claimed_by: parseJson(row.claimed_by, []),
        messages:   parseJson(row.messages,   []),
    };
}

// Lightweight: only id + guild_id — avoids loading LONGTEXT messages column
async function getTranscriptMeta(id) {
    const [rows] = await pool.execute(
        'SELECT id, guild_id FROM support_transcripts WHERE id = ?', [id]
    );
    return rows[0] || null;
}

async function deleteTranscript(id) {
    await pool.execute('DELETE FROM support_transcripts WHERE id = ?', [id]);
}

async function getTranscriptsByGuild(guildId, { limit = 50, offset = 0 } = {}) {
    const [rows] = await pool.execute(
        'SELECT id, guild_id, author_id, author_pseudo, category, claimed_by, created_at, closed_at FROM support_transcripts WHERE guild_id = ? ORDER BY closed_at DESC LIMIT ? OFFSET ?',
        [guildId, limit, offset]
    );
    return rows.map(r => ({ ...r, claimed_by: parseJson(r.claimed_by, []) }));
}

async function countTranscriptsByGuild(guildId) {
    const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM support_transcripts WHERE guild_id = ?', [guildId]);
    return Number(rows[0]?.cnt || 0);
}

// ── config ────────────────────────────────────────────────────────────────────

async function getConfig(guildId, key) {
    const [rows] = await pool.execute(
        'SELECT config_value FROM support_config WHERE guild_id = ? AND config_key = ?',
        [guildId, key]
    );
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].config_value); } catch { return rows[0].config_value; }
}

async function setConfig(guildId, key, value) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    await pool.execute(
        'INSERT INTO support_config (guild_id, config_key, config_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)',
        [guildId, key, str]
    );
}

async function getAllConfig(guildId) {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM support_config WHERE guild_id = ?', [guildId]);
    const cfg = {};
    for (const row of rows) {
        try { cfg[row.config_key] = JSON.parse(row.config_value); }
        catch { cfg[row.config_key] = row.config_value; }
    }
    return cfg;
}

// ── stats ─────────────────────────────────────────────────────────────────────

async function logEvent(ticketId, guildId, eventType, userId, category) {
    await pool.execute(
        'INSERT INTO support_stats (ticket_id, guild_id, event_type, user_id, category) VALUES (?, ?, ?, ?, ?)',
        [ticketId, guildId, eventType, userId || null, category || null]
    );
}

async function getStats(guildId, days = 30) {
    const [opened] = await pool.execute(
        'SELECT DATE(created_at) as day, COUNT(*) as cnt FROM support_stats WHERE guild_id = ? AND event_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY day ORDER BY day',
        [guildId, 'opened', days]
    );
    const [closed] = await pool.execute(
        'SELECT DATE(created_at) as day, COUNT(*) as cnt FROM support_stats WHERE guild_id = ? AND event_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY day ORDER BY day',
        [guildId, 'closed', days]
    );
    const [byCategory] = await pool.execute(
        'SELECT category, COUNT(*) as cnt FROM support_stats WHERE guild_id = ? AND event_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY category ORDER BY cnt DESC',
        [guildId, 'opened', days]
    );
    const [totals] = await pool.execute(
        'SELECT event_type, COUNT(*) as cnt FROM support_stats WHERE guild_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY event_type',
        [guildId, days]
    );
    return { opened, closed, byCategory, totals };
}

// ── incidents ─────────────────────────────────────────────────────────────────

async function upsertIncident(guildId, serviceName, status, message) {
    const [open] = await pool.execute(
        'SELECT id FROM support_incidents WHERE guild_id = ? AND service_name = ? AND ended_at IS NULL',
        [guildId, serviceName]
    );
    if (status === 'up') {
        if (open.length > 0) {
            await pool.execute(
                'UPDATE support_incidents SET ended_at = NOW(), status = ? WHERE guild_id = ? AND service_name = ? AND ended_at IS NULL',
                [status, guildId, serviceName]
            );
        }
    } else {
        if (open.length === 0) {
            await pool.execute(
                'INSERT INTO support_incidents (guild_id, service_name, status, message) VALUES (?, ?, ?, ?)',
                [guildId, serviceName, status, message || null]
            );
        } else {
            await pool.execute(
                'UPDATE support_incidents SET status = ?, message = ? WHERE guild_id = ? AND service_name = ? AND ended_at IS NULL',
                [status, message || null, guildId, serviceName]
            );
        }
    }
}

async function getIncidents(guildId, { limit = 50 } = {}) {
    const [rows] = await pool.execute(
        'SELECT * FROM support_incidents WHERE guild_id = ? ORDER BY started_at DESC LIMIT ?',
        [guildId, limit]
    );
    return rows;
}

module.exports = {
    init,
    getUniqueTicketId,
    ticketIdExists,
    getTicketById,
    getTicketMeta,
    getTicketByChannelId,
    getOpenTicketsByAuthor,
    createTicket,
    closeTicket,
    deleteTicket,
    claimTicket,
    setAfkTimeout,
    clearAfkTimeout,
    getExpiredAfkTickets,
    getTicketsByGuild,
    countTicketsByGuild,
    saveTranscript,
    getTranscriptById,
    getTranscriptMeta,
    deleteTranscript,
    getTranscriptsByGuild,
    countTranscriptsByGuild,
    getConfig,
    setConfig,
    getAllConfig,
    getStats,
    upsertIncident,
    getIncidents,
};
