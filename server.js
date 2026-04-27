require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('❌ SESSION_SECRET manquant ou trop court (>=32 chars requis).');
    process.exit(1);
}

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
        console.log('✅ Dashboard connecté à MySQL');

        // Migration: Ajouter les colonnes captcha si elles n'existent pas
        try {
            const [columns] = await db.execute('SHOW COLUMNS FROM settings');
            const colNames = columns.map(c => c.Field);
            
            if (!colNames.includes('captchaDigits')) {
                await db.execute('ALTER TABLE settings ADD COLUMN captchaDigits INT DEFAULT 6');
                console.log('✅ Colonne captchaDigits ajoutée');
            }
            if (!colNames.includes('captchaNoise')) {
                await db.execute('ALTER TABLE settings ADD COLUMN captchaNoise VARCHAR(10) DEFAULT "medium"');
                console.log('✅ Colonne captchaNoise ajoutée');
            }
            if (!colNames.includes('captchaAttempts')) {
                await db.execute('ALTER TABLE settings ADD COLUMN captchaAttempts INT DEFAULT 3');
                console.log('✅ Colonne captchaAttempts ajoutée');
            }
            if (!colNames.includes('verificationTimeout')) {
                await db.execute('ALTER TABLE settings ADD COLUMN verificationTimeout INT DEFAULT 15');
                console.log('✅ Colonne verificationTimeout ajoutée');
            }
            if (!colNames.includes('autoKickUnverified')) {
                await db.execute('ALTER TABLE settings ADD COLUMN autoKickUnverified VARCHAR(10) DEFAULT "false"');
                console.log('✅ Colonne autoKickUnverified ajoutée');
            }

            const modColDefs = [
                ['modRoles', 'TEXT'],
                ['bannedWords', 'TEXT'],
                ['bannedWordsEnabled', 'VARCHAR(10) DEFAULT "false"'],
                ['bannedWordsAction', 'VARCHAR(20) DEFAULT "delete"'],
                ['automodAntiSpam', 'VARCHAR(10) DEFAULT "false"'],
                ['automodSpamThreshold', 'INT DEFAULT 5'],
                ['automodSpamInterval', 'INT DEFAULT 5'],
                ['automodSpamAction', 'VARCHAR(20) DEFAULT "warn"'],
                ['automodAntiLinks', 'VARCHAR(10) DEFAULT "false"'],
                ['automodLinksAction', 'VARCHAR(20) DEFAULT "delete"'],
                ['automodAntiRaid', 'VARCHAR(10) DEFAULT "false"'],
                ['automodRaidThreshold', 'INT DEFAULT 10'],
                ['automodRaidAction', 'VARCHAR(20) DEFAULT "lockdown"'],
                ['warnMessage',      'TEXT'],
                ['muteMessage',      'TEXT'],
                ['kickMessage',      'TEXT'],
                ['banMessage',       'TEXT'],
                ['notifAutoDelete',  'VARCHAR(10) DEFAULT "true"'],
                ['notifDeleteDelay', 'INT DEFAULT 5'],
                ['automodAntiCaps',        'VARCHAR(10) DEFAULT "false"'],
                ['automodCapsThreshold',   'INT DEFAULT 70'],
                ['automodCapsAction',      'VARCHAR(20) DEFAULT "delete"'],
                ['automodSlowmodeEnabled', 'VARCHAR(10) DEFAULT "false"'],
                ['automodSlowmodeDuration','INT DEFAULT 10'],
                ['automodSlowmodeExpiry',  'INT DEFAULT 5'],
                ['warnThresholdMute', 'INT DEFAULT 0'],
                ['warnThresholdKick', 'INT DEFAULT 0'],
                ['warnThresholdBan',  'INT DEFAULT 0'],
                ['warnMuteDuration',  'INT DEFAULT 60'],
                ['isPremium',          'TINYINT(1) DEFAULT 0'],
                ['quarantineEnabled',  'TINYINT(1) DEFAULT 0'],
                ['quarantineRoleId',   'VARCHAR(255) DEFAULT ""'],
                ['quarantineDuration', 'INT DEFAULT 10'],
                ['modAlertUserId',     'VARCHAR(255) DEFAULT ""'],
                ['antiRaidEnabled',       'TINYINT(1) DEFAULT 0'],
                ['antiRaidThreshold',     'INT DEFAULT 10'],
                ['antiRaidWindow',        'INT DEFAULT 10'],
                ['panicModeActive',       'TINYINT(1) DEFAULT 0'],
                ['webhookAlertEnabled',   'TINYINT(1) DEFAULT 0'],
                ['webhookAlertChannelId', 'VARCHAR(255) DEFAULT ""'],
            ];
            for (const [col, def] of modColDefs) {
                if (!colNames.includes(col)) {
                    await db.execute(`ALTER TABLE settings ADD COLUMN ${col} ${def}`);
                    console.log(`✅ Colonne ${col} ajoutée`);
                }
            }

            // Table Audit Logs
            await db.execute(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(255),
                    userId VARCHAR(255),
                    username VARCHAR(255),
                    action VARCHAR(255),
                    details TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Table Warnings
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
            // Table Bot Stats
            await db.execute(`
                CREATE TABLE IF NOT EXISTS bot_stats (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    bot_label VARCHAR(50),
                    guild_count INT,
                    member_count INT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Table Shard Status
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
            // Table Shard Guilds
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_guilds (
                    bot_label VARCHAR(50),
                    shard_id INT,
                    guild_id VARCHAR(255),
                    guild_name VARCHAR(255),
                    PRIMARY KEY (bot_label, guild_id)
                )
            `);
            // Migration règlement par défaut
            const defaultRulesFr = JSON.stringify([
                "Respectez les [Conditions d'Utilisation](https://discord.com/terms) et les [Directives Communautaires](https://discord.com/guidelines) de Discord.",
                "Traitez tout le monde avec respect. Le harcèlement, la chasse aux sorcières, le sexisme, le racisme et les discours haineux sont strictement interdits.",
                "Aucun spam ou auto-promotion (invitations de serveur, publicités, etc.) sans autorisation. Cela inclut les messages privés aux membres.",
                "Aucun contenu réservé aux adultes ou obscène. Cela inclut textes, images ou liens présentant de la nudité, du sexe, de la violence ou tout autre contenu graphique perturbant.",
                "L'ignorance des règles n'est pas une excuse pour les enfreindre. Vous devez accepter ces règles pour obtenir un accès complet au serveur.",
                "Cliquez sur **Continuer** si vous acceptez les règles du serveur."
            ]);
            const defaultRulesEn = JSON.stringify([
                "Follow Discord's [Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines).",
                "Treat everyone with respect. Absolutely no harassment, witch hunting, sexism, racism or hate speech will be tolerated.",
                "No spam or self-promotion (server invites, advertisements, etc.) without permission. This includes DMing fellow members.",
                "No age-restricted or obscene content. This includes text, images or links featuring nudity, sex, hard violence or other disturbing graphic content.",
                "Not knowing the rules is not an excuse to break them. You must agree to these rules in order to get full access to the server.",
                "Click on **Continue** if you agree to the server rules."
            ]);
            await db.execute(
                `UPDATE settings SET rules_fr = ? WHERE rules_fr IS NULL OR rules_fr = '' OR rules_fr = '[]'`,
                [defaultRulesFr]
            );
            await db.execute(
                `UPDATE settings SET rules_en = ? WHERE rules_en IS NULL OR rules_en = '' OR rules_en = '[]'`,
                [defaultRulesEn]
            );

            await db.execute(`
                CREATE TABLE IF NOT EXISTS redeem_codes (
                    code VARCHAR(64) PRIMARY KEY,
                    max_uses INT DEFAULT 1,
                    used_count INT DEFAULT 0,
                    expires_at DATETIME DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS redeem_code_uses (
                    code VARCHAR(64) NOT NULL,
                    guildId VARCHAR(255) NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (code, guildId)
                )
            `);
            // Disable the legacy "SHARDTOWN" universal code in case it was
            // ever seeded. It used to be created with max_uses=0 (= unlimited)
            // and zero expiry, which let anyone unlock Premium for free by
            // reading the source. Force max_uses=1 and expire it 1 year ago.
            await db.execute(
                `UPDATE redeem_codes SET max_uses = 1, expires_at = '2000-01-01' WHERE code = ?`,
                ['SHARDTOWN'],
            );
            // Per-account login lockout — survives restarts unlike the
            // in-memory IP rate limiter.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS admin_login_attempts (
                    username VARCHAR(255) PRIMARY KEY,
                    failed_attempts INT NOT NULL DEFAULT 0,
                    last_failed_at DATETIME DEFAULT NULL,
                    locked_until DATETIME DEFAULT NULL
                )
            `);
            // Forensic audit trail of every admin action.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    action VARCHAR(64) NOT NULL,
                    target_guild_id VARCHAR(255) DEFAULT NULL,
                    target_bot_id VARCHAR(255) DEFAULT NULL,
                    details TEXT DEFAULT NULL,
                    ip VARCHAR(64) DEFAULT NULL,
                    user_agent VARCHAR(512) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_created (created_at),
                    INDEX idx_action (action)
                )
            `);
            // Active admin sessions (one row per logged-in browser/device).
            // The SID stays server-side; the admin UI only ever sees `id`.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sid VARCHAR(128) NOT NULL UNIQUE,
                    login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ip VARCHAR(64) DEFAULT NULL,
                    user_agent VARCHAR(512) DEFAULT NULL,
                    revoked TINYINT NOT NULL DEFAULT 0,
                    INDEX idx_revoked (revoked)
                )
            `);
        } catch (e) { console.error('Erreur migration:', e.message); }
    } catch (err) {
        console.error('❌ Erreur MySQL Dashboard:', err.message);
    }
}
console.log('Démarrage de connectDB()...');
connectDB().then(() => console.log('connectDB() terminé.'));
console.log('Chargement des routes...');

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new Strategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: ['identify', 'guilds'],
    prompt: 'consent',
    // CSRF protection: per-session OAuth state. passport-oauth2 generates a
    // random state on /login, stashes it in req.session, and verifies it on
    // /callback — defeating login-CSRF (where an attacker tricks a victim
    // into completing the OAuth dance with the attacker's `code`).
    state: true,
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);

app.set('trust proxy', 1);

function isSafeRedirect(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return false;
    try {
        const u = new URL(url, 'https://placeholder.local');
        return u.origin === 'https://placeholder.local';
    } catch { return false; }
}

function isValidSnowflake(id) {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

app.locals.safeJson = (data) =>
    JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');

app.param('guildID', (req, res, next, value) => {
    if (!isValidSnowflake(value)) return res.status(400).json({ error: 'ID de serveur invalide' });
    next();
});

app.param('userId', (req, res, next, value) => {
    if (!isValidSnowflake(value)) return res.status(400).json({ error: 'ID utilisateur invalide' });
    next();
});

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' https://cdn.discordapp.com https://cdn.tailwindcss.com data:; " +
        "connect-src 'self'; " +
        "frame-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
    );
    res.removeHeader('X-Powered-By');
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'sgid',
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Stripe webhook signature invalide:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS stripe_events_processed (
                event_id VARCHAR(255) PRIMARY KEY,
                event_type VARCHAR(100),
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const [existing] = await db.execute('SELECT event_id FROM stripe_events_processed WHERE event_id = ?', [event.id]);
        if (existing.length > 0) {
            return res.json({ received: true, duplicate: true });
        }
        await db.execute('INSERT IGNORE INTO stripe_events_processed (event_id, event_type) VALUES (?, ?)', [event.id, event.type]);
    } catch (err) {
        console.error('Erreur idempotence Stripe:', err.message);
    }

    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
        const obj = event.data.object;
        const guildId = obj.metadata?.guildId
            || obj.subscription_details?.metadata?.guildId
            || obj.lines?.data?.[0]?.metadata?.guildId;
        if (guildId && isValidSnowflake(String(guildId))) {
            try {
                await db.execute(`UPDATE settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
                await db.execute(`UPDATE shard_settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
                console.log(`✅ Premium activé via Stripe (${event.type}) pour le serveur ${guildId}`);
            } catch (err) {
                console.error('Erreur activation premium Stripe:', err.message);
            }
        }
    } else if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const guildId = sub.metadata?.guildId;
        if (guildId && isValidSnowflake(String(guildId))) {
            try {
                await db.execute(`UPDATE settings SET isPremium = 0 WHERE guildId = ?`, [guildId]);
                await db.execute(`UPDATE shard_settings SET isPremium = 0 WHERE guildId = ?`, [guildId]);
                console.log(`⛔ Premium révoqué (abonnement annulé) pour le serveur ${guildId}`);
            } catch (err) {
                console.error('Erreur révocation premium Stripe:', err.message);
            }
        }
    }
    res.json({ received: true });
});

app.use(express.json({ limit: '64kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '64kb' }));

const MAX_STRING_LEN = 4000;
function clampStrings(value, depth = 0) {
    if (depth > 10) return value;
    if (typeof value === 'string') return value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) : value;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = clampStrings(value[i], depth + 1);
        return value;
    }
    if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) value[k] = clampStrings(value[k], depth + 1);
        return value;
    }
    return value;
}
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') clampStrings(req.body);
    next();
});
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use(passport.initialize());
app.use(passport.session());

// Global CSRF guard — applies to every state-changing request that carries a
// session cookie. Skipped for safe methods, the Stripe webhook (signature-
// verified, no session), and the OAuth callback (passport state-protected).
// Individual routes used to opt in via `verifyCsrf`; this catches the ones
// that didn't.
app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.path === '/webhook/stripe') return next();
    return verifyCsrf(req, res, next);
});

// Per-session CSRF token — read by the SPA's apiPost helper before issuing
// any state-changing request. Returned as JSON regardless of auth state so
// even pre-login flows (Discord OAuth init, /admin/login form) can use it.
app.get('/api/csrf', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req) });
});

// ─── Live guild admin re-verification (H1) ───────────────────────────────
// `req.user.guilds` (and `req.session.shardUser.guilds`) is the snapshot
// captured at OAuth login and lives in the session for 24h. If a user
// loses admin perms after login they would otherwise keep dashboard access
// for the whole TTL. We re-check via the bot token (which is in the guild
// anyway) with a 60s positive cache to keep latency reasonable.
const GUILD_ADMIN_CACHE_TTL = 60 * 1000;
const guildAdminCache = new Map();

async function isGuildAdminLive(userId, guildId, botToken) {
    if (!userId || !guildId || !botToken) return false;
    const cacheKey = `${botToken.slice(-8)}:${userId}:${guildId}`;
    const now = Date.now();
    const cached = guildAdminCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < GUILD_ADMIN_CACHE_TTL) {
        return cached.isAdmin;
    }
    try {
        const [guildRes, memberRes] = await Promise.all([
            axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
                headers: { Authorization: `Bot ${botToken}` },
                timeout: 5000,
                validateStatus: s => s === 200 || s === 404,
            }),
            axios.get(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
                headers: { Authorization: `Bot ${botToken}` },
                timeout: 5000,
                validateStatus: s => s === 200 || s === 404,
            }),
        ]);
        if (guildRes.status === 404 || memberRes.status === 404) {
            guildAdminCache.set(cacheKey, { isAdmin: false, fetchedAt: now });
            return false;
        }
        if (guildRes.data.owner_id === userId) {
            guildAdminCache.set(cacheKey, { isAdmin: true, fetchedAt: now });
            return true;
        }
        const roleMap = new Map(guildRes.data.roles.map(r => [r.id, BigInt(r.permissions)]));
        let userPerms = roleMap.get(guildId) || 0n; // @everyone
        for (const roleId of memberRes.data.roles || []) {
            userPerms |= roleMap.get(roleId) || 0n;
        }
        const isAdmin = (userPerms & 0x8n) === 0x8n;
        guildAdminCache.set(cacheKey, { isAdmin, fetchedAt: now });
        return isAdmin;
    } catch {
        // Network blip — fall back to last known value if we have one,
        // otherwise deny rather than fail open.
        return cached ? cached.isAdmin : false;
    }
}

// Cleanup every 10 min so the map doesn't grow unbounded.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of guildAdminCache) {
        if (now - v.fetchedAt > GUILD_ADMIN_CACHE_TTL * 10) guildAdminCache.delete(k);
    }
}, 10 * 60 * 1000).unref?.();

function liveGuildAdminGuard(getUserId, getBotToken) {
    return async (req, res, next) => {
        const m = req.path.match(/\/guild\/(\d{17,20})(?:\/|$)/);
        if (!m) return next();
        const guildId = m[1];
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        const ok = await isGuildAdminLive(userId, guildId, getBotToken());
        if (!ok) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        // Stash for downstream use & invalidation
        req.liveGuildAdmin = { guildId, userId, verifiedAt: Date.now() };
        next();
    };
}

app.use('/shardguard', liveGuildAdminGuard(req => req.user?.id, () => process.env.DISCORD_TOKEN));
app.use('/shard', liveGuildAdminGuard(req => req.session?.shardUser?.id, () => process.env.SHARD_TOKEN));

// Migrated to React SPA — kept only as legacy fallback for the EJS template (unused once SPA catch-all is registered)
app.get('/_legacy/', async (req, res) => {
    if (!req.user) return res.render('index', { user: null, botGuildIds: [], adminGuilds: [] });
    try {
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);
        const adminGuilds = req.user.guilds
            .filter(g => (g.permissions & 0x8) === 0x8 || g.owner)
            .sort((a, b) => {
                const aIn = botGuildIds.includes(a.id);
                const bIn = botGuildIds.includes(b.id);
                if (aIn && !bIn) return -1;
                if (!aIn && bIn) return 1;
                return 0;
            });
        res.render('index', { user: req.user, botGuildIds, adminGuilds });
    } catch {
        res.render('index', { user: req.user, botGuildIds: [], adminGuilds: req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8 || g.owner) });
    }
});

// React SPA: assets are served at /assets/* (Vite output base = "/")
const SPA_DIST = path.join(__dirname, 'status-app', 'dist');
app.use('/assets', express.static(path.join(SPA_DIST, 'assets'), { maxAge: '1y', immutable: true }));

// Lightweight session info for the React app
app.get('/api/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            global_name: req.user.global_name || null,
            avatar: req.user.avatar || null,
            discriminator: req.user.discriminator || null,
        }
    });
});

// Premium data — consumed by React /premium
app.get('/api/premium', async (req, res) => {
    if (!req.user) return res.status(401).json({ adminGuilds: [] });
    try {
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);
        const adminGuilds = req.user.guilds
            .filter(g => (g.permissions & 0x8) === 0x8 || g.owner)
            .map(g => ({ id: g.id, name: g.name }))
            .sort((a, b) => {
                const aIn = botGuildIds.includes(a.id);
                const bIn = botGuildIds.includes(b.id);
                if (aIn && !bIn) return -1;
                if (!aIn && bIn) return 1;
                return 0;
            });
        res.json({ adminGuilds });
    } catch {
        const adminGuilds = req.user.guilds
            .filter(g => (g.permissions & 0x8) === 0x8 || g.owner)
            .map(g => ({ id: g.id, name: g.name }));
        res.json({ adminGuilds });
    }
});

const checkoutRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de tentatives, réessayez dans une minute.' }
});

const redeemRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de tentatives, réessayez dans 15 minutes.' }
});

app.post('/api/create-checkout', checkoutRateLimiter, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Non connecté.' });
    const { guildId, plan } = req.body;
    if (!guildId || !isValidSnowflake(String(guildId))) return res.status(400).json({ success: false, error: 'Serveur requis.' });
    const planChoice = plan === 'monthly' ? 'monthly' : 'lifetime';
    const userGuild = req.user.guilds.find(g => g.id === guildId && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Vous n\'êtes pas administrateur de ce serveur.' });
    try {
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const currency = process.env.STRIPE_CURRENCY || 'eur';
        const productId = process.env.STRIPE_PRODUCT_ID;

        const isMonthly = planChoice === 'monthly';
        const amount = isMonthly
            ? parseInt(process.env.STRIPE_MONTHLY_AMOUNT || '497')
            : parseInt(process.env.STRIPE_LIFETIME_AMOUNT || '4997');

        const priceData = {
            currency,
            product: productId,
            unit_amount: amount,
        };
        if (isMonthly) priceData.recurring = { interval: 'month' };

        const session = await stripe.checkout.sessions.create({
            mode: isMonthly ? 'subscription' : 'payment',
            line_items: [{ price_data: priceData, quantity: 1 }],
            metadata: { guildId, guildName: userGuild.name, plan: planChoice },
            ...(isMonthly ? { subscription_data: { metadata: { guildId, guildName: userGuild.name, plan: planChoice } } } : {}),
            customer_email: req.user.email || undefined,
            success_url: `${appUrl}/premium?payment=success`,
            cancel_url: `${appUrl}/premium?payment=cancelled`,
        });
        res.json({ success: true, url: session.url });
    } catch (err) {
        console.error('Erreur création session Stripe:', err.message);
        res.status(500).json({ success: false, error: 'Erreur lors de la création du paiement.' });
    }
});

app.post('/api/redeem-code', redeemRateLimiter, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Non connecté.' });
    const { code, guildId } = req.body;
    if (!code || !guildId) return res.status(400).json({ success: false, error: 'Code et serveur requis.' });
    if (typeof code !== 'string' || code.length > 64) return res.status(400).json({ success: false, error: 'Code invalide.' });
    if (!isValidSnowflake(String(guildId))) return res.status(400).json({ success: false, error: 'Serveur invalide.' });
    const userGuild = req.user.guilds.find(g => g.id === guildId && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Vous n\'êtes pas administrateur de ce serveur.' });
    const normalized = code.trim().toUpperCase();
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS redeem_codes (
                code VARCHAR(64) PRIMARY KEY,
                max_uses INT DEFAULT 1,
                used_count INT DEFAULT 0,
                expires_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS redeem_code_uses (
                code VARCHAR(64) NOT NULL,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (code, guildId)
            )
        `);
        const [codeRows] = await db.execute('SELECT * FROM redeem_codes WHERE code = ?', [normalized]);
        if (!codeRows[0]) return res.status(400).json({ success: false, error: 'Code invalide.' });
        const c = codeRows[0];
        if (c.expires_at && new Date(c.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'Code expiré.' });
        }
        if (c.max_uses > 0 && c.used_count >= c.max_uses) {
            return res.status(400).json({ success: false, error: 'Code épuisé.' });
        }
        const [alreadyUsed] = await db.execute('SELECT 1 FROM redeem_code_uses WHERE code = ? AND guildId = ?', [normalized, guildId]);
        if (alreadyUsed.length > 0) {
            return res.status(400).json({ success: false, error: 'Ce code a déjà été utilisé sur ce serveur.' });
        }
        await db.execute('INSERT INTO redeem_code_uses (code, guildId, userId) VALUES (?, ?, ?)', [normalized, guildId, req.user.id]);
        await db.execute('UPDATE redeem_codes SET used_count = used_count + 1 WHERE code = ?', [normalized]);
        await db.execute(`UPDATE settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
        await db.execute(`UPDATE shard_settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
        res.json({ success: true, message: `Premium activé sur "${userGuild.name}" ! Profitez de toutes les fonctionnalités avancées.` });
    } catch (err) {
        console.error('Erreur redeem-code:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur. Réessayez.' });
    }
});

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Trop de tentatives de connexion. Réessayez plus tard.'
});

app.get('/login', loginRateLimiter, (req, res, next) => {
    if (req.query.returnTo && isSafeRedirect(req.query.returnTo)) {
        req.session.returnTo = req.query.returnTo;
    }
    next();
}, passport.authenticate('discord'));
app.get('/callback', loginRateLimiter, passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    const returnTo = isSafeRedirect(req.session.returnTo) ? req.session.returnTo : '/shardguard/server';
    delete req.session.returnTo;
    const user = req.user;
    req.session.regenerate((err) => {
        if (err) return res.redirect('/');
        req.login(user, (err2) => {
            if (err2) return res.redirect('/');
            res.redirect(returnTo);
        });
    });
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// Migrated to React SPA
app.get('/_legacy/dashboard', (req, res) => res.render('dashboard', { user: req.user }));

app.get('/shard/login', loginRateLimiter, (req, res) => {
    if (req.session.shardUser) return res.redirect(isSafeRedirect(req.session.shardReturnTo) ? req.session.shardReturnTo : '/shard/server');
    if (isSafeRedirect(req.query.returnTo)) req.session.shardReturnTo = req.query.returnTo;
    const state = crypto.randomBytes(24).toString('hex');
    req.session.shardOAuthState = state;
    const params = new URLSearchParams({
        client_id: process.env.SHARD_CLIENT_ID,
        redirect_uri: process.env.SHARD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
        prompt: 'consent',
        state
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/shard/callback', loginRateLimiter, async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.redirect('/shard/login');
    const expectedState = req.session.shardOAuthState;
    delete req.session.shardOAuthState;
    if (!expectedState || !state || typeof state !== 'string' || !timingSafeEqual(state, expectedState)) {
        return res.redirect('/shard/login');
    }
    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.SHARD_CLIENT_ID,
                client_secret: process.env.SHARD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.SHARD_REDIRECT_URI
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token } = tokenRes.data;
        const [userRes, guildsRes] = await Promise.all([
            axios.get('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${access_token}` } }),
            axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${access_token}` } })
        ]);
        const shardUser = { ...userRes.data, guilds: guildsRes.data };
        const returnTo = isSafeRedirect(req.session.shardReturnTo) ? req.session.shardReturnTo : '/shard/server';
        delete req.session.shardReturnTo;
        req.session.regenerate((err) => {
            if (err) return res.redirect('/shard/login');
            req.session.shardUser = shardUser;
            res.redirect(returnTo);
        });
    } catch (err) {
        console.error('Shard OAuth error:', err.response?.data || err.message);
        res.redirect('/shard/login');
    }
});

app.get('/shard/logout', (req, res) => {
    delete req.session.shardUser;
    delete req.session.shardReturnTo;
    delete req.session.shardOAuthState;
    req.session.regenerate((err) => {
        if (err) console.error('Erreur régénération session shard logout:', err.message);
        res.redirect('/dashboard');
    });
});

function checkAuthShard(req, res, next) {
    if (req.session && req.session.shardUser) return next();
    req.session.shardReturnTo = req.originalUrl;
    res.redirect('/shard/login');
}

// Shard dashboard data — consumed by React /shard/server
app.get('/api/shard/server', checkAuthShard, async (req, res) => {
    const shardUser = req.session.shardUser;
    const userPayload = { id: shardUser.id, username: shardUser.username, avatar: shardUser.avatar || null };
    const adminGuilds = shardUser.guilds
        .filter(guild => (guild.permissions & 0x8) === 0x8 || guild.owner)
        .map(g => ({ id: g.id, name: g.name, icon: g.icon || null }));
    try {
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` }
        });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);
        adminGuilds.sort((a, b) => {
            const aIn = botGuildIds.includes(a.id);
            const bIn = botGuildIds.includes(b.id);
            if (aIn && !bIn) return -1;
            if (!aIn && bIn) return 1;
            return 0;
        });
        res.json({ user: userPayload, guilds: adminGuilds, botGuildIds, clientId: process.env.SHARD_CLIENT_ID || '' });
    } catch (error) {
        console.error('Erreur /api/shard/server:', error.response?.data || error.message);
        res.json({ user: userPayload, guilds: adminGuilds, botGuildIds: [], clientId: process.env.SHARD_CLIENT_ID || '' });
    }
});

// Shard guild config — consumed by React /shard/guild/:id
app.get('/api/shard/guild/:guildID', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ error: 'Accès refusé' });
    try {
        const [channelsRes, rolesRes, emojisRes] = await Promise.all([
            axios.get(`https://discord.com/api/v10/guilds/${guildID}/channels`, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` } }),
            axios.get(`https://discord.com/api/v10/guilds/${guildID}/roles`, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` } }),
            axios.get(`https://discord.com/api/v10/guilds/${guildID}/emojis`, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` } }).catch(() => ({ data: [] }))
        ]);
        const allChannels = channelsRes.data;
        const channels = allChannels.filter(c => c.type === 0).sort((a, b) => a.position - b.position);
        const voiceChannels = allChannels.filter(c => c.type === 2).sort((a, b) => a.position - b.position);
        const categories = allChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
        const roles = rolesRes.data
            .filter(r => !r.managed && r.name !== '@everyone')
            .sort((a, b) => b.position - a.position);
        const guildEmojis = emojisRes.data || [];

        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_settings (
                guildId VARCHAR(255) PRIMARY KEY,
                welcomeChannelId VARCHAR(255) DEFAULT '',
                welcomeTitle TEXT,
                welcomeMessage TEXT,
                welcomeFooter TEXT,
                welcomeColor VARCHAR(7) DEFAULT '#3b82f6',
                leaveChannelId VARCHAR(255) DEFAULT '',
                leaveTitle TEXT,
                leaveMessage TEXT,
                leaveFooter TEXT,
                leaveColor VARCHAR(7) DEFAULT '#6b7280',
                autoRoleId VARCHAR(255) DEFAULT '',
                tempVoiceTrigger VARCHAR(255) DEFAULT '',
                tempVoiceCategory VARCHAR(255) DEFAULT '',
                tempVoiceName VARCHAR(255) DEFAULT ''
            )
        `);
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN welcomeTitle TEXT`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN welcomeFooter TEXT`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN welcomeColor VARCHAR(7) DEFAULT '#3b82f6'`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN leaveTitle TEXT`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN leaveFooter TEXT`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN leaveColor VARCHAR(7) DEFAULT '#6b7280'`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN autoRoleId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN tempVoiceTrigger VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN tempVoiceCategory VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN tempVoiceName VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN autoReactions JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelsEnabled TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN xpMin INT DEFAULT 15`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN xpMax INT DEFAULT 25`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN xpCooldown INT DEFAULT 60`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelUpChannelId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelRewards JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelUpMessage VARCHAR(500) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelUpColor VARCHAR(7) DEFAULT '#3b82f6'`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN levelThresholds JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketEnabled TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketCategoryId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketSupportRoleId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketLogChannelId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketMaxPerUser INT DEFAULT 1`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketPanelChannelId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketPanelTitle VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketPanelDescription TEXT`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN ticketPanelColor VARCHAR(7) DEFAULT '#3b82f6'`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN birthdayChannelId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN birthdayMessage VARCHAR(500) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN birthdayRoleId VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN economyEnabled TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN economyCurrencyName VARCHAR(50) DEFAULT 'coins'`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN economyDailyMin INT DEFAULT 50`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN economyDailyMax INT DEFAULT 200`).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_giveaways (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                messageId VARCHAR(255) DEFAULT '',
                prize TEXT NOT NULL,
                winnersCount INT DEFAULT 1,
                endsAt DATETIME NOT NULL,
                ended TINYINT(1) DEFAULT 0,
                createdBy VARCHAR(255) DEFAULT ''
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_giveaway_entries (
                giveawayId INT NOT NULL,
                userId VARCHAR(255) NOT NULL,
                PRIMARY KEY (giveawayId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_birthdays (
                userId VARCHAR(255) NOT NULL,
                guildId VARCHAR(255) NOT NULL,
                day INT NOT NULL,
                month INT NOT NULL,
                PRIMARY KEY (guildId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_scheduled (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                intervalHours INT NOT NULL DEFAULT 24,
                nextRun DATETIME NOT NULL
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_economy (
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                balance BIGINT DEFAULT 0,
                lastDaily DATETIME DEFAULT NULL,
                PRIMARY KEY (guildId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_shop (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                roleId VARCHAR(255) NOT NULL,
                price INT NOT NULL,
                name VARCHAR(255) DEFAULT ''
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_polls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                messageId VARCHAR(255) DEFAULT '',
                question TEXT NOT NULL,
                choices JSON NOT NULL,
                endsAt DATETIME DEFAULT NULL,
                ended TINYINT(1) DEFAULT 0
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_poll_votes (
                pollId INT NOT NULL,
                userId VARCHAR(255) NOT NULL,
                choiceIndex INT NOT NULL,
                PRIMARY KEY (pollId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                status ENUM('open','closed') DEFAULT 'open',
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_levels (
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                xp BIGINT DEFAULT 0,
                level INT DEFAULT 0,
                PRIMARY KEY (guildId, userId)
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS global_blacklist (
                userId VARCHAR(255) NOT NULL PRIMARY KEY,
                reason TEXT,
                addedBy VARCHAR(255),
                addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS config_backups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                botLabel VARCHAR(50) NOT NULL,
                configJson LONGTEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guildId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                channelId VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                remindAt DATETIME NOT NULL,
                done TINYINT(1) DEFAULT 0
            )
        `).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_referrals (
                guildId VARCHAR(255) NOT NULL,
                inviterId VARCHAR(255) NOT NULL,
                inviteeId VARCHAR(255) NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guildId, inviteeId)
            )
        `).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN isPremium TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN xpRoleMultipliers JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN referralEnabled TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN referralReward INT DEFAULT 100`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN twitchAlerts JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_settings ADD COLUMN youtubeAlerts JSON`).catch(() => {});
        await db.execute(`ALTER TABLE shard_giveaways ADD COLUMN minRole VARCHAR(255) DEFAULT ''`).catch(() => {});
        await db.execute(`ALTER TABLE shard_giveaways ADD COLUMN minLevel INT DEFAULT 0`).catch(() => {});
        await db.execute(`ALTER TABLE shard_polls ADD COLUMN anonymous TINYINT(1) DEFAULT 0`).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS shard_invite_cache (
                guildId VARCHAR(255) NOT NULL,
                inviteCode VARCHAR(50) NOT NULL,
                uses INT DEFAULT 0,
                PRIMARY KEY (guildId, inviteCode)
            )
        `).catch(() => {});
        const [rows] = await db.execute('SELECT * FROM shard_settings WHERE guildId = ?', [guildID]);
        const settings = rows[0] || {
            welcomeChannelId: '', welcomeTitle: '', welcomeMessage: 'Bienvenue {user} sur **{server}** !', welcomeFooter: '', welcomeColor: '#3b82f6',
            leaveChannelId: '', leaveTitle: '', leaveMessage: '{username} a quitté **{server}**.', leaveFooter: '', leaveColor: '#6b7280',
            autoRoleId: '', tempVoiceTrigger: '', tempVoiceCategory: '', tempVoiceName: '',
            autoReactions: '[]', levelsEnabled: 0, xpMin: 15, xpMax: 25, xpCooldown: 60, levelUpChannelId: '', levelRewards: '[]',
            levelUpMessage: '', levelUpColor: '#3b82f6', levelThresholds: null,
            ticketEnabled: 0, ticketCategoryId: '', ticketSupportRoleId: '', ticketLogChannelId: '', ticketMaxPerUser: 1,
            ticketPanelChannelId: '', ticketPanelTitle: '', ticketPanelDescription: '', ticketPanelColor: '#3b82f6',
            birthdayChannelId: '', birthdayMessage: '', birthdayRoleId: '',
            economyEnabled: 0, economyCurrencyName: 'coins', economyDailyMin: 50, economyDailyMax: 200
        };
        const safeParse = (v, fb) => {
            if (v == null) return fb;
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch { return fb; }
        };
        settings.autoReactions = safeParse(settings.autoReactions, []) || [];
        if (!Array.isArray(settings.autoReactions)) settings.autoReactions = [];
        settings.autoReactions = settings.autoReactions.filter(r => r && r.text);
        settings.levelRewards = safeParse(settings.levelRewards, []) || [];
        if (!Array.isArray(settings.levelRewards)) settings.levelRewards = [];
        const defaultThresholds = [100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11500, 15000];
        settings.levelThresholds = safeParse(settings.levelThresholds, defaultThresholds);
        if (!Array.isArray(settings.levelThresholds) || !settings.levelThresholds.length) settings.levelThresholds = defaultThresholds;

        const [giveaways] = await db.execute(`SELECT * FROM shard_giveaways WHERE guildId = ? AND ended = 0 ORDER BY endsAt ASC`, [guildID]).catch(() => [[]]);
        const [scheduledAnnouncements] = await db.execute(`SELECT * FROM shard_scheduled WHERE guildId = ? ORDER BY nextRun ASC`, [guildID]).catch(() => [[]]);
        const [shopItems] = await db.execute(`SELECT * FROM shard_shop WHERE guildId = ? ORDER BY price ASC`, [guildID]).catch(() => [[]]);
        const [polls] = await db.execute(`SELECT * FROM shard_polls WHERE guildId = ? AND ended = 0 ORDER BY id DESC`, [guildID]).catch(() => [[]]);
        res.json({
            guild: { id: userGuild.id, name: userGuild.name, icon: userGuild.icon || null },
            channels: channels.map(c => ({ id: c.id, name: c.name })),
            voiceChannels: voiceChannels.map(c => ({ id: c.id, name: c.name })),
            categories: categories.map(c => ({ id: c.id, name: c.name })),
            roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color })),
            guildEmojis: guildEmojis.map(e => ({ id: e.id, name: e.name, animated: !!e.animated })),
            settings,
            giveaways,
            scheduledAnnouncements,
            shopItems,
            polls,
        });
    } catch (err) {
        console.error('Erreur /api/shard/guild/:id:', err.response?.data || err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/shard/guild/:guildID/config', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const {
        welcomeChannelId = '', welcomeTitle = '', welcomeMessage = '', welcomeFooter = '', welcomeColor = '#3b82f6',
        leaveChannelId = '', leaveTitle = '', leaveMessage = '', leaveFooter = '', leaveColor = '#6b7280',
        autoRoleId = '', tempVoiceTrigger = '', tempVoiceCategory = '', tempVoiceName = '',
        levelsEnabled, xpMin = 15, xpMax = 25, xpCooldown = 60, levelUpChannelId = '',
        levelUpMessage = '', levelUpColor = '#3b82f6', levelThresholds = '',
        ticketEnabled, ticketCategoryId = '', ticketSupportRoleId = '', ticketLogChannelId = '', ticketMaxPerUser = 1,
        ticketPanelChannelId = '', ticketPanelTitle = '', ticketPanelDescription = '', ticketPanelColor = '#3b82f6',
        birthdayChannelId = '', birthdayMessage = '', birthdayRoleId = '',
        economyEnabled, economyCurrencyName = 'coins', economyDailyMin = 50, economyDailyMax = 200,
        isPremiumS = '0',
        referralEnabled = '0',
        referralReward = 100,
        xpMultRoleId = [],
        xpMultValue = [],
    } = req.body;
    const levelsEnabledVal = levelsEnabled ? 1 : 0;
    const ticketEnabledVal = ticketEnabled ? 1 : 0;
    const economyEnabledVal = economyEnabled ? 1 : 0;
    const isPremiumSVal = parseInt(isPremiumS) || 0;
    const referralEnabledVal = parseInt(referralEnabled) || 0;
    const roleIds = Array.isArray(xpMultRoleId) ? xpMultRoleId : [xpMultRoleId].filter(Boolean);
    const multVals = Array.isArray(xpMultValue) ? xpMultValue : [xpMultValue].filter(Boolean);
    const xpMults = roleIds.map((id, i) => ({ roleId: id, multiplier: parseFloat(multVals[i]) || 1 })).filter(m => m.roleId);
    const xpRoleMultipliersJson = JSON.stringify(xpMults);
    let thresholdsJson = '[]';
    try {
        const parsed = typeof levelThresholds === 'string' ? JSON.parse(levelThresholds || '[]') : levelThresholds;
        thresholdsJson = JSON.stringify(Array.isArray(parsed) ? parsed : []);
    } catch { thresholdsJson = '[]'; }
    try {
        await db.execute(`
            INSERT INTO shard_settings (guildId, welcomeChannelId, welcomeTitle, welcomeMessage, welcomeFooter, welcomeColor, leaveChannelId, leaveTitle, leaveMessage, leaveFooter, leaveColor, autoRoleId, tempVoiceTrigger, tempVoiceCategory, tempVoiceName, levelsEnabled, xpMin, xpMax, xpCooldown, levelUpChannelId, levelUpMessage, levelUpColor, levelThresholds, ticketEnabled, ticketCategoryId, ticketSupportRoleId, ticketLogChannelId, ticketMaxPerUser, ticketPanelChannelId, ticketPanelTitle, ticketPanelDescription, ticketPanelColor, birthdayChannelId, birthdayMessage, birthdayRoleId, economyEnabled, economyCurrencyName, economyDailyMin, economyDailyMax, isPremium, referralEnabled, referralReward, xpRoleMultipliers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                welcomeChannelId = VALUES(welcomeChannelId), welcomeTitle = VALUES(welcomeTitle),
                welcomeMessage = VALUES(welcomeMessage), welcomeFooter = VALUES(welcomeFooter),
                welcomeColor = VALUES(welcomeColor), leaveChannelId = VALUES(leaveChannelId),
                leaveTitle = VALUES(leaveTitle), leaveMessage = VALUES(leaveMessage),
                leaveFooter = VALUES(leaveFooter), leaveColor = VALUES(leaveColor),
                autoRoleId = VALUES(autoRoleId), tempVoiceTrigger = VALUES(tempVoiceTrigger),
                tempVoiceCategory = VALUES(tempVoiceCategory), tempVoiceName = VALUES(tempVoiceName),
                levelsEnabled = VALUES(levelsEnabled), xpMin = VALUES(xpMin),
                xpMax = VALUES(xpMax), xpCooldown = VALUES(xpCooldown),
                levelUpChannelId = VALUES(levelUpChannelId), levelUpMessage = VALUES(levelUpMessage),
                levelUpColor = VALUES(levelUpColor), levelThresholds = VALUES(levelThresholds),
                ticketEnabled = VALUES(ticketEnabled), ticketCategoryId = VALUES(ticketCategoryId),
                ticketSupportRoleId = VALUES(ticketSupportRoleId), ticketLogChannelId = VALUES(ticketLogChannelId),
                ticketMaxPerUser = VALUES(ticketMaxPerUser), ticketPanelChannelId = VALUES(ticketPanelChannelId),
                ticketPanelTitle = VALUES(ticketPanelTitle), ticketPanelDescription = VALUES(ticketPanelDescription),
                ticketPanelColor = VALUES(ticketPanelColor), birthdayChannelId = VALUES(birthdayChannelId),
                birthdayMessage = VALUES(birthdayMessage), birthdayRoleId = VALUES(birthdayRoleId),
                economyEnabled = VALUES(economyEnabled), economyCurrencyName = VALUES(economyCurrencyName),
                economyDailyMin = VALUES(economyDailyMin), economyDailyMax = VALUES(economyDailyMax),
                isPremium = VALUES(isPremium), referralEnabled = VALUES(referralEnabled),
                referralReward = VALUES(referralReward), xpRoleMultipliers = VALUES(xpRoleMultipliers)
        `, [guildID, welcomeChannelId, welcomeTitle, welcomeMessage, welcomeFooter, welcomeColor, leaveChannelId, leaveTitle, leaveMessage, leaveFooter, leaveColor, autoRoleId, tempVoiceTrigger, tempVoiceCategory, tempVoiceName, levelsEnabledVal, xpMin, xpMax, xpCooldown, levelUpChannelId, levelUpMessage, levelUpColor, thresholdsJson, ticketEnabledVal, ticketCategoryId, ticketSupportRoleId, ticketLogChannelId, ticketMaxPerUser, ticketPanelChannelId, ticketPanelTitle, ticketPanelDescription, ticketPanelColor, birthdayChannelId, birthdayMessage, birthdayRoleId, economyEnabledVal, economyCurrencyName, economyDailyMin, economyDailyMax, isPremiumSVal, referralEnabledVal, parseInt(referralReward) || 100, xpRoleMultipliersJson]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur save shard config:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/shard/guild/:guildID/ticket-panel', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, title, description, color } = req.body;
    if (!channelId || !/^\d{17,20}$/.test(String(channelId))) return res.status(400).json({ success: false, error: 'Salon invalide' });
    const colorInt = parseInt(String(color || '#3b82f6').replace('#', ''), 16) || 0x3b82f6;
    const embed = { color: colorInt, timestamp: new Date().toISOString() };
    if (title) embed.title = title;
    if (description) embed.description = description;
    const payload = {
        embeds: [embed],
        components: [{
            type: 1,
            components: [{
                type: 2,
                style: 1,
                label: 'Ouvrir un ticket',
                emoji: { name: '🎫' },
                custom_id: 'ticket_open'
            }]
        }]
    };
    try {
        await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
    }
});

app.post('/shard/guild/:guildID/poll', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, question, choices, endsAt, pollAnonymous = '0' } = req.body;
    if (!channelId || !question || !Array.isArray(choices) || choices.length < 2) return res.status(400).json({ success: false, error: 'Données manquantes' });
    const anonymousVal = parseInt(pollAnonymous) || 0;
    const EMOJIS = ['🔵', '🟢', '🟡', '🟠', '🔴'];
    const buttons = choices.slice(0, 5).map((c, i) => ({ type: 2, style: 2, label: c.slice(0, 80), emoji: { name: EMOJIS[i] }, custom_id: `poll_vote_${i}` }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
    const endsAtDate = endsAt ? new Date(endsAt) : null;
    const embed = {
        color: 0x3b82f6,
        title: `📊 ${question}`,
        description: choices.map((c, i) => `${EMOJIS[i]} **${c}**`).join('\n'),
        footer: { text: endsAtDate ? `Se termine le ${endsAtDate.toLocaleString('fr-FR')}` : 'Cliquez pour voter' },
        timestamp: new Date().toISOString()
    };
    try {
        const msgRes = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { embeds: [embed], components: rows }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
        const messageId = msgRes.data.id;
        const [result] = await db.execute(`INSERT INTO shard_polls (guildId, channelId, messageId, question, choices, endsAt, anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)`, [guildID, channelId, messageId, question, JSON.stringify(choices), endsAtDate || null, anonymousVal]);
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || err.message }); }
});

app.post('/shard/guild/:guildID/poll/:pollId/end', checkAuthShard, async (req, res) => {
    const { guildID, pollId } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const [rows] = await db.execute(`SELECT * FROM shard_polls WHERE id = ? AND guildId = ?`, [pollId, guildID]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Sondage introuvable' });
    const poll = rows[0];
    const choices = typeof poll.choices === 'string' ? JSON.parse(poll.choices) : poll.choices;
    const EMOJIS = ['🔵', '🟢', '🟡', '🟠', '🔴'];
    const [votes] = await db.execute(`SELECT choiceIndex, COUNT(*) as count FROM shard_poll_votes WHERE pollId = ? GROUP BY choiceIndex ORDER BY choiceIndex`, [pollId]);
    const total = votes.reduce((s, v) => s + v.count, 0);
    await db.execute(`UPDATE shard_polls SET ended = 1 WHERE id = ?`, [pollId]);
    const results = choices.map((c, i) => { const v = votes.find(v => v.choiceIndex === i); return { choice: c, count: v ? v.count : 0 }; });
    const resultsDesc = results.map((r, i) => {
        const pct = total ? Math.round(r.count / total * 100) : 0;
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        return `${EMOJIS[i]} **${r.choice}**\n\`${bar}\` ${pct}% (${r.count} vote${r.count !== 1 ? 's' : ''})`;
    }).join('\n\n');
    try {
        await axios.patch(`https://discord.com/api/v10/channels/${poll.channelId}/messages/${poll.messageId}`, {
            embeds: [{ color: 0x6b7280, title: `📊 ${poll.question} — Résultats`, description: resultsDesc || 'Aucun vote.', footer: { text: `${total} vote(s) au total` }, timestamp: new Date().toISOString() }],
            components: [{ type: 1, components: choices.slice(0, 5).map((c, i) => ({ type: 2, style: 2, label: c.slice(0, 80), emoji: { name: EMOJIS[i] }, custom_id: `poll_ended_${i}`, disabled: true })) }]
        }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
    } catch {}
    res.json({ success: true, results });
});

app.post('/shard/guild/:guildID/giveaway', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, prize, winnersCount = 1, endsAt, gwMinRole = '', gwMinLevel = 0 } = req.body;
    if (!channelId || !prize || !endsAt) return res.status(400).json({ success: false, error: 'Données manquantes' });
    const colorInt = 0xf59e0b;
    const endsAtDate = new Date(endsAt);
    const embed = {
        color: colorInt,
        title: '🎉 GIVEAWAY',
        description: `**${prize}**\n\nCliquez sur le bouton ci-dessous pour participer !\n\n⏰ Se termine le <t:${Math.floor(endsAtDate.getTime() / 1000)}:F>`,
        footer: { text: `${winnersCount} gagnant(s)` },
        timestamp: new Date().toISOString()
    };
    try {
        const msgRes = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            embeds: [embed],
            components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Participer 🎉', custom_id: 'giveaway_enter' }] }]
        }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
        const messageId = msgRes.data.id;
        const [result] = await db.execute(
            `INSERT INTO shard_giveaways (guildId, channelId, messageId, prize, winnersCount, endsAt, createdBy, minRole, minLevel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [guildID, channelId, messageId, prize, winnersCount, endsAtDate, shardUser.id, gwMinRole || '', parseInt(gwMinLevel) || 0]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || err.message }); }
});

app.post('/shard/guild/:guildID/giveaway/:gwId/end', checkAuthShard, async (req, res) => {
    const { guildID, gwId } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const [rows] = await db.execute(`SELECT * FROM shard_giveaways WHERE id = ? AND guildId = ?`, [gwId, guildID]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Giveaway introuvable' });
    const gw = rows[0];
    const [entries] = await db.execute(`SELECT userId FROM shard_giveaway_entries WHERE giveawayId = ?`, [gwId]);
    const shuffled = entries.sort(() => Math.random() - 0.5);
    const winnerIds = shuffled.slice(0, gw.winnersCount).map(e => e.userId);
    const winnersText = winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'Aucun participant';
    await db.execute(`UPDATE shard_giveaways SET ended = 1 WHERE id = ?`, [gwId]);
    try {
        await axios.patch(`https://discord.com/api/v10/channels/${gw.channelId}/messages/${gw.messageId}`, {
            embeds: [{ color: 0x6b7280, title: '🎉 GIVEAWAY TERMINÉ', description: `**${gw.prize}**\n\n🏆 Gagnant(s) : ${winnersText}`, footer: { text: `${gw.winnersCount} gagnant(s)` }, timestamp: new Date().toISOString() }],
            components: [{ type: 1, components: [{ type: 2, style: 2, label: 'Terminé', custom_id: 'giveaway_ended', disabled: true }] }]
        }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
        if (winnerIds.length) {
            await axios.post(`https://discord.com/api/v10/channels/${gw.channelId}/messages`, {
                content: `🎊 Félicitations ${winnersText} ! Vous avez gagné **${gw.prize}** !`
            }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
        }
    } catch {}
    res.json({ success: true, winners: winnerIds.map(id => `<@${id}>`) });
});

app.post('/shard/guild/:guildID/scheduled', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, message, intervalHours, nextRun } = req.body;
    if (!channelId || !message || !intervalHours || !nextRun) return res.status(400).json({ success: false, error: 'Données manquantes' });
    try {
        const [result] = await db.execute(
            `INSERT INTO shard_scheduled (guildId, channelId, message, intervalHours, nextRun) VALUES (?, ?, ?, ?, ?)`,
            [guildID, channelId, message, intervalHours, new Date(nextRun)]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/shard/guild/:guildID/scheduled/:id', checkAuthShard, async (req, res) => {
    const { guildID, id } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_scheduled WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/guild/:guildID/backup', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const user = req.user;
    const userGuild = user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [rows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        if (!rows[0]?.isPremium) return res.status(403).json({ success: false, error: 'Premium requis' });
        const configJson = JSON.stringify(rows[0]);
        await db.execute(`INSERT INTO config_backups (guildId, botLabel, configJson) VALUES (?, ?, ?)`, [guildID, 'ShardGuard', configJson]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/guild/:guildID/restore', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const user = req.user;
    const userGuild = user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [rows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        if (!rows[0]?.isPremium) return res.status(403).json({ success: false, error: 'Premium requis' });
        const [backups] = await db.execute(`SELECT * FROM config_backups WHERE guildId = ? AND botLabel = 'ShardGuard' ORDER BY createdAt DESC LIMIT 1`, [guildID]);
        if (!backups[0]) return res.status(404).json({ success: false, error: 'Aucun backup trouvé' });
        const config = JSON.parse(backups[0].configJson);
        delete config.id; delete config.guildId;
        const cols = Object.keys(config).map(k => `${k} = ?`).join(', ');
        const vals = Object.values(config);
        await db.execute(`UPDATE settings SET ${cols} WHERE guildId = ?`, [...vals, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/backup', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [rows] = await db.execute('SELECT * FROM shard_settings WHERE guildId = ?', [guildID]);
        if (!rows[0]?.isPremium) return res.status(403).json({ success: false, error: 'Premium requis' });
        const configJson = JSON.stringify(rows[0]);
        await db.execute(`INSERT INTO config_backups (guildId, botLabel, configJson) VALUES (?, ?, ?)`, [guildID, 'Shard', configJson]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/restore', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [rows] = await db.execute('SELECT * FROM shard_settings WHERE guildId = ?', [guildID]);
        if (!rows[0]?.isPremium) return res.status(403).json({ success: false, error: 'Premium requis' });
        const [backups] = await db.execute(`SELECT * FROM config_backups WHERE guildId = ? AND botLabel = 'Shard' ORDER BY createdAt DESC LIMIT 1`, [guildID]);
        if (!backups[0]) return res.status(404).json({ success: false, error: 'Aucun backup trouvé' });
        const config = JSON.parse(backups[0].configJson);
        delete config.guildId;
        const cols = Object.keys(config).map(k => `${k} = ?`).join(', ');
        const vals = Object.values(config);
        await db.execute(`UPDATE shard_settings SET ${cols} WHERE guildId = ?`, [...vals, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/shop', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { roleId, price } = req.body;
    if (!roleId || !price) return res.status(400).json({ success: false, error: 'Données manquantes' });
    try {
        const [result] = await db.execute(`INSERT INTO shard_shop (guildId, roleId, price) VALUES (?, ?, ?)`, [guildID, roleId, price]);
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/shard/guild/:guildID/shop/:id', checkAuthShard, async (req, res) => {
    const { guildID, id } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_shop WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/send-embed', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, title, description, footer, color, image } = req.body;
    if (!channelId || !/^\d{17,20}$/.test(String(channelId))) return res.status(400).json({ success: false, error: 'Salon invalide' });
    const colorInt = parseInt(String(color || '#3b82f6').replace('#', ''), 16) || 0x3b82f6;
    const embed = { color: colorInt, timestamp: new Date().toISOString() };
    if (title) embed.title = title;
    if (description) embed.description = description;
    if (footer) embed.footer = { text: footer };
    if (image && image.startsWith('http')) embed.image = { url: image };
    try {
        await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { embeds: [embed] }, { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || err.message }); }
});

app.post('/shard/guild/:guildID/reactions', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { autoReactions } = req.body;
    try {
        await db.execute(`INSERT INTO shard_settings (guildId, autoReactions) VALUES (?, ?) ON DUPLICATE KEY UPDATE autoReactions = VALUES(autoReactions)`,
            [guildID, JSON.stringify(autoReactions || [])]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/rewards', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { levelRewards } = req.body;
    try {
        await db.execute(`INSERT INTO shard_settings (guildId, levelRewards) VALUES (?, ?) ON DUPLICATE KEY UPDATE levelRewards = VALUES(levelRewards)`,
            [guildID, JSON.stringify(levelRewards || [])]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shard/guild/:guildID/test', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    const { type, channelId, message, title, footer, color } = req.body;
    const cleanChannelId = String(channelId || '').trim();
    const cleanMessage = String(message || '').trim();

    if (!cleanChannelId || !/^\d{17,20}$/.test(cleanChannelId))
        return res.status(400).json({ success: false, error: 'Salon invalide ou non sélectionné' });
    if (!cleanMessage)
        return res.status(400).json({ success: false, error: 'Message vide' });

    function fmt(str) {
        return String(str || '')
            .replace(/{user}/g, `<@${shardUser.id}>`)
            .replace(/{username}/g, shardUser.username || 'Utilisateur')
            .replace(/{server}/g, userGuild.name || 'Serveur')
            .replace(/{memberCount}/g, '?');
    }

    const hexColor = String(color || (type === 'welcome' ? '#3b82f6' : '#6b7280')).trim();
    const colorInt = parseInt(hexColor.replace('#', ''), 16) || 0x3b82f6;

    const embed = {
        color: colorInt,
        description: fmt(cleanMessage) || undefined,
        timestamp: new Date().toISOString()
    };
    const cleanTitle = fmt(title);
    if (cleanTitle) embed.title = cleanTitle;
    const cleanFooter = fmt(footer);
    if (cleanFooter) embed.footer = { text: cleanFooter };

    try {
        await axios.post(`https://discord.com/api/v10/channels/${cleanChannelId}/messages`,
            { embeds: [embed] },
            { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        res.json({ success: true });
    } catch (err) {
        const discordErr = err.response?.data;
        console.error('Erreur test shard:', discordErr || err.message);
        res.status(500).json({ success: false, error: discordErr?.message || err.message });
    }
});

// ShardGuard dashboard data — consumed by React /shardguard/server
app.get('/api/shardguard/server', checkAuth, async (req, res) => {
    const userPayload = { id: req.user.id, username: req.user.username, avatar: req.user.avatar || null };
    const adminGuilds = req.user.guilds
        .filter(guild => (guild.permissions & 0x8) === 0x8 || guild.owner)
        .map(g => ({ id: g.id, name: g.name, icon: g.icon || null }));
    try {
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);
        adminGuilds.sort((a, b) => {
            const aIn = botGuildIds.includes(a.id);
            const bIn = botGuildIds.includes(b.id);
            if (aIn && !bIn) return -1;
            if (!aIn && bIn) return 1;
            return 0;
        });
        res.json({ user: userPayload, guilds: adminGuilds, botGuildIds, clientId: process.env.CLIENT_ID || '' });
    } catch (error) {
        console.error('Erreur /api/shardguard/server:', error.response?.data || error.message);
        res.json({ user: userPayload, guilds: adminGuilds, botGuildIds: [], clientId: process.env.CLIENT_ID || '' });
    }
});

app.get('/guild/:guildID', (req, res) => res.redirect(301, `/shardguard/guild/${req.params.guildID}`));

// ShardGuard guild config — consumed by React /shardguard/guild/:id
app.get('/api/shardguard/guild/:guildID', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ error: 'Accès refusé' });

    try {
        const response = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/roles`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const roles = response.data.sort((a, b) => b.position - a.position);
        
        // Récupérer les infos de la guilde via le bot pour les stats et salons
        const guildResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildID}?with_counts=true`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const guildData = guildResponse.data;

        // Récupérer les salons de la guilde
        const channelsResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/channels`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const channels = channelsResponse.data.filter(c => c.type === 0); // Uniquement les salons textuels

        // Récupérer les settings depuis MySQL
        const [settingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const settings = settingsRows[0] || { 
            language: 'fr', 
            verifiedRole: '', 
            rules_fr: '', 
            rules_en: '', 
            serverLocked: 'false', 
            accessCode: '',
            verificationChannelId: '',
            accessCodeChannelId: '',
            modRoles: '[]',
            bannedWords: '[]',
            bannedWordsEnabled: 'false',
            bannedWordsAction: 'delete',
            automodAntiSpam: 'false',
            automodSpamThreshold: 5,
            automodSpamInterval: 5,
            automodSpamAction: 'warn',
            automodAntiLinks: 'false',
            automodLinksAction: 'delete',
            automodAntiRaid: 'false',
            automodRaidThreshold: 10,
            automodRaidAction: 'lockdown',
        };
        if (!settings.modRoles) settings.modRoles = '[]';
        if (!settings.bannedWords) settings.bannedWords = '[]';
        if (!settings.bannedWordsEnabled) settings.bannedWordsEnabled = 'false';
        if (!settings.bannedWordsAction) settings.bannedWordsAction = 'delete';
        if (!settings.automodAntiSpam) settings.automodAntiSpam = 'false';
        if (settings.automodSpamThreshold == null) settings.automodSpamThreshold = 5;
        if (settings.automodSpamInterval == null) settings.automodSpamInterval = 5;
        if (!settings.automodSpamAction) settings.automodSpamAction = 'warn';
        if (!settings.automodAntiLinks) settings.automodAntiLinks = 'false';
        if (!settings.automodLinksAction) settings.automodLinksAction = 'delete';
        if (!settings.automodAntiRaid) settings.automodAntiRaid = 'false';
        if (settings.automodRaidThreshold == null) settings.automodRaidThreshold = 10;
        if (!settings.automodRaidAction) settings.automodRaidAction = 'lockdown';
        if (!settings.warnMessage)      settings.warnMessage      = '';
        if (!settings.muteMessage)      settings.muteMessage      = '';
        if (!settings.kickMessage)      settings.kickMessage      = '';
        if (!settings.banMessage)       settings.banMessage       = '';
        if (settings.notifAutoDelete == null) settings.notifAutoDelete = 'true';
        if (settings.notifDeleteDelay  == null) settings.notifDeleteDelay  = 5;
        if (!settings.automodAntiCaps) settings.automodAntiCaps = 'false';
        if (settings.automodCapsThreshold == null) settings.automodCapsThreshold = 70;
        if (!settings.automodCapsAction) settings.automodCapsAction = 'delete';
        if (!settings.automodSlowmodeEnabled) settings.automodSlowmodeEnabled = 'false';
        if (settings.automodSlowmodeDuration == null) settings.automodSlowmodeDuration = 10;
        if (settings.automodSlowmodeExpiry == null) settings.automodSlowmodeExpiry = 5;
        if (settings.warnThresholdMute == null) settings.warnThresholdMute = 0;
        if (settings.warnThresholdKick == null) settings.warnThresholdKick = 0;
        if (settings.warnThresholdBan  == null) settings.warnThresholdBan  = 0;
        if (settings.warnMuteDuration  == null) settings.warnMuteDuration  = 60;
        
        // Récupérer les logs depuis MySQL
        const [logsRows] = await db.execute('SELECT * FROM logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT 50', [guildID]);

        // Compter les vérifications réussies uniques dans les logs
        const [verifiedCountRow] = await db.execute('SELECT COUNT(DISTINCT userId) as count FROM logs WHERE guildId = ? AND status = "Success"', [guildID]);
        const verifiedCount = verifiedCountRow[0].count;

        // Récupérer les stats journalières pour les courbes (14 derniers jours)
        const [dailyStatsRows] = await db.execute(`
            SELECT DATE(timestamp) as date, status, COUNT(*) as count 
            FROM logs 
            WHERE guildId = ? AND timestamp >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) 
            GROUP BY DATE(timestamp), status
            ORDER BY date ASC
        `, [guildID]);

        // Formater les stats pour Chart.js
        const statsByDay = {};
        dailyStatsRows.forEach(row => {
            const dateStr = new Date(row.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            if (!statsByDay[dateStr]) statsByDay[dateStr] = { join: 0, leave: 0, success: 0, failed: 0 };
            
            const status = row.status.toLowerCase();
            if (status === 'join') statsByDay[dateStr].join = row.count;
            else if (status === 'leave') statsByDay[dateStr].leave = row.count;
            else if (status.includes('success')) statsByDay[dateStr].success = row.count;
            else if (status.includes('fail')) statsByDay[dateStr].failed = row.count;
        });

        // Logs d'audit
        const [auditLogsRows] = await db.execute('SELECT * FROM audit_logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT 20', [guildID]);

        res.json({
            guild: { id: userGuild.id, name: userGuild.name, icon: userGuild.icon || null },
            roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color })),
            channels: channels.map(c => ({ id: c.id, name: c.name })),
            settings,
            logs: logsRows,
            auditLogs: auditLogsRows,
            chartData: statsByDay,
            stats: {
                totalMembers: guildData.approximate_member_count || 0,
                verifiedCount,
            },
        });
    } catch (error) {
        console.error('Erreur /api/shardguard/guild/:id:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/guild/:guildID/config', (req, res) => res.redirect(301, `/shardguard/guild/${req.params.guildID}/config`));

app.post('/shardguard/guild/:guildID/config', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    let { 
        language = 'fr', 
        verifiedRole = '', 
        rules_fr = [], 
        rules_en = [], 
        serverLocked = 'false', 
        accessCode = '', 
        verificationChannelId = '', 
        accessCodeChannelId = '',
        captchaDigits = 6,
        captchaNoise = 'medium',
        captchaAttempts = 3,
        verificationTimeout = 15,
        autoKickUnverified = 'false',
        modRoles = '[]',
        bannedWords = [],
        bannedWordsEnabled = 'false',
        bannedWordsAction = 'delete',
        automodAntiSpam = 'false',
        automodSpamThreshold = 5,
        automodSpamInterval = 5,
        automodSpamAction = 'warn',
        automodAntiLinks = 'false',
        automodLinksAction = 'delete',
        automodAntiRaid = 'false',
        automodRaidThreshold = 10,
        automodRaidAction = 'lockdown',
        warnMessage = '',
        muteMessage = '',
        kickMessage = '',
        banMessage  = '',
        notifAutoDelete  = 'true',
        notifDeleteDelay = 5,
        automodAntiCaps = 'false',
        automodCapsThreshold = 70,
        automodCapsAction = 'delete',
        automodSlowmodeEnabled = 'false',
        automodSlowmodeDuration = 10,
        automodSlowmodeExpiry = 5,
        warnThresholdMute = 0,
        warnThresholdKick = 0,
        warnThresholdBan  = 0,
        warnMuteDuration  = 60,
        isPremiumSG = '0',
        antiRaidEnabled = '0',
        antiRaidThreshold = 10,
        antiRaidWindow = 10,
        quarantineEnabled = '0',
        quarantineRoleId = '',
        quarantineDuration = 10,
        modAlertUserId = '',
        webhookAlertEnabled = '0',
        webhookAlertChannelId = '',
    } = req.body;

    // Convertir les règles en JSON pour la DB si ce sont des tableaux
    const rulesFrJson = Array.isArray(rules_fr) ? JSON.stringify(rules_fr.filter(r => r.trim())) : rules_fr;
    const rulesEnJson = Array.isArray(rules_en) ? JSON.stringify(rules_en.filter(r => r.trim())) : rules_en;
    const bannedWordsJson = Array.isArray(bannedWords) ? JSON.stringify(bannedWords.filter(w => w.trim())) : bannedWords;
    let modRolesJson;
    try { modRolesJson = JSON.stringify(JSON.parse(modRoles)); } catch { modRolesJson = '[]'; }

    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).send('Accès refusé');

    try {
        // Récupérer l'ancienne configuration pour comparer
        const [oldSettingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const oldSettings = oldSettingsRows[0] || {};

        await db.execute(`
            INSERT INTO settings (guildId, language, verifiedRole, rules_fr, rules_en, serverLocked, accessCode, verificationChannelId, accessCodeChannelId, captchaDigits, captchaNoise, captchaAttempts, verificationTimeout, autoKickUnverified, modRoles, bannedWords, bannedWordsEnabled, bannedWordsAction, automodAntiSpam, automodSpamThreshold, automodSpamInterval, automodSpamAction, automodAntiLinks, automodLinksAction, automodAntiRaid, automodRaidThreshold, automodRaidAction, warnMessage, muteMessage, kickMessage, banMessage, notifAutoDelete, notifDeleteDelay, automodAntiCaps, automodCapsThreshold, automodCapsAction, automodSlowmodeEnabled, automodSlowmodeDuration, automodSlowmodeExpiry, warnThresholdMute, warnThresholdKick, warnThresholdBan, warnMuteDuration, isPremium, antiRaidEnabled, antiRaidThreshold, antiRaidWindow, quarantineEnabled, quarantineRoleId, quarantineDuration, modAlertUserId, webhookAlertEnabled, webhookAlertChannelId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            language = VALUES(language),
            verifiedRole = VALUES(verifiedRole),
            rules_fr = VALUES(rules_fr),
            rules_en = VALUES(rules_en),
            serverLocked = VALUES(serverLocked),
            accessCode = VALUES(accessCode),
            verificationChannelId = VALUES(verificationChannelId),
            accessCodeChannelId = VALUES(accessCodeChannelId),
            captchaDigits = VALUES(captchaDigits),
            captchaNoise = VALUES(captchaNoise),
            captchaAttempts = VALUES(captchaAttempts),
            verificationTimeout = VALUES(verificationTimeout),
            autoKickUnverified = VALUES(autoKickUnverified),
            modRoles = VALUES(modRoles),
            bannedWords = VALUES(bannedWords),
            bannedWordsEnabled = VALUES(bannedWordsEnabled),
            bannedWordsAction = VALUES(bannedWordsAction),
            automodAntiSpam = VALUES(automodAntiSpam),
            automodSpamThreshold = VALUES(automodSpamThreshold),
            automodSpamInterval = VALUES(automodSpamInterval),
            automodSpamAction = VALUES(automodSpamAction),
            automodAntiLinks = VALUES(automodAntiLinks),
            automodLinksAction = VALUES(automodLinksAction),
            automodAntiRaid = VALUES(automodAntiRaid),
            automodRaidThreshold = VALUES(automodRaidThreshold),
            automodRaidAction = VALUES(automodRaidAction),
            warnMessage = VALUES(warnMessage),
            muteMessage = VALUES(muteMessage),
            kickMessage = VALUES(kickMessage),
            banMessage = VALUES(banMessage),
            notifAutoDelete = VALUES(notifAutoDelete),
            notifDeleteDelay = VALUES(notifDeleteDelay),
            automodAntiCaps = VALUES(automodAntiCaps),
            automodCapsThreshold = VALUES(automodCapsThreshold),
            automodCapsAction = VALUES(automodCapsAction),
            automodSlowmodeEnabled = VALUES(automodSlowmodeEnabled),
            automodSlowmodeDuration = VALUES(automodSlowmodeDuration),
            automodSlowmodeExpiry = VALUES(automodSlowmodeExpiry),
            warnThresholdMute = VALUES(warnThresholdMute),
            warnThresholdKick = VALUES(warnThresholdKick),
            warnThresholdBan = VALUES(warnThresholdBan),
            warnMuteDuration = VALUES(warnMuteDuration),
            isPremium = VALUES(isPremium),
            antiRaidEnabled = VALUES(antiRaidEnabled),
            antiRaidThreshold = VALUES(antiRaidThreshold),
            antiRaidWindow = VALUES(antiRaidWindow),
            quarantineEnabled = VALUES(quarantineEnabled),
            quarantineRoleId = VALUES(quarantineRoleId),
            quarantineDuration = VALUES(quarantineDuration),
            modAlertUserId = VALUES(modAlertUserId),
            webhookAlertEnabled = VALUES(webhookAlertEnabled),
            webhookAlertChannelId = VALUES(webhookAlertChannelId)
        `, [
            guildID, 
            language, 
            verifiedRole, 
            rulesFrJson, 
            rulesEnJson, 
            serverLocked, 
            accessCode, 
            verificationChannelId, 
            accessCodeChannelId || null,
            parseInt(captchaDigits),
            captchaNoise,
            parseInt(captchaAttempts),
            parseInt(verificationTimeout),
            autoKickUnverified,
            modRolesJson,
            bannedWordsJson,
            bannedWordsEnabled,
            bannedWordsAction,
            automodAntiSpam,
            parseInt(automodSpamThreshold) || 5,
            parseInt(automodSpamInterval) || 5,
            automodSpamAction,
            automodAntiLinks,
            automodLinksAction,
            automodAntiRaid,
            parseInt(automodRaidThreshold) || 10,
            automodRaidAction,
            warnMessage  || null,
            muteMessage  || null,
            kickMessage  || null,
            banMessage   || null,
            notifAutoDelete,
            parseInt(notifDeleteDelay) || 5,
            automodAntiCaps,
            parseInt(automodCapsThreshold) || 70,
            automodCapsAction,
            automodSlowmodeEnabled,
            parseInt(automodSlowmodeDuration) || 10,
            parseInt(automodSlowmodeExpiry) || 5,
            parseInt(warnThresholdMute) || 0,
            parseInt(warnThresholdKick) || 0,
            parseInt(warnThresholdBan)  || 0,
            parseInt(warnMuteDuration)  || 60,
            parseInt(isPremiumSG) || 0,
            parseInt(antiRaidEnabled) || 0,
            parseInt(antiRaidThreshold) || 10,
            parseInt(antiRaidWindow) || 10,
            parseInt(quarantineEnabled) || 0,
            quarantineRoleId || '',
            parseInt(quarantineDuration) || 10,
            modAlertUserId || '',
            parseInt(webhookAlertEnabled) || 0,
            webhookAlertChannelId || '',
        ]);
        
        // Déterminer ce qui a changé pour le log
        const changes = [];
        const mapping = {
            'language': 'Langue',
            'verifiedRole': 'Rôle de vérification',
            'serverLocked': 'Verrouillage serveur',
            'accessCode': 'Code d\'accès',
            'verificationChannelId': 'Salon de vérification',
            'captchaDigits': 'Nombre de chiffres',
            'captchaNoise': 'Bruit captcha',
            'captchaAttempts': 'Nombre d\'essais',
            'verificationTimeout': 'Temps limite',
            'autoKickUnverified': 'Auto-Kick (Zone Danger)'
        };

        for (const [key, label] of Object.entries(mapping)) {
            const newValue = req.body[key];
            const oldValue = oldSettings[key];
            if (newValue !== undefined && String(newValue) !== String(oldValue)) {
                changes.push(`${label} : ${oldValue || 'Aucun'} ➔ ${newValue}`);
            }
        }

        // Cas spécial pour les règles
        if (rulesFrJson !== oldSettings.rules_fr || rulesEnJson !== oldSettings.rules_en) {
            changes.push('Règlement');
        }

        // Enregistrer chaque changement comme une action distincte
        for (const change of changes) {
            const [label, values] = change.split(' : ');
            await db.execute(`
                INSERT INTO audit_logs (guildId, userId, username, action, details)
                VALUES (?, ?, ?, ?, ?)
            `, [guildID, req.user.id, req.user.username, `Modification : ${label}`, values || change]);
        }

        if (changes.length === 0) {
            await db.execute(`
                INSERT INTO audit_logs (guildId, userId, username, action, details)
                VALUES (?, ?, ?, ?, ?)
            `, [guildID, req.user.id, req.user.username, 'Mise à jour configuration', 'Aucun changement majeur détecté']);
        }

        res.redirect(`/shardguard/guild/${guildID}`);
    } catch (err) {
        console.error('Erreur sauvegarde MySQL:', err);
        res.status(500).send('Erreur lors de la sauvegarde');
    }
});

// Endpoint pour déployer les salons
// Endpoints pour la synchronisation des logs
app.get('/api/guild/:guildID/logs', (req, res) => res.redirect(301, `/shardguard/api/guild/${req.params.guildID}/logs`));
app.get('/api/guild/:guildID/audit', (req, res) => res.redirect(301, `/shardguard/api/guild/${req.params.guildID}/audit`));
app.post('/api/guild/:guildID/deploy', (req, res) => res.redirect(307, `/shardguard/api/guild/${req.params.guildID}/deploy`));
app.post('/api/guild/:guildID/bulk/:action', (req, res) => res.redirect(307, `/shardguard/api/guild/${req.params.guildID}/bulk/${req.params.action}`));

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/shardguard/api', apiLimiter);
app.use('/shard/api', apiLimiter);

app.get('/shardguard/api/guild/:guildID/members', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });

    try {
        let allMembers = [];
        let after = '0';
        while (true) {
            const response = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/members?limit=1000&after=${after}`, {
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
            });
            const batch = response.data;
            if (!batch || batch.length === 0) break;
            allMembers = allMembers.concat(batch);
            if (batch.length < 1000) break;
            after = batch[batch.length - 1].user.id;
        }

        const [rolesRes] = await Promise.all([
            axios.get(`https://discord.com/api/v10/guilds/${guildID}/roles`, {
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
            })
        ]);
        const rolesMap = {};
        rolesRes.data.forEach(r => { rolesMap[r.id] = { name: r.name, color: r.color, position: r.position }; });

        const userIds = allMembers.map(m => m.user.id);
        let warnsMap = {};
        if (userIds.length > 0) {
            const [warnRows] = await db.execute(
                `SELECT userId, COUNT(*) as count FROM warnings WHERE guildId = ? AND userId IN (${userIds.map(() => '?').join(',')}) GROUP BY userId`,
                [guildID, ...userIds]
            );
            warnRows.forEach(w => { warnsMap[w.userId] = w.count; });
        }

        const members = allMembers
            .filter(m => !m.user.bot)
            .map(m => {
                const createdAt = Number((BigInt(m.user.id) >> 22n) + 1420070400000n);
                return {
                    id: m.user.id,
                    username: m.user.username,
                    displayName: m.nick || m.user.global_name || m.user.username,
                    avatar: m.user.avatar
                        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.${m.user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
                        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user.id) >> 22) % 6}.png`,
                    joinedAt: m.joined_at,
                    createdAt: new Date(createdAt).toISOString(),
                    timedOutUntil: m.communication_disabled_until || null,
                    roles: (m.roles || [])
                        .filter(rid => rolesMap[rid])
                        .map(rid => ({ id: rid, name: rolesMap[rid].name, color: rolesMap[rid].color, position: rolesMap[rid].position }))
                        .sort((a, b) => b.position - a.position),
                    warns: warnsMap[m.user.id] || 0
                };
            });

        res.json({ success: true, members });
    } catch (e) {
        console.error('Erreur members:', e.response?.data || e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/shardguard/api/guild/:guildID/member/:userId/action', checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });

    const { action, reason, duration, username } = req.body;
    const botHeaders = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
    const displayReason = reason || 'Via dashboard';

    try {
        if (action === 'warn') {
            await db.execute(
                'INSERT INTO warnings (guildId, userId, username, moderatorId, moderatorName, reason) VALUES (?, ?, ?, ?, ?, ?)',
                [guildID, userId, username || userId, req.user.id, req.user.username, displayReason]
            );
            const [[{ count }]] = await db.execute(
                'SELECT COUNT(*) as count FROM warnings WHERE guildId = ? AND userId = ?',
                [guildID, userId]
            );
            await db.execute(
                'INSERT INTO audit_logs (guildId, userId, username, action, details) VALUES (?, ?, ?, ?, ?)',
                [guildID, userId, username || userId, 'Warn', `Raison: ${displayReason} | Par: ${req.user.username} (dashboard)`]
            );
            return res.json({ success: true, warnCount: count });

        } else if (action === 'unwarn') {
            await db.execute('DELETE FROM warnings WHERE guildId = ? AND userId = ?', [guildID, userId]);
            return res.json({ success: true });

        } else if (action === 'deletewarn') {
            const { warnId } = req.body;
            await db.execute('DELETE FROM warnings WHERE id = ? AND guildId = ?', [warnId, guildID]);
            return res.json({ success: true });

        } else if (action === 'deletesanction') {
            const { sanctionId } = req.body;
            await db.execute('DELETE FROM audit_logs WHERE id = ? AND guildId = ?', [sanctionId, guildID]);
            return res.json({ success: true });

        } else if (action === 'clearall') {
            await Promise.all([
                db.execute('DELETE FROM warnings WHERE guildId = ? AND userId = ?', [guildID, userId]),
                db.execute('DELETE FROM audit_logs WHERE guildId = ? AND userId = ?', [guildID, userId])
            ]);
            return res.json({ success: true });

        } else if (action === 'mute') {
            const mins = parseInt(duration) || 60;
            const until = new Date(Date.now() + mins * 60 * 1000).toISOString();
            await axios.patch(`https://discord.com/api/v10/guilds/${guildID}/members/${userId}`,
                { communication_disabled_until: until },
                { headers: { ...botHeaders, 'X-Audit-Log-Reason': encodeURIComponent(displayReason) } }
            );
            await db.execute(
                'INSERT INTO audit_logs (guildId, userId, username, action, details) VALUES (?, ?, ?, ?, ?)',
                [guildID, userId, username || userId, 'Mute', `${mins} min — ${displayReason} | Par: ${req.user.username}`]
            );
            return res.json({ success: true });

        } else if (action === 'unmute') {
            await axios.patch(`https://discord.com/api/v10/guilds/${guildID}/members/${userId}`,
                { communication_disabled_until: null },
                { headers: botHeaders }
            );
            return res.json({ success: true });

        } else if (action === 'kick') {
            await axios.delete(`https://discord.com/api/v10/guilds/${guildID}/members/${userId}`,
                { headers: { ...botHeaders, 'X-Audit-Log-Reason': encodeURIComponent(displayReason) } }
            );
            await db.execute(
                'INSERT INTO audit_logs (guildId, userId, username, action, details) VALUES (?, ?, ?, ?, ?)',
                [guildID, userId, username || userId, 'Kick', `${displayReason} | Par: ${req.user.username}`]
            );
            return res.json({ success: true });

        } else if (action === 'ban') {
            await axios.put(`https://discord.com/api/v10/guilds/${guildID}/bans/${userId}`,
                { delete_message_seconds: 0 },
                { headers: { ...botHeaders, 'X-Audit-Log-Reason': encodeURIComponent(displayReason) } }
            );
            await db.execute(
                'INSERT INTO audit_logs (guildId, userId, username, action, details) VALUES (?, ?, ?, ?, ?)',
                [guildID, userId, username || userId, 'Ban', `${displayReason} | Par: ${req.user.username}`]
            );
            return res.json({ success: true });
        }

        res.status(400).json({ success: false, error: 'Action inconnue' });
    } catch(e) {
        console.error('Erreur action membre:', e.response?.data || e.message);
        res.status(500).json({ success: false, error: e.response?.data?.message || e.message });
    }
});

app.get('/shardguard/api/guild/:guildID/member/:userId/warns', checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [warns] = await db.execute(
            'SELECT * FROM warnings WHERE guildId = ? AND userId = ? ORDER BY timestamp DESC',
            [guildID, userId]
        );
        res.json({ success: true, warns });
    } catch(e) {
        res.status(500).json({ success: false });
    }
});

app.get('/shardguard/api/guild/:guildID/member/:userId/sanctions', checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        const [sanctions] = await db.execute(
            'SELECT * FROM audit_logs WHERE guildId = ? AND userId = ? ORDER BY timestamp DESC LIMIT 50',
            [guildID, userId]
        );
        res.json({ success: true, sanctions });
    } catch(e) {
        res.status(500).json({ success: false });
    }
});

app.get('/shardguard/api/guild/:guildID/logs', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });

    try {
        const { event, status, search } = req.query;
        let query = 'SELECT * FROM logs WHERE guildId = ?';
        const params = [guildID];
        if (event && event !== 'all') { query += ' AND event = ?'; params.push(event); }
        if (status && status !== 'all') { query += ' AND status LIKE ?'; params.push(`%${status}%`); }
        if (search) { query += ' AND (username LIKE ? OR userId LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        query += ' ORDER BY timestamp DESC LIMIT 100';
        const [logs] = await db.execute(query, params);
        const [events] = await db.execute('SELECT DISTINCT event FROM logs WHERE guildId = ? ORDER BY event', [guildID]);
        res.json({ success: true, logs, events: events.map(e => e.event) });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/shardguard/api/guild/:guildID/audit', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });

    try {
        const [audit] = await db.execute('SELECT * FROM audit_logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT 20', [guildID]);
        res.json({ success: true, audit });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/shardguard/api/guild/:guildID/panic', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    const { activate } = req.body;
    const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };

    try {
        const channelsRes = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/channels`, { headers });
        const textChannels = channelsRes.data.filter(c => c.type === 0 || c.type === 5);

        let count = 0;
        for (const channel of textChannels) {
            try {
                const overwrites = channel.permission_overwrites || [];
                const everyoneOverwrite = overwrites.find(o => o.id === guildID) || { id: guildID, type: 0, allow: '0', deny: '0' };
                const SEND_MESSAGES = BigInt(0x800);
                let deny = BigInt(everyoneOverwrite.deny || '0');
                let allow = BigInt(everyoneOverwrite.allow || '0');

                if (activate) {
                    deny |= SEND_MESSAGES;
                    allow &= ~SEND_MESSAGES;
                } else {
                    deny &= ~SEND_MESSAGES;
                }

                const newOverwrites = overwrites.filter(o => o.id !== guildID);
                newOverwrites.push({ id: guildID, type: 0, allow: allow.toString(), deny: deny.toString() });

                await axios.put(`https://discord.com/api/v10/channels/${channel.id}/permissions/${guildID}`, {
                    type: 0,
                    allow: allow.toString(),
                    deny: deny.toString()
                }, { headers });
                count++;
                await new Promise(r => setTimeout(r, 100));
            } catch {}
        }

        await db.execute('UPDATE settings SET panicModeActive = ? WHERE guildId = ?', [activate ? 1 : 0, guildID]);

        res.json({ success: true, count, active: !!activate });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shardguard/api/guild/:guildID/deploy', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const VALID_DEPLOY_TYPES = ['all', 'verification', 'accesscode'];
    const deployType = VALID_DEPLOY_TYPES.includes(req.query.type) ? req.query.type : 'all';
    const { verificationChannelId, accessCodeChannelId } = req.body;

    console.log(`[Deploy] Guild: ${guildID}, Type: ${deployType}`);

    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    try {
        const [settingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const settings = settingsRows[0] || { language: 'fr', serverLocked: 'false' };

        const vChannelId = verificationChannelId || settings.verificationChannelId;
        const aChannelId = accessCodeChannelId || settings.accessCodeChannelId;

        const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
        let sent = false;
        let lastError = null;

        // 1. Déploiement du salon de vérification
        if ((deployType === 'all' || deployType === 'verification') && vChannelId) {
            try {
                const guildIconUrl = userGuild.icon
                    ? `https://cdn.discordapp.com/icons/${guildID}/${userGuild.icon}.${userGuild.icon.startsWith('a_') ? 'gif' : 'png'}?size=128`
                    : null;
                const bannerPath = path.join(__dirname, 'image', 'banner.png');
                const bannerExists = fs.existsSync(bannerPath);
                const embedPayload = {
                    title: settings.language === 'en' ? `Welcome to ${userGuild.name}!` : `Bienvenue sur ${userGuild.name}!`,
                    description: settings.language === 'en' ? 
                        "In order to get full access to the server, you must complete the following verification process.\n\n<:dot:1492857051444019240> Click on `Verify` to get started.\n<:dot:1492857051444019240> Click on `FAQ` to learn more." :
                        "Afin d'obtenir un accès complet au serveur, vous devez suivre le processus de vérification suivant.\n\n<:dot:1492857051444019240> Cliquez sur `Vérifier` pour commencer.\n<:dot:1492857051444019240> Cliquez sur `FAQ` pour en savoir plus.",
                    color: 0x2563eb,
                    thumbnail: guildIconUrl ? { url: guildIconUrl } : undefined,
                    image: bannerExists ? { url: 'attachment://banner.png' } : undefined
                };
                const componentsPayload = [{
                    type: 1,
                    components: [
                        { type: 2, style: 1, label: settings.language === 'en' ? 'Verify' : 'Vérifier', custom_id: 'verify' },
                        { type: 2, style: 2, label: 'FAQ', custom_id: 'faq' }
                    ]
                }];

                if (bannerExists) {
                    const form = new FormData();
                    form.append('payload_json', JSON.stringify({ embeds: [embedPayload], components: componentsPayload }));
                    const bannerBlob = new Blob([fs.readFileSync(bannerPath)], { type: 'image/png' });
                    form.append('files[0]', bannerBlob, 'banner.png');
                    const response = await fetch(`https://discord.com/api/v10/channels/${vChannelId}/messages`, {
                        method: 'POST',
                        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
                        body: form
                    });
                    if (!response.ok) {
                        const errBody = await response.text();
                        throw new Error(`Discord API ${response.status}: ${errBody}`);
                    }
                } else {
                    await axios.post(`https://discord.com/api/v10/channels/${vChannelId}/messages`, {
                        embeds: [embedPayload], components: componentsPayload
                    }, { headers });
                }
                sent = true;
            } catch (e) {
                console.error('Erreur Discord (Vérif):', e.response?.data || e.message);
                lastError = e.response?.data?.message || e.message;
            }
        }

        // 2. Déploiement du salon de code d'accès
        if ((deployType === 'all' || deployType === 'accesscode') && settings.serverLocked === 'true' && aChannelId) {
            try {
                await axios.post(`https://discord.com/api/v10/channels/${aChannelId}/messages`, {
                    embeds: [{
                        title: settings.language === 'en' ? "🔒 Server Locked" : "🔒 Serveur Verrouillé",
                        description: settings.language === 'en' ? 
                            "This server is currently private. Please click the button below to enter your access code." :
                            "Ce serveur est actuellement privé. Veuillez cliquer sur le bouton ci-dessous pour entrer votre code d'accès.",
                        color: 0x000000
                    }],
                    components: [{
                        type: 1,
                        components: [{ type: 2, style: 1, label: settings.language === 'en' ? "Enter Code" : "Entrer le code", custom_id: 'enter_access_code' }]
                    }]
                }, { headers });
                sent = true;
            } catch (e) { 
                console.error('Erreur Discord (Code):', e.response?.data || e.message);
                lastError = e.response?.data?.message || e.message;
            }
        }

        if (sent) {
            return res.json({ success: true });
        } else {
            return res.status(400).json({ success: false, error: lastError || 'Aucun salon sélectionné ou valide' });
        }
    } catch (err) {
        console.error('Erreur déploiement interne:', err);
        res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
    }
});

// Actions groupées (Kick / Verify all)
app.post('/shardguard/api/guild/:guildID/bulk/:action', checkAuth, async (req, res) => {
    const { guildID, action } = req.params;
    const VALID_BULK_ACTIONS = ['verify', 'kick'];
    if (!VALID_BULK_ACTIONS.includes(action)) return res.status(400).json({ success: false, error: 'Action invalide' });
    const userGuild = req.user.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    try {
        const [settingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const settings = settingsRows[0] || { language: 'fr' };
        const roleId = settings.verifiedRole;

        const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}` };
        
        // Récupérer les membres du serveur
        const response = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/members?limit=1000`, { headers });
        const members = response.data;
        let count = 0;

        for (const member of members) {
            if (member.user.bot) continue;
            
            const hasRole = roleId && member.roles.includes(roleId);

            if (action === 'verify' && !hasRole && roleId) {
                // Ajouter le rôle
                await axios.put(`https://discord.com/api/v10/guilds/${guildID}/members/${member.user.id}/roles/${roleId}`, {}, { headers });
                count++;
            } else if (action === 'kick' && !hasRole) {
                // Expulser
                await axios.delete(`https://discord.com/api/v10/guilds/${guildID}/members/${member.user.id}`, { 
                    headers,
                    data: { reason: 'Action groupée via Dashboard' }
                });
                count++;
            }
        }

        // Log d'audit
        const auditAction = action === 'verify' ? 'Vérification groupée' : 'Expulsion groupée';
        const auditDetails = action === 'verify' ? `${count} membres ont reçu le rôle vérifié.` : `${count} membres non-vérifiés ont été expulsés.`;
        
        await db.execute(`
            INSERT INTO audit_logs (guildId, userId, username, action, details)
            VALUES (?, ?, ?, ?, ?)
        `, [guildID, req.user.id, req.user.username, auditAction, auditDetails]);

        res.json({ success: true, count });
    } catch (err) {
        console.error(`Erreur bulk ${action}:`, err.response?.data || err.message);
        res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
    }
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    const isAjax = req.headers['content-type'] === 'application/json'
        || req.path.includes('/api/')
        || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isAjax) {
        return res.status(401).json({ error: 'Session expirée', redirect: '/login' });
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
}

const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000;

// Cached lookup of admin_sessions row state, keyed by sid. Avoids hitting
// the DB on every admin request — refreshed every 30s, so a force-logout
// takes effect within that window.
const adminSessionCache = new Map();
const ADMIN_SESSION_CACHE_TTL = 30 * 1000;

async function isAdminSessionValid(sid) {
    if (!sid) return false;
    const now = Date.now();
    const cached = adminSessionCache.get(sid);
    if (cached && now - cached.fetchedAt < ADMIN_SESSION_CACHE_TTL) {
        return cached.valid;
    }
    try {
        const [rows] = await db.execute(
            'SELECT revoked FROM admin_sessions WHERE sid = ?',
            [sid],
        );
        const valid = rows.length > 0 && !rows[0].revoked;
        adminSessionCache.set(sid, { valid, fetchedAt: now });
        // Best-effort last_seen bump, async
        if (valid) {
            db.execute('UPDATE admin_sessions SET last_seen = NOW() WHERE sid = ?', [sid]).catch(() => {});
        }
        return valid;
    } catch {
        // DB hiccup — fall back to cached value if any, otherwise let the
        // session through (fail open) since the cookie itself is still valid.
        return cached ? cached.valid : true;
    }
}

function checkAdmin(req, res, next) {
    const wantsJson =
        req.path.startsWith('/api/') ||
        req.method !== 'GET' ||
        req.xhr ||
        req.get('Accept')?.includes('application/json');

    const denyOrRedirect = () => {
        if (wantsJson) return res.status(401).json({ error: 'Non authentifié' });
        return res.redirect('/admin/login');
    };

    if (req.session && req.session.isAdmin) {
        if (Date.now() - req.session.adminLoginAt > ADMIN_SESSION_TTL) {
            adminSessionCache.delete(req.sessionID);
            return req.session.destroy(() => denyOrRedirect());
        }
        // Validate against the DB-tracked active-sessions list (force logout)
        return isAdminSessionValid(req.sessionID).then(ok => {
            if (!ok) {
                adminSessionCache.delete(req.sessionID);
                return req.session.destroy(() => denyOrRedirect());
            }
            next();
        }).catch(() => denyOrRedirect());
    }
    denyOrRedirect();
}

const BOTS = [
    { token: process.env.DISCORD_TOKEN, label: 'ShardGuard' },
    { token: process.env.SHARD_TOKEN, label: 'Shard' }
];

function timingSafeEqual(a, b) {
    const hA = crypto.createHash('sha256').update(String(a)).digest();
    const hB = crypto.createHash('sha256').update(String(b)).digest();
    const equal = crypto.timingSafeEqual(hA, hB);
    return equal && String(a).length === String(b).length;
}

function verifyAdminPassword(input) {
    const stored = process.env.ADMIN_PASSWORD_HASH;
    if (stored && stored.includes(':')) {
        const [salt, hash] = stored.split(':');
        if (!salt || !hash) return false;
        try {
            const expected = Buffer.from(hash, 'hex');
            const test = crypto.scryptSync(String(input || ''), salt, expected.length);
            return test.length === expected.length && crypto.timingSafeEqual(test, expected);
        } catch { return false; }
    }
    const fallback = process.env.ADMIN_PASSWORD;
    if (!fallback) return false;
    console.warn('⚠️  ADMIN_PASSWORD utilisé en clair. Définis ADMIN_PASSWORD_HASH (scrypt salt:hash) et supprime ADMIN_PASSWORD.');
    return timingSafeEqual(String(input || ''), fallback);
}

function generateCsrfToken(req) {
    if (!req.session.csrfSecret) {
        req.session.csrfSecret = crypto.randomBytes(32).toString('hex');
    }
    return crypto.createHmac('sha256', req.session.csrfSecret).update('csrf').digest('hex');
}

function verifyCsrf(req, res, next) {
    const token = req.body._csrf || req.headers['x-csrf-token'];
    const expected = req.session.csrfSecret
        ? crypto.createHmac('sha256', req.session.csrfSecret).update('csrf').digest('hex')
        : null;
    if (!expected || !token || !timingSafeEqual(token, expected)) {
        return res.status(403).send('Requête invalide.');
    }
    next();
}

const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Trop de tentatives. Réessayez dans 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

async function fetchBotInfo(token) {
    try {
        const [meRes, guildsRes] = await Promise.all([
            axios.get('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } }),
            axios.get('https://discord.com/api/v10/users/@me/guilds?with_counts=true', { headers: { Authorization: `Bot ${token}` } })
        ]);
        return { ...meRes.data, guilds: guildsRes.data, token };
    } catch { return null; }
}

// CSRF for the React /admin/login form (kept for backward compat with the
// Login route — /api/csrf returns the same value)
app.get('/api/admin/csrf', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req) });
});

// Per-account login lockout schedule (failed attempts → cooldown).
// Combined with `adminLoginLimiter` (IP-based), this defeats distributed
// brute force from multiple IPs that the rate limiter alone wouldn't catch.
const LOGIN_LOCKOUT_SCHEDULE = [
    { attempts: 5, ms: 5 * 60 * 1000 },        // 5 min
    { attempts: 10, ms: 30 * 60 * 1000 },      // 30 min
    { attempts: 15, ms: 24 * 60 * 60 * 1000 }, // 24 h
];

async function checkAdminLockout(username) {
    if (!username) return { locked: false };
    try {
        const [rows] = await db.execute(
            'SELECT failed_attempts, locked_until FROM admin_login_attempts WHERE username = ?',
            [username],
        );
        const row = rows[0];
        if (row && row.locked_until && new Date(row.locked_until) > new Date()) {
            return { locked: true, until: row.locked_until };
        }
        return { locked: false };
    } catch { return { locked: false }; }
}

async function recordFailedAdminLogin(username) {
    if (!username) return;
    try {
        const [rows] = await db.execute(
            'SELECT failed_attempts FROM admin_login_attempts WHERE username = ?',
            [username],
        );
        const next = (rows[0]?.failed_attempts || 0) + 1;
        const tier = [...LOGIN_LOCKOUT_SCHEDULE].reverse().find(t => next >= t.attempts);
        const lockedUntil = tier ? new Date(Date.now() + tier.ms) : null;
        await db.execute(
            `INSERT INTO admin_login_attempts (username, failed_attempts, last_failed_at, locked_until)
             VALUES (?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE failed_attempts = VALUES(failed_attempts),
                 last_failed_at = VALUES(last_failed_at), locked_until = VALUES(locked_until)`,
            [username, next, lockedUntil],
        );
    } catch (e) { console.error('recordFailedAdminLogin:', e.message); }
}

async function clearAdminLockout(username) {
    if (!username) return;
    try {
        await db.execute('DELETE FROM admin_login_attempts WHERE username = ?', [username]);
    } catch { /* swallow */ }
}

app.post('/admin/login', adminLoginLimiter, verifyCsrf, async (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect('/admin');
    const { username, password } = req.body;

    // Only track lockout against the configured admin username so an
    // attacker can't spam random usernames to bloat the table or DoS
    // legitimate admins (they'd just hit the IP rate limiter).
    const validUser = timingSafeEqual(username || '', process.env.ADMIN_USERNAME || '');
    const lockoutKey = validUser ? username : null;

    if (lockoutKey) {
        const state = await checkAdminLockout(lockoutKey);
        if (state.locked) {
            return res.redirect('/admin/login?error=locked');
        }
    }

    const validPass = verifyAdminPassword(password);
    if (validUser && validPass) {
        await clearAdminLockout(lockoutKey);
        await logAdminAction(req, 'login.success', null, { username: lockoutKey || '(unknown)' });
        req.session.regenerate(async (err) => {
            if (err) return res.status(500).send('Erreur serveur');
            req.session.isAdmin = true;
            req.session.adminLoginAt = Date.now();
            try {
                await db.execute(
                    `INSERT INTO admin_sessions (sid, ip, user_agent) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE login_at = NOW(), last_seen = NOW(), revoked = 0,
                     ip = VALUES(ip), user_agent = VALUES(user_agent)`,
                    [req.sessionID, (req.ip || '').slice(0, 64), String(req.get('User-Agent') || '').slice(0, 512)],
                );
                adminSessionCache.delete(req.sessionID);
            } catch (e) { console.error('admin_sessions insert:', e.message); }
            res.redirect('/admin');
        });
        return;
    }

    if (lockoutKey) await recordFailedAdminLogin(lockoutKey);
    await logAdminAction(req, 'login.failure', null, { suppliedUsername: String(username || '').slice(0, 64) });
    res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
    if (req.session && req.session.isAdmin) {
        const sid = req.sessionID;
        db.execute('DELETE FROM admin_sessions WHERE sid = ?', [sid]).catch(() => {});
        adminSessionCache.delete(sid);
        logAdminAction(req, 'logout').catch(() => {});
    }
    req.session.destroy(() => res.redirect('/admin/login'));
});

// Forensic audit trail. Best-effort — failures are swallowed so a DB
// hiccup never blocks an admin action.
async function logAdminAction(req, action, target, details) {
    try {
        await db.execute(
            `INSERT INTO admin_audit_log (action, target_guild_id, target_bot_id, details, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                String(action).slice(0, 64),
                target?.guildId || null,
                target?.botId || null,
                details ? JSON.stringify(details).slice(0, 4000) : null,
                (req.ip || '').slice(0, 64),
                String(req.get('User-Agent') || '').slice(0, 512),
            ],
        );
    } catch (e) {
        console.error('logAdminAction:', e.message);
    }
}

// Active admin sessions
app.get('/api/admin/sessions', checkAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, sid, login_at, last_seen, ip, user_agent
             FROM admin_sessions WHERE revoked = 0 ORDER BY last_seen DESC`,
        );
        // Don't leak the SID — only flag the current row.
        const sessions = rows.map(r => ({
            id: r.id,
            login_at: r.login_at,
            last_seen: r.last_seen,
            ip: r.ip,
            user_agent: r.user_agent,
            current: r.sid === req.sessionID,
        }));
        res.json({ sessions });
    } catch (err) {
        console.error('GET /api/admin/sessions:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/sessions/:id/revoke', checkAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [rows] = await db.execute('SELECT sid FROM admin_sessions WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });
        if (rows[0].sid === req.sessionID) {
            return res.status(400).json({ error: 'Utilise /admin/logout pour cette session' });
        }
        await db.execute('UPDATE admin_sessions SET revoked = 1 WHERE id = ?', [id]);
        adminSessionCache.delete(rows[0].sid);
        await logAdminAction(req, 'session.revoke', null, { revokedSessionId: id });
        res.json({ success: true });
    } catch (err) {
        console.error('revoke session:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Periodic cleanup of revoked or stale rows. Runs every 30 min.
setInterval(() => {
    db.execute(
        `DELETE FROM admin_sessions
         WHERE revoked = 1 OR last_seen < DATE_SUB(NOW(), INTERVAL 5 DAY)`,
    ).catch(() => {});
}, 30 * 60 * 1000).unref?.();

// Admin audit log — last N entries
app.get('/api/admin/audit', checkAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const [rows] = await db.execute(
            `SELECT id, action, target_guild_id, target_bot_id, details, ip, user_agent, created_at
             FROM admin_audit_log ORDER BY id DESC LIMIT ${limit}`,
        );
        res.json({ entries: rows });
    } catch (err) {
        console.error('GET /api/admin/audit:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Admin panel data — consumed by React /admin
app.get('/api/admin', checkAdmin, async (req, res) => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS blocked_guilds (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) UNIQUE NOT NULL,
                guild_name VARCHAR(255),
                blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const botsData = (await Promise.all(BOTS.map(b => fetchBotInfo(b.token)))).filter(Boolean);
        const [blockedRows] = await db.execute('SELECT * FROM blocked_guilds ORDER BY blocked_at DESC');

        const totalGuilds = botsData.reduce((acc, b) => acc + b.guilds.length, 0);
        const totalMembers = botsData.reduce((acc, b) => acc + b.guilds.reduce((s, g) => s + (g.approximate_member_count || 0), 0), 0);

        res.json({
            bots: botsData.map(b => ({
                id: b.id,
                username: b.username,
                discriminator: b.discriminator || '0',
                avatar: b.avatar || null,
                guilds: b.guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon || null })),
            })),
            blockedGuilds: blockedRows.map(b => ({ guild_id: b.guild_id, guild_name: b.guild_name })),
            totalGuilds,
            totalMembers,
            csrfToken: generateCsrfToken(req),
        });
    } catch (err) {
        console.error('Erreur /api/admin:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

async function resolveBotByBotId(botId) {
    if (!isValidSnowflake(botId)) return null;
    for (const b of BOTS) {
        if (!b.token) continue;
        try {
            const meRes = await axios.get('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${b.token}` } });
            if (meRes.data.id === botId) return b;
        } catch {}
    }
    return null;
}

app.post('/admin/bot/:botId/guild/:guildId/leave', checkAdmin, verifyCsrf, async (req, res) => {
    const { botId, guildId } = req.params;
    if (!isValidSnowflake(guildId)) return res.json({ success: false, error: 'Guild ID invalide' });
    const bot = await resolveBotByBotId(botId);
    if (!bot) return res.json({ success: false, error: 'Bot introuvable' });
    try {
        await axios.delete(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, { headers: { Authorization: `Bot ${bot.token}` } });
        await logAdminAction(req, 'guild.leave', { botId, guildId });
        res.json({ success: true });
    } catch (err) {
        await logAdminAction(req, 'guild.leave.failed', { botId, guildId }, { error: err.message });
        res.json({ success: false, error: err.response?.data?.message || err.message });
    }
});

app.post('/admin/bot/:botId/guild/:guildId/block', checkAdmin, verifyCsrf, async (req, res) => {
    const { botId, guildId } = req.params;
    const { guildName } = req.body;
    if (!isValidSnowflake(guildId)) return res.json({ success: false, error: 'Guild ID invalide' });
    const bot = await resolveBotByBotId(botId);
    if (!bot) return res.json({ success: false, error: 'Bot introuvable' });
    try {
        await db.execute('INSERT INTO blocked_guilds (guild_id, guild_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name)', [guildId, guildName || guildId]);
        try {
            await axios.delete(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, { headers: { Authorization: `Bot ${bot.token}` } });
        } catch {}
        await logAdminAction(req, 'guild.block', { botId, guildId }, { guildName: guildName || null });
        res.json({ success: true });
    } catch (err) {
        await logAdminAction(req, 'guild.block.failed', { botId, guildId }, { error: err.message });
        res.json({ success: false, error: err.message });
    }
});

app.post('/admin/guild/:guildId/unblock', checkAdmin, verifyCsrf, async (req, res) => {
    const { guildId } = req.params;
    try {
        await db.execute('DELETE FROM blocked_guilds WHERE guild_id = ?', [guildId]);
        await logAdminAction(req, 'guild.unblock', { guildId });
        res.json({ success: true });
    } catch (err) {
        await logAdminAction(req, 'guild.unblock.failed', { guildId }, { error: err.message });
        res.json({ success: false, error: err.message });
    }
});

const statsRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});

app.get('/api/stats', statsRateLimiter, async (req, res) => {
    try {
        const botsInfo = await Promise.all(BOTS.map(async b => {
            const info = await fetchBotInfo(b.token);

            const [shards] = await db.execute(
                `SELECT *, IF(last_update < DATE_SUB(NOW(), INTERVAL 1 MINUTE), 'Offline', status) AS status FROM shard_status WHERE bot_label = ?`,
                [b.label]
            );

            for (let shard of shards) {
                const [guilds] = await db.execute('SELECT guild_id, guild_name FROM shard_guilds WHERE bot_label = ? AND shard_id = ?', [b.label, shard.shard_id]);
                shard.guilds_list = guilds;
            }

            const anyOnline = shards.some(s => s.status === 'Online');

            return {
                label: b.label,
                online: anyOnline,
                guilds: info ? info.guilds.length : 0,
                members: info ? info.guilds.reduce((s, g) => s + (g.approximate_member_count || 0), 0) : 0,
                shards: shards
            };
        }));

        const [history] = await db.execute('SELECT * FROM bot_stats WHERE timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY timestamp ASC');

        res.json({ current: botsInfo, history });
    } catch (err) {
        console.error('Erreur /api/stats:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

async function collectStats() {
    try {
        for (const b of BOTS) {
            const info = await fetchBotInfo(b.token);
            if (info) {
                const memberCount = info.guilds.reduce((s, g) => s + (g.approximate_member_count || 0), 0);
                await db.execute(
                    'INSERT INTO bot_stats (bot_label, guild_count, member_count) VALUES (?, ?, ?)',
                    [b.label, info.guilds.length, memberCount]
                );
            }
        }
        console.log('📊 Stats des bots collectées');
    } catch (err) {
        console.error('Erreur collecte stats:', err.message);
    }
}

// Collecte toutes les heures
setInterval(collectStats, 60 * 60 * 1000);
// Et au démarrage après un court délai pour laisser la DB se connecter
setTimeout(collectStats, 5000);

// SPA catch-all — must be last. Anything that didn't match an Express route
// (and isn't an API/webhook/OAuth path) gets the React build.
app.get(/.*/, (req, res, next) => {
    const p = req.path;
    if (
        p.startsWith('/api/') ||
        p.startsWith('/webhook/') ||
        p.startsWith('/login') ||
        p.startsWith('/callback') ||
        p.startsWith('/logout') ||
        p.startsWith('/shard/login') ||
        p.startsWith('/shard/callback') ||
        p.startsWith('/shard/logout') ||
        p.startsWith('/admin/logout') ||
        p.startsWith('/_legacy/') ||
        p.startsWith('/image/') ||
        p === '/favicon.ico'
    ) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(SPA_DIST, 'index.html'), err => {
        if (err) {
            console.warn('[spa] React bundle missing — run: npm --prefix status-app run build');
            res.status(500).send('SPA build missing');
        }
    });
});

console.log('Tentative de démarrage du serveur...');
app.listen(PORT, () => console.log(`Tableau de bord démarré sur http://localhost:${PORT}`));