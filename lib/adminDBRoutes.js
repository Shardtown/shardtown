// Admin database browser — read/write access to all tables.
// Every route is protected by checkAdmin + CSRF on mutations.
// Table names are whitelisted against information_schema.
// Column names are validated against the real schema before use.
// Values are always parameterised — no string interpolation.

const { rateLimit } = require('express-rate-limit');

const mutateLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessaie dans une minute.' },
});

// ── helpers ──────────────────────────────────────────────────────────────────

// Strip everything that isn't [a-zA-Z0-9_] then verify the name actually
// exists in the current database (prevents SQL injection via table/col names).
async function resolveTable(db, raw) {
    const name = String(raw || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!name) return null;
    const [rows] = await db.execute(
        `SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
        [name]
    );
    return rows.length ? name : null;
}

async function getSchema(db, tableName) {
    const [cols] = await db.execute(
        `SELECT
            COLUMN_NAME     AS name,
            DATA_TYPE       AS type,
            COLUMN_TYPE     AS full_type,
            IS_NULLABLE     AS nullable,
            COLUMN_DEFAULT  AS default_val,
            COLUMN_KEY      AS key_type,
            EXTRA           AS extra,
            CHARACTER_MAXIMUM_LENGTH AS max_len
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [tableName]
    );
    return cols; // [] if table gone
}

// Return only the keys in `obj` whose names exist in `schema` cols.
function validCols(obj, schema) {
    const allowed = new Set(schema.map(c => c.name));
    return Object.keys(obj || {}).filter(k => allowed.has(k));
}

// ── mount ────────────────────────────────────────────────────────────────────

module.exports = function mountAdminDB(app, db, checkAdmin, verifyCsrf, logAdminAction) {

    // ── LIST TABLES ───────────────────────────────────────────────────────────
    app.get('/api/admin/db/tables', checkAdmin, async (req, res) => {
        try {
            const [tables] = await db.execute(
                `SELECT
                    TABLE_NAME                              AS name,
                    TABLE_ROWS                              AS approx_rows,
                    ROUND((DATA_LENGTH+INDEX_LENGTH)/1024, 1) AS size_kb,
                    TABLE_COMMENT                           AS comment
                 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE()
                 ORDER BY TABLE_NAME`
            );
            res.json(tables);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── TABLE SCHEMA ──────────────────────────────────────────────────────────
    app.get('/api/admin/db/:table/schema', checkAdmin, async (req, res) => {
        try {
            const name = await resolveTable(db, req.params.table);
            if (!name) return res.status(404).json({ error: 'Table introuvable' });
            const cols = await getSchema(db, name);
            res.json(cols);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET ROWS ──────────────────────────────────────────────────────────────
    app.get('/api/admin/db/:table/rows', checkAdmin, async (req, res) => {
        try {
            const name = await resolveTable(db, req.params.table);
            if (!name) return res.status(404).json({ error: 'Table introuvable' });

            const schema = await getSchema(db, name);
            const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
            const offset = Math.max(parseInt(req.query.offset) || 0, 0);
            const search = (req.query.search || '').trim().slice(0, 200);

            // Sort column must be in schema
            const sortRaw = String(req.query.sort || '').replace(/[^a-zA-Z0-9_]/g, '');
            const sortCol = schema.find(c => c.name === sortRaw) ? sortRaw : null;
            const dir     = req.query.dir === 'DESC' ? 'DESC' : 'ASC';

            // Search: LIKE across string cols
            let whereSQL = '';
            let whereParams = [];
            if (search) {
                const textTypes = new Set(['varchar','char','text','tinytext','mediumtext','longtext','enum','set']);
                const textCols  = schema.filter(c => textTypes.has(c.type.toLowerCase())).map(c => c.name);
                if (textCols.length) {
                    whereSQL    = 'WHERE ' + textCols.map(c => `\`${c}\` LIKE ?`).join(' OR ');
                    whereParams = textCols.map(() => `%${search}%`);
                }
            }

            const orderSQL = sortCol ? `ORDER BY \`${sortCol}\` ${dir}` : '';

            const [rows] = await db.execute(
                `SELECT * FROM \`${name}\` ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`,
                [...whereParams, limit, offset]
            );
            const [[{ total }]] = await db.execute(
                `SELECT COUNT(*) AS total FROM \`${name}\` ${whereSQL}`,
                whereParams
            );

            res.json({ rows, total, limit, offset, schema });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── INSERT ROW ────────────────────────────────────────────────────────────
    app.post('/api/admin/db/:table/row', checkAdmin, verifyCsrf, mutateLimiter, async (req, res) => {
        try {
            const name = await resolveTable(db, req.params.table);
            if (!name) return res.status(404).json({ error: 'Table introuvable' });

            const schema = await getSchema(db, name);
            const data   = req.body.data || {};

            // Exclude auto_increment cols — DB sets them
            const cols = validCols(data, schema).filter(c => {
                const def = schema.find(x => x.name === c);
                return def && def.extra !== 'auto_increment';
            });
            if (!cols.length) return res.status(400).json({ error: 'Aucun champ valide fourni' });

            const values = cols.map(c => {
                const v = data[c];
                return (v === '' || v === undefined) ? null : v;
            });

            const [result] = await db.execute(
                `INSERT INTO \`${name}\` (${cols.map(c => `\`${c}\``).join(', ')})
                 VALUES (${cols.map(() => '?').join(', ')})`,
                values
            );

            await logAdminAction(req, 'db_insert', {}, {
                table: name, insertId: result.insertId, cols
            });
            res.json({ ok: true, insertId: result.insertId });
        } catch (err) {
            console.error('[db_insert]', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ── UPDATE ROW ────────────────────────────────────────────────────────────
    // Body: { pk: {col:val,...}, set: {col:val,...} }
    app.put('/api/admin/db/:table/row', checkAdmin, verifyCsrf, mutateLimiter, async (req, res) => {
        try {
            const name = await resolveTable(db, req.params.table);
            if (!name) return res.status(404).json({ error: 'Table introuvable' });

            const schema = await getSchema(db, name);
            const { pk, set } = req.body || {};
            if (!pk || !set) return res.status(400).json({ error: 'Champs pk et set requis' });

            const setCols = validCols(set, schema);
            const pkCols  = validCols(pk,  schema);
            if (!setCols.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
            if (!pkCols.length)  return res.status(400).json({ error: 'Clé primaire invalide' });

            const setValues = setCols.map(c => (set[c] === '' ? null : set[c]));
            const pkValues  = pkCols.map(c => pk[c]);

            await db.execute(
                `UPDATE \`${name}\`
                 SET   ${setCols.map(c => `\`${c}\` = ?`).join(', ')}
                 WHERE ${pkCols.map(c =>  `\`${c}\` = ?`).join(' AND ')}`,
                [...setValues, ...pkValues]
            );

            await logAdminAction(req, 'db_update', {}, { table: name, pk, set: setCols });
            res.json({ ok: true });
        } catch (err) {
            console.error('[db_update]', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE ROW ────────────────────────────────────────────────────────────
    // Body: { pk: {col:val,...} }
    app.delete('/api/admin/db/:table/row', checkAdmin, verifyCsrf, mutateLimiter, async (req, res) => {
        try {
            const name = await resolveTable(db, req.params.table);
            if (!name) return res.status(404).json({ error: 'Table introuvable' });

            const schema = await getSchema(db, name);
            const pk     = req.body?.pk;
            if (!pk) return res.status(400).json({ error: 'Clé primaire requise' });

            const pkCols = validCols(pk, schema);
            if (!pkCols.length) return res.status(400).json({ error: 'Clé primaire invalide' });

            await db.execute(
                `DELETE FROM \`${name}\` WHERE ${pkCols.map(c => `\`${c}\` = ?`).join(' AND ')}`,
                pkCols.map(c => pk[c])
            );

            await logAdminAction(req, 'db_delete', {}, { table: name, pk });
            res.json({ ok: true });
        } catch (err) {
            console.error('[db_delete]', err.message);
            res.status(500).json({ error: err.message });
        }
    });
};
