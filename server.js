require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
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
const nodemailer = require('nodemailer');
const { CaptchaGenerator } = require('captcha-canvas');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// Fisher-Yates with crypto.randomInt — replaces the buggy
// `arr.sort(() => Math.random() - 0.5)` shuffle, which is both
// statistically biased and not cryptographically random. Used for
// giveaway winner draws where users pay (Premium) for a fair lottery.
function cryptoShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

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
            // Shardtown user accounts (separate from admin / Discord OAuth).
            // Email + pseudo + scrypt-hashed password. Discord can be
            // linked in a follow-up PR (columns reserved here so the
            // schema doesn't churn later).
            await db.execute(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(254) NOT NULL UNIQUE,
                    email_verified TINYINT NOT NULL DEFAULT 0,
                    pseudo VARCHAR(32) NOT NULL UNIQUE,
                    password_hash VARCHAR(256) NOT NULL,
                    password_salt VARCHAR(64) NOT NULL,
                    discord_id VARCHAR(255) DEFAULT NULL,
                    discord_username VARCHAR(255) DEFAULT NULL,
                    discord_avatar VARCHAR(255) DEFAULT NULL,
                    discord_linked_at DATETIME DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login_at DATETIME DEFAULT NULL,
                    INDEX idx_pseudo (pseudo),
                    INDEX idx_discord (discord_id)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS account_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    type ENUM('email_verify', 'password_reset') NOT NULL,
                    token_hash CHAR(64) NOT NULL UNIQUE,
                    expires_at DATETIME NOT NULL,
                    used_at DATETIME DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_account_type (account_id, type),
                    INDEX idx_token (token_hash)
                )
            `);
            // Phase 2 — Discord linking columns
            for (const ddl of [
                `ALTER TABLE accounts ADD COLUMN discord_access_token TEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN discord_refresh_token TEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN discord_token_expires_at DATETIME DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN discord_guilds_json MEDIUMTEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN discord_guilds_fetched_at DATETIME DEFAULT NULL`,
                `ALTER TABLE accounts ADD UNIQUE KEY uniq_discord (discord_id)`,
                // Google + GitHub OAuth identities
                `ALTER TABLE accounts ADD COLUMN oauth_google_id VARCHAR(64) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN oauth_google_email VARCHAR(254) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN oauth_github_id VARCHAR(64) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN oauth_github_username VARCHAR(64) DEFAULT NULL`,
                `ALTER TABLE accounts ADD UNIQUE KEY uniq_google (oauth_google_id)`,
                `ALTER TABLE accounts ADD UNIQUE KEY uniq_github (oauth_github_id)`,
            ]) {
                try { await db.execute(ddl); } catch { /* already exists */ }
            }
            // Passkeys / WebAuthn credentials
            await db.execute(`
                CREATE TABLE IF NOT EXISTS account_passkeys (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    credential_id VARCHAR(512) NOT NULL UNIQUE,
                    public_key TEXT NOT NULL,
                    counter BIGINT NOT NULL DEFAULT 0,
                    name VARCHAR(64) NOT NULL,
                    transports VARCHAR(64) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_used_at DATETIME DEFAULT NULL,
                    INDEX idx_account (account_id)
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
            // Support tickets — one open ticket per user at a time. The
            // channel_id is the Discord text channel created in the
            // SUPPORT_CATEGORY_ID where staff and the user meet.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    user_username VARCHAR(255) NOT NULL,
                    user_avatar VARCHAR(255) DEFAULT NULL,
                    channel_id VARCHAR(255) NOT NULL UNIQUE,
                    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    closed_at DATETIME DEFAULT NULL,
                    INDEX idx_user_status (user_id, status),
                    INDEX idx_channel (channel_id)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS support_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ticket_id INT NOT NULL,
                    side ENUM('user', 'staff') NOT NULL,
                    author_id VARCHAR(255) NOT NULL,
                    author_name VARCHAR(255) NOT NULL,
                    author_avatar VARCHAR(255) DEFAULT NULL,
                    content TEXT NOT NULL,
                    discord_message_id VARCHAR(255) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_ticket (ticket_id, id),
                    INDEX idx_discord_msg (discord_message_id)
                )
            `);
            // Drop the legacy NOT NULL constraints on channel_id and
            // user_id so guest (non-Discord) tickets can be opened.
            try {
                await db.execute(`ALTER TABLE support_tickets MODIFY channel_id VARCHAR(255) DEFAULT NULL`);
            } catch { /* already nullable */ }
            try {
                await db.execute(`ALTER TABLE support_tickets MODIFY user_id VARCHAR(255) DEFAULT NULL`);
            } catch { /* already nullable */ }
            // Guest contact info + session-based ownership when there's
            // no Discord account. Idempotent ADD COLUMN — wrap in try.
            for (const ddl of [
                `ALTER TABLE support_tickets ADD COLUMN guest_email VARCHAR(254) DEFAULT NULL`,
                `ALTER TABLE support_tickets ADD COLUMN session_id VARCHAR(128) DEFAULT NULL`,
                `ALTER TABLE support_tickets ADD INDEX idx_session (session_id)`,
                `ALTER TABLE support_tickets ADD COLUMN claimed_by_id INT DEFAULT NULL`,
                `ALTER TABLE support_tickets ADD COLUMN claimed_by_name VARCHAR(64) DEFAULT NULL`,
                `ALTER TABLE support_tickets ADD COLUMN claimed_at DATETIME DEFAULT NULL`,
                `ALTER TABLE support_messages MODIFY side ENUM('user', 'staff', 'system') NOT NULL`,
            ]) {
                try { await db.execute(ddl); } catch { /* already exists */ }
            }
            // Access keys for support staff (mint from admin panel,
            // hashed at rest, one row per staff seat).
            await db.execute(`
                CREATE TABLE IF NOT EXISTS support_staff_keys (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(64) NOT NULL,
                    key_hash CHAR(64) NOT NULL UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_used_at DATETIME DEFAULT NULL,
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

// Trust only loopback (Express receives traffic from nginx on
// 127.0.0.1). Trusting `true` or a numeric hop count would let an
// attacker spoof X-Forwarded-For and bypass IP-keyed rate limits.
app.set('trust proxy', 'loopback');

// Allow alphanumeric + underscore column names only — used to gate
// dynamic UPDATE column lists in the settings restore endpoint, where
// keys come from a JSON-decoded backup row. Today the keys are
// schema-derived so this is defense in depth, but any future code
// path that lets a user influence the backup JSON would otherwise be
// immediate SQL injection.
function isSafeColumnName(s) {
    return typeof s === 'string' && s.length > 0 && s.length <= 64
        && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

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
    // X-XSS-Protection removed — modern browsers ignore it and older
    // versions had filter bugs that introduced new vulnerabilities.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // HSTS: enforce HTTPS for 6 months. Only sent in production so dev
    // over plain HTTP doesn't get pinned to https://. `includeSubDomains`
    // keeps subdomain takeover attacks blocked too.
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    // Vite-built React SPA emits only external <script src="..."> tags so
    // it doesn't need 'unsafe-inline'. The legacy EJS templates rendered
    // under /_legacy/ still contain inline <script> blocks and onclick="..."
    // handlers, so for those paths we keep the loose policy.
    const isLegacy = req.path.startsWith('/_legacy/');
    const scriptSrc = isLegacy
        ? "'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"
        : "'self' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net";

    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        `script-src ${scriptSrc}; ` +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' https://cdn.discordapp.com https://cdn.tailwindcss.com data:; " +
        "connect-src 'self'; " +
        "frame-src 'none'; " +
        "frame-ancestors 'none'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
    );
    res.removeHeader('X-Powered-By');
    next();
});

// Persistent session store backed by MySQL — sessions survive Node
// restarts (no more wiping every logged-in user on deploy) and the
// MemoryStore production warning goes away. The library auto-creates a
// `sessions` table the first time it boots, then prunes expired rows
// every 15 min.
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,
    createDatabaseTable: true,
});
sessionStore.on?.('error', err => console.error('[session-store]', err));

app.use(session({
    store: sessionStore,
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

// Synthesize req.user from the linked Discord on the current account.
// Lets all dashboard routes (which read `req.user.guilds`, `req.user.id`,
// etc.) work transparently when the user signed in via /account/login
// rather than via the legacy passport-discord flow.
app.use(async (req, res, next) => {
    if (req.user) return next(); // passport already populated
    if (!req.session?.account?.id) return next();
    try {
        const [rows] = await db.execute(
            `SELECT discord_id, discord_username, discord_avatar, discord_guilds_json
             FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a || !a.discord_id) return next();
        let guilds = [];
        try { guilds = a.discord_guilds_json ? JSON.parse(a.discord_guilds_json) : []; } catch { /* */ }
        req.user = {
            id: a.discord_id,
            username: a.discord_username || '',
            global_name: a.discord_username || null,
            avatar: a.discord_avatar || null,
            discriminator: '0',
            guilds,
        };
    } catch { /* swallow — fall back to anonymous */ }
    next();
});

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

// ─── Support tickets ───────────────────────────────────────────────────
// A logged-in Discord user can open ONE ticket at a time. The ticket is
// a DB row only — staff handle it from the dedicated /support panel
// after authenticating with an access key minted from the admin panel.
const supportRateLimit = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Trop de messages.' }, standardHeaders: true, legacyHeaders: false });

function userAvatarUrl(u) {
    if (!u || !u.id) return null;
    if (u.avatar) {
        const ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${(parseInt(u.id) >> 22) % 6}.png`;
}

function hashSupportKey(key) {
    return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function requireStaff(req, res, next) {
    if (req.session && req.session.staff && req.session.staff.id) return next();
    res.status(401).json({ error: 'Non authentifié' });
}

// Typing indicator state — kept in memory. ticketId → { userAt, staffAt }
// Each side's timestamp expires after 5s. No persistence needed.
const typingState = new Map();
const TYPING_TTL = 5000;

function bumpTyping(ticketId, side) {
    const now = Date.now();
    let s = typingState.get(ticketId);
    if (!s) { s = { userAt: 0, staffAt: 0 }; typingState.set(ticketId, s); }
    if (side === 'user') s.userAt = now; else s.staffAt = now;
}

function peerTyping(ticketId, mySide) {
    const s = typingState.get(ticketId);
    if (!s) return false;
    const peerAt = mySide === 'user' ? s.staffAt : s.userAt;
    return peerAt > 0 && Date.now() - peerAt < TYPING_TTL;
}

// Periodic cleanup of typing entries (every 60s).
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of typingState) {
        if (now - Math.max(v.userAt, v.staffAt) > TYPING_TTL * 2) typingState.delete(k);
    }
}, 60_000).unref?.();

function ticketRequesterMatches(t, req) {
    if (!t) return false;
    if (req.user && t.user_id === req.user.id) return true;
    if (!t.user_id && t.session_id && t.session_id === req.sessionID) return true;
    return false;
}

// Get current ticket (Discord user OR guest by session)
app.get('/api/support/ticket', async (req, res) => {
    try {
        const [rows] = req.user
            ? await db.execute(
                `SELECT id, status, created_at, claimed_by_id, claimed_by_name FROM support_tickets
                 WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`,
                [req.user.id],
            )
            : await db.execute(
                `SELECT id, status, created_at, claimed_by_id, claimed_by_name FROM support_tickets
                 WHERE user_id IS NULL AND session_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`,
                [req.sessionID],
            );
        if (rows.length === 0) return res.json({ ticket: null, messages: [] });
        const ticket = rows[0];
        const [msgs] = await db.execute(
            `SELECT id, side, author_name, author_avatar, content, created_at
             FROM support_messages WHERE ticket_id = ? ORDER BY id ASC LIMIT 200`,
            [ticket.id],
        );
        res.json({
            ticket: {
                id: ticket.id,
                status: ticket.status,
                created_at: ticket.created_at,
                claimed_by: ticket.claimed_by_id ? { id: ticket.claimed_by_id, name: ticket.claimed_by_name } : null,
            },
            messages: msgs,
        });
    } catch (err) {
        console.error('GET /api/support/ticket:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Open a new ticket. Discord user → uses their identity. Guest → must
// supply { name, email } and the ticket gets bound to their session ID.
app.post('/api/support/ticket', supportRateLimit, async (req, res) => {
    try {
        if (req.user) {
            const [existing] = await db.execute(
                `SELECT id FROM support_tickets WHERE user_id = ? AND status = 'open' LIMIT 1`,
                [req.user.id],
            );
            if (existing.length > 0) {
                return res.status(409).json({ error: 'Un ticket est déjà ouvert', ticketId: existing[0].id });
            }
            const [insert] = await db.execute(
                `INSERT INTO support_tickets (user_id, user_username, user_avatar, session_id) VALUES (?, ?, ?, ?)`,
                [req.user.id, req.user.username, userAvatarUrl(req.user), req.sessionID],
            );
            return res.json({ ticket: { id: insert.insertId, status: 'open', created_at: new Date().toISOString() }, messages: [] });
        }

        // Guest path
        const name = String(req.body?.name || '').trim().slice(0, 64);
        const email = String(req.body?.email || '').trim().slice(0, 254);
        if (!name) return res.status(400).json({ error: 'Nom requis' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

        const [existing] = await db.execute(
            `SELECT id FROM support_tickets WHERE session_id = ? AND status = 'open' LIMIT 1`,
            [req.sessionID],
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Un ticket est déjà ouvert', ticketId: existing[0].id });
        }
        const [insert] = await db.execute(
            `INSERT INTO support_tickets (user_id, user_username, user_avatar, guest_email, session_id) VALUES (NULL, ?, NULL, ?, ?)`,
            [name, email, req.sessionID],
        );
        res.json({ ticket: { id: insert.insertId, status: 'open', created_at: new Date().toISOString() }, messages: [] });
    } catch (err) {
        console.error('POST /api/support/ticket:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Send a message in the current user's open ticket
app.post('/api/support/ticket/:id/message', supportRateLimit, async (req, res) => {
    const ticketId = parseInt(req.params.id, 10);
    if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'ID invalide' });
    const content = String(req.body?.content || '').trim().slice(0, 2000);
    if (!content) return res.status(400).json({ error: 'Message vide' });
    try {
        const [rows] = await db.execute(
            `SELECT id, user_id, user_username, session_id, status FROM support_tickets WHERE id = ?`,
            [ticketId],
        );
        const t = rows[0];
        if (!ticketRequesterMatches(t, req)) return res.status(404).json({ error: 'Ticket introuvable' });
        if (t.status !== 'open') return res.status(409).json({ error: 'Ticket fermé' });

        const authorId = req.user?.id || `guest:${req.sessionID.slice(0, 16)}`;
        const authorName = req.user?.username || t.user_username || 'Invité';
        const authorAvatar = req.user ? userAvatarUrl(req.user) : null;

        await db.execute(
            `INSERT INTO support_messages (ticket_id, side, author_id, author_name, author_avatar, content)
             VALUES (?, 'user', ?, ?, ?, ?)`,
            [ticketId, authorId, authorName, authorAvatar, content],
        );
        // Sending a message clears the typing indicator on this side
        bumpTyping(ticketId, 'user'); typingState.get(ticketId).userAt = 0;
        res.json({ success: true });
    } catch (err) {
        console.error('POST support message:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Poll for new messages since a given message id (also returns whether
// the staff is currently typing + who, if anyone, has claimed)
app.get('/api/support/ticket/:id/messages', async (req, res) => {
    const ticketId = parseInt(req.params.id, 10);
    const since = parseInt(req.query.since, 10) || 0;
    if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [rows] = await db.execute(
            `SELECT id, user_id, session_id, status, claimed_by_id, claimed_by_name FROM support_tickets WHERE id = ?`,
            [ticketId],
        );
        const t = rows[0];
        if (!ticketRequesterMatches(t, req)) return res.status(404).json({ error: 'Ticket introuvable' });
        const [msgs] = await db.execute(
            `SELECT id, side, author_name, author_avatar, content, created_at
             FROM support_messages WHERE ticket_id = ? AND id > ? ORDER BY id ASC LIMIT 100`,
            [ticketId, since],
        );
        res.json({
            messages: msgs,
            status: t.status,
            peer_typing: peerTyping(ticketId, 'user'),
            claimed_by: t.claimed_by_id ? { id: t.claimed_by_id, name: t.claimed_by_name } : null,
        });
    } catch (err) {
        console.error('GET support messages:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// User typing indicator (debounced from the client)
app.post('/api/support/ticket/:id/typing', async (req, res) => {
    const ticketId = parseInt(req.params.id, 10);
    if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [rows] = await db.execute(
            `SELECT id, user_id, session_id, status FROM support_tickets WHERE id = ?`,
            [ticketId],
        );
        const t = rows[0];
        if (!ticketRequesterMatches(t, req) || t.status !== 'open') return res.status(204).end();
        bumpTyping(ticketId, 'user');
        res.status(204).end();
    } catch {
        res.status(204).end();
    }
});

// Close the current user's ticket
app.post('/api/support/ticket/:id/close', supportRateLimit, async (req, res) => {
    const ticketId = parseInt(req.params.id, 10);
    if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [rows] = await db.execute(
            `SELECT id, user_id, session_id, status FROM support_tickets WHERE id = ?`,
            [ticketId],
        );
        const t = rows[0];
        if (!ticketRequesterMatches(t, req)) return res.status(404).json({ error: 'Ticket introuvable' });
        if (t.status === 'closed') return res.json({ success: true });
        await db.execute(`UPDATE support_tickets SET status = 'closed', closed_at = NOW() WHERE id = ?`, [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error('POST close ticket:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Support staff panel (key-based auth) ──────────────────────────────

// Login: validate key → set session staff
app.post('/api/support/staff/login', supportRateLimit, async (req, res) => {
    const key = String(req.body?.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Clé requise' });
    try {
        const [rows] = await db.execute(
            `SELECT id, name, revoked FROM support_staff_keys WHERE key_hash = ? LIMIT 1`,
            [hashSupportKey(key)],
        );
        if (!rows.length || rows[0].revoked) return res.status(401).json({ error: 'Clé invalide' });
        const staff = rows[0];
        req.session.regenerate(async err => {
            if (err) return res.status(500).json({ error: 'Erreur serveur' });
            req.session.staff = { id: staff.id, name: staff.name, loginAt: Date.now() };
            db.execute('UPDATE support_staff_keys SET last_used_at = NOW() WHERE id = ?', [staff.id]).catch(() => {});
            res.json({ staff: { id: staff.id, name: staff.name } });
        });
    } catch (err) {
        console.error('staff login:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/support/staff/logout', (req, res) => {
    if (req.session) req.session.staff = null;
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/support/staff/me', async (req, res) => {
    if (!req.session?.staff?.id) return res.json({ staff: null });
    // Re-check the underlying key isn't revoked (cheap, not cached)
    try {
        const [rows] = await db.execute(
            'SELECT id, name, revoked FROM support_staff_keys WHERE id = ?',
            [req.session.staff.id],
        );
        if (!rows.length || rows[0].revoked) {
            req.session.staff = null;
            return res.json({ staff: null });
        }
        res.json({ staff: { id: rows[0].id, name: rows[0].name } });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// List all tickets (open first, closed after; paginated)
app.get('/api/support/staff/tickets', requireStaff, async (req, res) => {
    const status = req.query.status === 'closed' ? 'closed' : 'open';
    try {
        const [rows] = await db.execute(
            `SELECT t.id, t.user_id, t.user_username, t.user_avatar, t.guest_email,
                    t.claimed_by_id, t.claimed_by_name, t.claimed_at,
                    t.status, t.created_at, t.closed_at,
                    (SELECT MAX(created_at) FROM support_messages m WHERE m.ticket_id = t.id) AS last_message_at,
                    (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
             FROM support_tickets t WHERE t.status = ?
             ORDER BY t.id DESC LIMIT 200`,
            [status],
        );
        res.json({ tickets: rows });
    } catch (err) {
        console.error('staff tickets:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get one ticket + all its messages (for the staff chat view)
app.get('/api/support/staff/ticket/:id', requireStaff, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [tickets] = await db.execute(
            `SELECT id, user_id, user_username, user_avatar, guest_email,
                    claimed_by_id, claimed_by_name, claimed_at,
                    status, created_at, closed_at FROM support_tickets WHERE id = ?`,
            [id],
        );
        if (!tickets.length) return res.status(404).json({ error: 'Ticket introuvable' });
        const [msgs] = await db.execute(
            `SELECT id, side, author_name, author_avatar, content, created_at
             FROM support_messages WHERE ticket_id = ? ORDER BY id ASC LIMIT 500`,
            [id],
        );
        res.json({ ticket: tickets[0], messages: msgs });
    } catch (err) {
        console.error('staff ticket:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/support/staff/ticket/:id/messages', requireStaff, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const since = parseInt(req.query.since, 10) || 0;
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [tickets] = await db.execute(
            `SELECT status, claimed_by_id, claimed_by_name FROM support_tickets WHERE id = ?`,
            [id],
        );
        if (!tickets.length) return res.status(404).json({ error: 'Ticket introuvable' });
        const [msgs] = await db.execute(
            `SELECT id, side, author_name, author_avatar, content, created_at
             FROM support_messages WHERE ticket_id = ? AND id > ? ORDER BY id ASC LIMIT 100`,
            [id, since],
        );
        res.json({
            messages: msgs,
            status: tickets[0].status,
            peer_typing: peerTyping(id, 'staff'),
            claimed_by: tickets[0].claimed_by_id ? { id: tickets[0].claimed_by_id, name: tickets[0].claimed_by_name } : null,
        });
    } catch (err) {
        console.error('staff poll:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Staff posts a reply (auto-claims the ticket if not yet claimed)
app.post('/api/support/staff/ticket/:id/message', requireStaff, supportRateLimit, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    const content = String(req.body?.content || '').trim().slice(0, 2000);
    if (!content) return res.status(400).json({ error: 'Message vide' });
    try {
        const [tickets] = await db.execute(
            `SELECT id, status, claimed_by_id FROM support_tickets WHERE id = ?`,
            [id],
        );
        if (!tickets.length) return res.status(404).json({ error: 'Ticket introuvable' });
        if (tickets[0].status !== 'open') return res.status(409).json({ error: 'Ticket fermé' });

        // Auto-claim on first staff reply if no one's claimed it yet
        if (!tickets[0].claimed_by_id) {
            await db.execute(
                `UPDATE support_tickets SET claimed_by_id = ?, claimed_by_name = ?, claimed_at = NOW() WHERE id = ?`,
                [req.session.staff.id, req.session.staff.name, id],
            );
            await db.execute(
                `INSERT INTO support_messages (ticket_id, side, author_id, author_name, author_avatar, content)
                 VALUES (?, 'system', ?, ?, NULL, ?)`,
                [id, String(req.session.staff.id), req.session.staff.name, `${req.session.staff.name} a pris en charge votre ticket`],
            );
        }

        await db.execute(
            `INSERT INTO support_messages (ticket_id, side, author_id, author_name, author_avatar, content)
             VALUES (?, 'staff', ?, ?, NULL, ?)`,
            [id, String(req.session.staff.id), req.session.staff.name, content],
        );
        if (typingState.get(id)) typingState.get(id).staffAt = 0;
        res.json({ success: true });
    } catch (err) {
        console.error('staff post:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Staff explicit claim (also possible without sending a message)
app.post('/api/support/staff/ticket/:id/claim', requireStaff, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [tickets] = await db.execute(
            `SELECT id, status, claimed_by_id, claimed_by_name FROM support_tickets WHERE id = ?`,
            [id],
        );
        if (!tickets.length) return res.status(404).json({ error: 'Ticket introuvable' });
        if (tickets[0].status !== 'open') return res.status(409).json({ error: 'Ticket fermé' });
        if (tickets[0].claimed_by_id === req.session.staff.id) {
            return res.json({ success: true, claimed_by: { id: req.session.staff.id, name: req.session.staff.name } });
        }
        await db.execute(
            `UPDATE support_tickets SET claimed_by_id = ?, claimed_by_name = ?, claimed_at = NOW() WHERE id = ?`,
            [req.session.staff.id, req.session.staff.name, id],
        );
        const isReclaim = !!tickets[0].claimed_by_id;
        await db.execute(
            `INSERT INTO support_messages (ticket_id, side, author_id, author_name, author_avatar, content)
             VALUES (?, 'system', ?, ?, NULL, ?)`,
            [
                id,
                String(req.session.staff.id),
                req.session.staff.name,
                isReclaim
                    ? `${req.session.staff.name} a repris en charge votre ticket (auparavant ${tickets[0].claimed_by_name})`
                    : `${req.session.staff.name} a pris en charge votre ticket`,
            ],
        );
        res.json({ success: true, claimed_by: { id: req.session.staff.id, name: req.session.staff.name } });
    } catch (err) {
        console.error('staff claim:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Staff typing indicator
app.post('/api/support/staff/ticket/:id/typing', requireStaff, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [tickets] = await db.execute(`SELECT status FROM support_tickets WHERE id = ?`, [id]);
        if (!tickets.length || tickets[0].status !== 'open') return res.status(204).end();
        bumpTyping(id, 'staff');
        res.status(204).end();
    } catch {
        res.status(204).end();
    }
});

// Staff closes a ticket
app.post('/api/support/staff/ticket/:id/close', requireStaff, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [tickets] = await db.execute(`SELECT id, status FROM support_tickets WHERE id = ?`, [id]);
        if (!tickets.length) return res.status(404).json({ error: 'Ticket introuvable' });
        if (tickets[0].status === 'closed') return res.json({ success: true });
        await db.execute(`UPDATE support_tickets SET status = 'closed', closed_at = NOW() WHERE id = ?`, [id]);
        await db.execute(
            `INSERT INTO support_messages (ticket_id, side, author_id, author_name, author_avatar, content)
             VALUES (?, 'staff', ?, ?, NULL, ?)`,
            [id, String(req.session.staff.id), req.session.staff.name, '[Ticket fermé par le staff]'],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('staff close:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Admin: manage staff keys ──────────────────────────────────────────

app.get('/api/admin/support/keys', checkAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, created_at, last_used_at, revoked FROM support_staff_keys ORDER BY id DESC`,
        );
        res.json({ keys: rows });
    } catch (err) {
        console.error('admin list keys:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/support/keys', checkAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 64);
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    try {
        const key = `sup_${crypto.randomBytes(24).toString('hex')}`;
        const hash = hashSupportKey(key);
        const [r] = await db.execute(
            `INSERT INTO support_staff_keys (name, key_hash) VALUES (?, ?)`,
            [name, hash],
        );
        await logAdminAction(req, 'support.key.create', null, { name, keyId: r.insertId });
        // Return the plaintext key ONCE — never again retrievable.
        res.json({ id: r.insertId, name, key });
    } catch (err) {
        console.error('admin create key:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/support/keys/:id/revoke', checkAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        await db.execute(`UPDATE support_staff_keys SET revoked = 1 WHERE id = ?`, [id]);
        await logAdminAction(req, 'support.key.revoke', null, { keyId: id });
        res.json({ success: true });
    } catch (err) {
        console.error('admin revoke key:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Shardtown accounts (email + pseudo + password) ───────────────────
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let mailer = null;
function getMailer() {
    if (mailer) return mailer;
    if (!process.env.SMTP_HOST) return null;
    mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
    });
    return mailer;
}

async function sendVerificationEmail(account, code) {
    const m = getMailer();
    const subject = `Ton code Shardtown : ${code}`;
    const text = `Salut ${account.pseudo},\n\nTon code de vérification Shardtown : ${code}\n\nValable 15 minutes. Si tu n'es pas à l'origine de cette inscription, ignore ce message.\n\n— Shardtown`;
    const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:40px;text-align:center">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;letter-spacing:-0.02em">Salut ${account.pseudo} 👋</h1>
    <p style="margin:0 0 28px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.5">
      Pour finaliser ton inscription sur Shardtown, entre ce code dans la page de vérification :
    </p>
    <div style="font-size:36px;font-weight:800;letter-spacing:0.4em;background:#000;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;margin-bottom:28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff">${code}</div>
    <p style="margin:0;color:rgba(255,255,255,0.4);font-size:13px;line-height:1.5">
      Code valable 15 minutes. Si tu n'es pas à l'origine de cette inscription, ignore ce message.
    </p>
  </div>
  <p style="text-align:center;margin:24px 0 0;color:rgba(255,255,255,0.3);font-size:11px">— L'équipe Shardtown</p>
</div>`;
    if (!m) {
        console.warn('[mailer] SMTP non configuré — code loggé en console');
        console.warn(`[mailer] Pour ${account.email}: ${code}`);
        return;
    }
    try {
        await m.sendMail({
            from: process.env.SMTP_FROM || '"Shardtown" <noreply@shardtwn.fr>',
            to: account.email,
            subject, text, html,
        });
    } catch (e) {
        console.error('[mailer]', e.message);
        console.warn(`[mailer] Fallback log — ${account.email}: ${code}`);
    }
}

function generateVerificationCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function newCaptcha() {
    const cg = new CaptchaGenerator({ height: 100, width: 280 });
    cg.setBackground();
    cg.setDecoy({ opacity: 0.5, total: 12 });
    cg.setTrace();
    cg.setCaptcha({ size: 50 });
    const buffer = cg.generateSync();
    const text = cg.text;
    return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}`, answer: text };
}

const accountAuthLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
const accountSignupLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

function publicAccount(a) {
    if (!a) return null;
    return {
        id: a.id,
        email: a.email,
        email_verified: !!a.email_verified,
        pseudo: a.pseudo,
        discord_id: a.discord_id || null,
        discord_username: a.discord_username || null,
        discord_avatar: a.discord_avatar || null,
        oauth_google_id: a.oauth_google_id || null,
        oauth_google_email: a.oauth_google_email || null,
        oauth_github_id: a.oauth_github_id || null,
        oauth_github_username: a.oauth_github_username || null,
        created_at: a.created_at,
    };
}

// Captcha — issues an image + an opaque ID; the answer is stashed in
// the session and consumed once on signup/login. New call replaces any
// previous captcha for this session.
app.get('/api/account/captcha', (req, res) => {
    const c = newCaptcha();
    req.session.captcha = {
        answer: c.answer,
        expiresAt: Date.now() + 5 * 60_000,
    };
    res.json({ image: c.dataUrl });
});

function consumeCaptcha(req, submitted) {
    const c = req.session.captcha;
    if (!c) return false;
    if (Date.now() > c.expiresAt) { req.session.captcha = null; return false; }
    const ok = String(submitted || '').trim().toLowerCase() === String(c.answer || '').toLowerCase();
    req.session.captcha = null;
    return ok;
}

// ─── ShardSecure — case à cocher anti-bot léger ────────────────────────
// Token de session, validé après un délai minimum + même origine
const shardSecureLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const SHARDSECURE_MIN_MS = 600;
const SHARDSECURE_TTL_MS = 5 * 60_000;

app.post('/api/account/shardsecure', shardSecureLimiter, (req, res) => {
    const honeypot = String(req.body?.website || '').trim();
    if (honeypot) return res.status(400).json({ error: 'Bot détecté' });

    const issuedAt = req.session.shardSecureIssuedAt || 0;
    if (issuedAt && Date.now() - issuedAt < SHARDSECURE_MIN_MS) {
        return res.status(400).json({ error: 'Trop rapide' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    req.session.shardSecure = { token, expiresAt: Date.now() + SHARDSECURE_TTL_MS };
    req.session.shardSecureIssuedAt = Date.now();
    res.json({ token, expiresIn: SHARDSECURE_TTL_MS });
});

function consumeShardSecure(req, submitted) {
    const s = req.session.shardSecure;
    if (!s) return false;
    if (Date.now() > s.expiresAt) { req.session.shardSecure = null; return false; }
    const ok = typeof submitted === 'string' && submitted.length === 48 && submitted === s.token;
    req.session.shardSecure = null;
    return ok;
}

// Signup
app.post('/api/account/signup', accountSignupLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const pseudo = String(req.body?.pseudo || '').trim();
    const password = String(req.body?.password || '');
    const shardSecure = String(req.body?.shardSecure || req.body?.captcha || '');
    const honeypot = String(req.body?.website || '').trim();

    if (honeypot) return res.status(400).json({ error: 'Vérification anti-bot échouée' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        return res.status(400).json({ error: 'Email invalide' });
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(pseudo))
        return res.status(400).json({ error: 'Pseudo : 3-32 caractères, lettres/chiffres/._-' });
    if (password.length < 8 || password.length > 200)
        return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
    if (!consumeShardSecure(req, shardSecure))
        return res.status(400).json({ error: 'Vérification ShardSecure expirée ou invalide' });

    try {
        const [byEmail] = await db.execute('SELECT id FROM accounts WHERE email = ? LIMIT 1', [email]);
        if (byEmail.length) return res.status(409).json({ error: 'Email déjà utilisé' });
        const [byPseudo] = await db.execute('SELECT id FROM accounts WHERE pseudo = ? LIMIT 1', [pseudo]);
        if (byPseudo.length) return res.status(409).json({ error: 'Pseudo déjà pris' });

        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPassword(password, salt);
        const [insert] = await db.execute(
            `INSERT INTO accounts (email, pseudo, password_hash, password_salt) VALUES (?, ?, ?, ?)`,
            [email, pseudo, hash, salt],
        );
        const accountId = insert.insertId;

        const code = generateVerificationCode();
        const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
        await db.execute(
            `INSERT INTO account_tokens (account_id, type, token_hash, expires_at)
             VALUES (?, 'email_verify', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
            [accountId, tokenHash],
        );
        await sendVerificationEmail({ email, pseudo }, code);

        res.json({ success: true, pendingVerification: true, email });
    } catch (err) {
        console.error('signup:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Login
app.post('/api/account/login', accountAuthLimiter, async (req, res) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase(); // email or pseudo
    const password = String(req.body?.password || '');
    const shardSecure = String(req.body?.shardSecure || req.body?.captcha || '');
    const honeypot = String(req.body?.website || '').trim();
    if (honeypot) return res.status(400).json({ error: 'Vérification anti-bot échouée' });
    if (!identifier || !password) return res.status(400).json({ error: 'Identifiants requis' });
    if (!consumeShardSecure(req, shardSecure)) return res.status(400).json({ error: 'Vérification ShardSecure expirée ou invalide' });

    try {
        const [rows] = await db.execute(
            `SELECT * FROM accounts WHERE email = ? OR pseudo = ? LIMIT 1`,
            [identifier, identifier],
        );
        const a = rows[0];
        if (!a) return res.status(401).json({ error: 'Identifiants invalides' });
        const test = hashPassword(password, a.password_salt);
        const stored = Buffer.from(a.password_hash, 'hex');
        const computed = Buffer.from(test, 'hex');
        if (stored.length !== computed.length || !crypto.timingSafeEqual(stored, computed)) {
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        if (!a.email_verified) {
            // Générer + envoyer un nouveau code à la volée
            await db.execute(
                `UPDATE account_tokens SET used_at = NOW()
                 WHERE account_id = ? AND type = 'email_verify' AND used_at IS NULL`,
                [a.id]
            );
            const code = generateVerificationCode();
            const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
            await db.execute(
                `INSERT INTO account_tokens (account_id, type, token_hash, expires_at)
                 VALUES (?, 'email_verify', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
                [a.id, tokenHash],
            );
            try { await sendVerificationEmail(a, code); }
            catch (e) { console.error('resend on login failed:', e.message); }
            return res.status(403).json({
                pendingVerification: true,
                email: a.email,
                error: 'Email non vérifié — un nouveau code a été envoyé.'
            });
        }
        await db.execute('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [a.id]);
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'Erreur serveur' });
            req.session.account = { id: a.id, loginAt: Date.now() };
            res.json({ account: publicAccount(a) });
        });
    } catch (err) {
        console.error('login:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/account/logout', (req, res) => {
    if (req.session) req.session.account = null;
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/account/me', async (req, res) => {
    if (!req.session?.account?.id) return res.json({ account: null });
    try {
        const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ? LIMIT 1', [req.session.account.id]);
        if (!rows[0]) {
            req.session.account = null;
            return res.json({ account: null });
        }
        res.json({ account: publicAccount(rows[0]) });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Email verification by 6-digit code (POST { email, code })
app.post('/api/account/verify-email-code', accountAuthLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!email) return res.status(400).json({ error: 'Email requis' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Code invalide (6 chiffres)' });
    try {
        const [accs] = await db.execute(
            'SELECT id, email, pseudo, email_verified FROM accounts WHERE email = ? LIMIT 1',
            [email]
        );
        const a = accs[0];
        if (!a) return res.status(400).json({ error: 'Compte introuvable' });
        if (a.email_verified) return res.status(400).json({ error: 'Email déjà vérifié' });

        const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
        const [toks] = await db.execute(
            `SELECT id, expires_at, used_at FROM account_tokens
             WHERE account_id = ? AND type = 'email_verify' AND token_hash = ? LIMIT 1`,
            [a.id, tokenHash]
        );
        const tok = toks[0];
        if (!tok) return res.status(401).json({ error: 'Code incorrect' });
        if (tok.used_at) return res.status(400).json({ error: 'Code déjà utilisé' });
        if (new Date(tok.expires_at) < new Date()) return res.status(400).json({ error: 'Code expiré' });

        await db.execute('UPDATE accounts SET email_verified = 1, last_login_at = NOW() WHERE id = ?', [a.id]);
        await db.execute('UPDATE account_tokens SET used_at = NOW() WHERE id = ?', [tok.id]);

        // Connecte directement après vérification
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'Erreur serveur' });
            req.session.account = { id: a.id, loginAt: Date.now() };
            res.json({ success: true, account: { id: a.id, email: a.email, pseudo: a.pseudo, email_verified: true } });
        });
    } catch (err) {
        console.error('verify-email-code:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Email verification — token comes via URL, consumed once (legacy)
app.get('/api/account/verify-email', async (req, res) => {
    const raw = String(req.query.token || '');
    if (!raw) return res.status(400).json({ error: 'Token manquant' });
    try {
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
        const [rows] = await db.execute(
            `SELECT t.id, t.account_id, t.expires_at, t.used_at FROM account_tokens t
             WHERE t.token_hash = ? AND t.type = 'email_verify' LIMIT 1`,
            [tokenHash],
        );
        const tok = rows[0];
        if (!tok) return res.status(400).json({ error: 'Token invalide' });
        if (tok.used_at) return res.status(400).json({ error: 'Token déjà utilisé' });
        if (new Date(tok.expires_at) < new Date()) return res.status(400).json({ error: 'Token expiré' });
        await db.execute('UPDATE accounts SET email_verified = 1 WHERE id = ?', [tok.account_id]);
        await db.execute('UPDATE account_tokens SET used_at = NOW() WHERE id = ?', [tok.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('verify-email:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Discord linking (phase 2) ─────────────────────────────────────────
// The user is logged into a Shardtown account; we redirect them through
// Discord OAuth (identify+guilds), exchange the code, persist the
// access/refresh tokens and the cached guild list on their account row.
const DISCORD_LINK_REDIRECT = (process.env.APP_URL || 'http://localhost:3000') + '/api/account/discord/callback';

function requireAccount(req, res, next) {
    if (req.session?.account?.id) return next();
    res.status(401).json({ error: 'Non authentifié' });
}

app.get('/api/account/discord/link', requireAccount, (req, res) => {
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
        return res.status(503).send('Discord OAuth non configuré');
    }
    const state = crypto.randomBytes(24).toString('hex');
    req.session.discordLinkState = state;
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: DISCORD_LINK_REDIRECT,
        response_type: 'code',
        scope: 'identify guilds',
        state,
        prompt: 'consent',
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

async function fetchDiscordGuildsFor(accessToken) {
    const r = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
    });
    return r.data;
}

app.get('/api/account/discord/callback', async (req, res) => {
    if (!req.session?.account?.id) return res.redirect('/account/login');
    const state = String(req.query.state || '');
    if (!state || state !== req.session.discordLinkState) {
        req.session.discordLinkState = null;
        return res.redirect('/account?linked=error&reason=state');
    }
    req.session.discordLinkState = null;
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/account?linked=error&reason=code');

    try {
        // Exchange the code for an access token
        const tokenRes = await axios.post(
            'https://discord.com/api/v10/oauth2/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: DISCORD_LINK_REDIRECT,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
        );
        const { access_token, refresh_token, expires_in } = tokenRes.data;
        const meRes = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
            timeout: 5000,
        });
        const me = meRes.data;
        let guilds = [];
        try { guilds = await fetchDiscordGuildsFor(access_token); } catch { /* will retry from /account */ }

        // Reject if this Discord account is already linked to a different Shardtown account
        const [otherRows] = await db.execute(
            'SELECT id FROM accounts WHERE discord_id = ? AND id <> ? LIMIT 1',
            [me.id, req.session.account.id],
        );
        if (otherRows.length) {
            return res.redirect('/account?linked=error&reason=already_linked');
        }

        await db.execute(
            `UPDATE accounts SET
                discord_id = ?,
                discord_username = ?,
                discord_avatar = ?,
                discord_linked_at = NOW(),
                discord_access_token = ?,
                discord_refresh_token = ?,
                discord_token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                discord_guilds_json = ?,
                discord_guilds_fetched_at = NOW()
             WHERE id = ?`,
            [
                me.id,
                me.username,
                me.avatar || null,
                access_token,
                refresh_token,
                Math.max(60, parseInt(expires_in, 10) || 0),
                JSON.stringify(guilds),
                req.session.account.id,
            ],
        );
        res.redirect('/account?linked=ok');
    } catch (err) {
        console.error('discord link callback:', err.response?.data || err.message);
        res.redirect('/account?linked=error&reason=exchange');
    }
});

// ─── OAuth: Google + GitHub ─────────────────────────────────────────────
// Two flows: link-while-logged-in, OR sign-in / auto-create-account.
// Provider profile data is fetched after the token exchange and used
// for both linking and account creation.

const OAUTH_CONFIGS = {
    google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
        scope: 'openid email profile',
        clientIdEnv: 'GOOGLE_CLIENT_ID',
        clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
        idColumn: 'oauth_google_id',
        labelColumn: 'oauth_google_email',
        async fetchProfile(accessToken) {
            const r = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 8000,
            });
            return {
                providerId: String(r.data.sub),
                email: r.data.email_verified ? r.data.email : null,
                username: r.data.name || r.data.email?.split('@')[0] || null,
            };
        },
    },
    github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userinfoUrl: 'https://api.github.com/user',
        scope: 'read:user user:email',
        clientIdEnv: 'GITHUB_CLIENT_ID',
        clientSecretEnv: 'GITHUB_CLIENT_SECRET',
        idColumn: 'oauth_github_id',
        labelColumn: 'oauth_github_username',
        async fetchProfile(accessToken) {
            const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'shardtown', Accept: 'application/vnd.github+json' };
            const [meRes, emailsRes] = await Promise.all([
                axios.get('https://api.github.com/user', { headers, timeout: 8000 }),
                axios.get('https://api.github.com/user/emails', { headers, timeout: 8000, validateStatus: s => s === 200 || s === 401 || s === 403 }),
            ]);
            let email = meRes.data.email || null;
            if (Array.isArray(emailsRes.data)) {
                const primary = emailsRes.data.find(e => e.primary && e.verified);
                if (primary) email = primary.email;
            }
            return {
                providerId: String(meRes.data.id),
                email,
                username: meRes.data.login || meRes.data.name || null,
            };
        },
    },
};

function oauthRedirect(provider) {
    return `${(process.env.APP_URL || 'http://localhost:3000')}/api/account/oauth/${provider}/callback`;
}

app.get('/api/account/oauth/:provider', (req, res) => {
    const cfg = OAUTH_CONFIGS[req.params.provider];
    if (!cfg) return res.status(404).send('Provider inconnu');
    const clientId = process.env[cfg.clientIdEnv];
    if (!clientId) return res.status(503).send(`${req.params.provider} OAuth non configuré`);

    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = { provider: req.params.provider, state };
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: oauthRedirect(req.params.provider),
        response_type: 'code',
        scope: cfg.scope,
        state,
        ...(req.params.provider === 'google' ? { prompt: 'select_account', access_type: 'online' } : {}),
    });
    res.redirect(`${cfg.authUrl}?${params}`);
});

async function uniquePseudo(seed) {
    let base = String(seed || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24);
    if (base.length < 3) base = `user${Date.now().toString().slice(-6)}`;
    for (let i = 0; i < 200; i++) {
        const candidate = i === 0 ? base : `${base}${i}`;
        const [c] = await db.execute('SELECT id FROM accounts WHERE pseudo = ? LIMIT 1', [candidate]);
        if (!c.length) return candidate;
    }
    return `user${Date.now()}`;
}

app.get('/api/account/oauth/:provider/callback', async (req, res) => {
    const provider = req.params.provider;
    const cfg = OAUTH_CONFIGS[provider];
    if (!cfg) return res.redirect('/account/login?oauth=error&reason=provider');
    const clientId = process.env[cfg.clientIdEnv];
    const clientSecret = process.env[cfg.clientSecretEnv];
    if (!clientId || !clientSecret) return res.redirect('/account/login?oauth=error&reason=config');

    // Verify state
    const expected = req.session.oauthState;
    if (!expected || expected.provider !== provider || expected.state !== req.query.state) {
        req.session.oauthState = null;
        return res.redirect('/account/login?oauth=error&reason=state');
    }
    req.session.oauthState = null;
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/account/login?oauth=error&reason=code');

    let profile;
    try {
        const tokenRes = await axios.post(
            cfg.tokenUrl,
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: oauthRedirect(provider),
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                timeout: 8000,
            },
        );
        profile = await cfg.fetchProfile(tokenRes.data.access_token);
    } catch (err) {
        console.error(`[oauth:${provider}]`, err.response?.data || err.message);
        return res.redirect('/account/login?oauth=error&reason=exchange');
    }

    if (!profile.providerId) return res.redirect('/account/login?oauth=error&reason=profile');

    try {
        // Linking branch
        if (req.session?.account?.id) {
            const [other] = await db.execute(
                `SELECT id FROM accounts WHERE ${cfg.idColumn} = ? AND id <> ? LIMIT 1`,
                [profile.providerId, req.session.account.id],
            );
            if (other.length) return res.redirect(`/account?oauth=${provider}_taken`);
            await db.execute(
                `UPDATE accounts SET ${cfg.idColumn} = ?, ${cfg.labelColumn} = ? WHERE id = ?`,
                [profile.providerId, profile.email || profile.username || null, req.session.account.id],
            );
            return res.redirect(`/account?oauth=${provider}_linked`);
        }

        // Sign-in branch
        let [matchByProvider] = await db.execute(
            `SELECT * FROM accounts WHERE ${cfg.idColumn} = ? LIMIT 1`,
            [profile.providerId],
        );
        let account = matchByProvider[0];

        if (!account && profile.email) {
            const [matchByEmail] = await db.execute(
                'SELECT * FROM accounts WHERE email = ? LIMIT 1',
                [profile.email.toLowerCase()],
            );
            if (matchByEmail.length) {
                account = matchByEmail[0];
                await db.execute(
                    `UPDATE accounts SET ${cfg.idColumn} = ?, ${cfg.labelColumn} = ? WHERE id = ?`,
                    [profile.providerId, profile.email || profile.username || null, account.id],
                );
            }
        }

        if (!account) {
            // Create a new account, auto-verified email since the provider already verified it
            if (!profile.email) return res.redirect('/account/login?oauth=error&reason=no_email');
            const pseudo = await uniquePseudo(profile.username || profile.email.split('@')[0]);
            const salt = crypto.randomBytes(16).toString('hex');
            const randomPwd = crypto.randomBytes(32).toString('hex');
            const hash = hashPassword(randomPwd, salt);
            const [insert] = await db.execute(
                `INSERT INTO accounts
                  (email, email_verified, pseudo, password_hash, password_salt, ${cfg.idColumn}, ${cfg.labelColumn})
                 VALUES (?, 1, ?, ?, ?, ?, ?)`,
                [profile.email.toLowerCase(), pseudo, hash, salt, profile.providerId, profile.email || profile.username || null],
            );
            const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ?', [insert.insertId]);
            account = rows[0];
        }

        await db.execute('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);
        req.session.regenerate(err => {
            if (err) return res.redirect('/account/login?oauth=error&reason=session');
            req.session.account = { id: account.id, loginAt: Date.now() };
            res.redirect('/account');
        });
    } catch (err) {
        console.error(`[oauth:${provider}] post-token`, err.message);
        res.redirect('/account/login?oauth=error&reason=db');
    }
});

app.post('/api/account/oauth/:provider/unlink', requireAccount, async (req, res) => {
    const cfg = OAUTH_CONFIGS[req.params.provider];
    if (!cfg) return res.status(404).json({ error: 'Provider inconnu' });
    try {
        await db.execute(
            `UPDATE accounts SET ${cfg.idColumn} = NULL, ${cfg.labelColumn} = NULL WHERE id = ?`,
            [req.session.account.id],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('oauth unlink:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── Passkeys / WebAuthn ────────────────────────────────────────────────
function rpInfo() {
    const url = new URL(process.env.APP_URL || 'http://localhost:3000');
    return { rpName: 'Shardtown', rpID: url.hostname, expectedOrigin: url.origin };
}

function b64uToBuffer(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64u.length + (4 - b64u.length % 4) % 4, '=');
    return Buffer.from(b64, 'base64');
}
function bufferToB64u(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// List + delete (account-scoped)
app.get('/api/account/passkeys', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, transports, created_at, last_used_at
             FROM account_passkeys WHERE account_id = ? ORDER BY id DESC`,
            [req.session.account.id],
        );
        res.json({ passkeys: rows });
    } catch (err) {
        console.error('list passkeys:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/account/passkeys/:id', requireAccount, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        await db.execute('DELETE FROM account_passkeys WHERE id = ? AND account_id = ?', [id, req.session.account.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('delete passkey:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Registration ──
app.post('/api/account/passkey/register-begin', requireAccount, async (req, res) => {
    try {
        const [accs] = await db.execute('SELECT id, pseudo, email FROM accounts WHERE id = ?', [req.session.account.id]);
        const a = accs[0];
        if (!a) return res.status(404).json({ error: 'Compte introuvable' });

        const [existing] = await db.execute(
            'SELECT credential_id, transports FROM account_passkeys WHERE account_id = ?',
            [a.id],
        );
        const { rpName, rpID } = rpInfo();
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: a.email,
            userID: Buffer.from(`shardtown:${a.id}`),
            userDisplayName: a.pseudo,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
            excludeCredentials: existing.map(c => ({
                id: c.credential_id,
                transports: c.transports ? c.transports.split(',') : undefined,
            })),
        });
        req.session.passkeyRegChallenge = options.challenge;
        res.json(options);
    } catch (err) {
        console.error('passkey register begin:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/account/passkey/register-complete', requireAccount, async (req, res) => {
    const expectedChallenge = req.session.passkeyRegChallenge;
    if (!expectedChallenge) return res.status(400).json({ error: 'Pas de challenge en cours' });
    req.session.passkeyRegChallenge = null;

    const name = String(req.body?.name || '').trim().slice(0, 64) || 'Clé sans nom';
    const response = req.body?.response;
    if (!response) return res.status(400).json({ error: 'Réponse manquante' });

    try {
        const { rpID, expectedOrigin } = rpInfo();
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: false,
        });
        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ error: 'Vérification échouée' });
        }
        const { credential, credentialBackedUp } = verification.registrationInfo;
        const credentialID = credential.id;
        const credentialPublicKey = credential.publicKey;
        const counter = credential.counter ?? 0;
        const transports = (response.response?.transports || []).filter(Boolean).join(',') || null;

        await db.execute(
            `INSERT INTO account_passkeys
              (account_id, credential_id, public_key, counter, name, transports)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.session.account.id,
                typeof credentialID === 'string' ? credentialID : bufferToB64u(credentialID),
                bufferToB64u(credentialPublicKey),
                counter,
                name,
                transports,
            ],
        );
        res.json({ success: true, backed_up: !!credentialBackedUp });
    } catch (err) {
        console.error('passkey register complete:', err.message);
        res.status(500).json({ error: err.message || 'Erreur serveur' });
    }
});

// ── Authentication ──
// User supplies their identifier so we can scope allowed credentials.
app.post('/api/account/passkey/auth-begin', accountAuthLimiter, async (req, res) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    if (!identifier) return res.status(400).json({ error: 'Identifiant requis' });
    try {
        const [accs] = await db.execute(
            'SELECT id FROM accounts WHERE email = ? OR pseudo = ? LIMIT 1',
            [identifier, identifier],
        );
        const a = accs[0];
        // Always 200 with a generic challenge to avoid user enumeration
        const { rpID } = rpInfo();
        let allowCredentials = [];
        if (a) {
            const [creds] = await db.execute(
                'SELECT credential_id, transports FROM account_passkeys WHERE account_id = ?',
                [a.id],
            );
            allowCredentials = creds.map(c => ({
                id: c.credential_id,
                transports: c.transports ? c.transports.split(',') : undefined,
            }));
        }
        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });
        req.session.passkeyAuthChallenge = { challenge: options.challenge, accountId: a?.id || null };
        res.json(options);
    } catch (err) {
        console.error('passkey auth begin:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/account/passkey/auth-complete', accountAuthLimiter, async (req, res) => {
    const stored = req.session.passkeyAuthChallenge;
    if (!stored?.challenge) return res.status(400).json({ error: 'Pas de challenge en cours' });
    req.session.passkeyAuthChallenge = null;

    const response = req.body?.response;
    if (!response?.id) return res.status(400).json({ error: 'Réponse manquante' });

    try {
        const [creds] = await db.execute(
            `SELECT p.id, p.account_id, p.credential_id, p.public_key, p.counter, p.transports
             FROM account_passkeys p WHERE p.credential_id = ? LIMIT 1`,
            [response.id],
        );
        const cred = creds[0];
        if (!cred) return res.status(401).json({ error: 'Clé inconnue' });
        if (stored.accountId && stored.accountId !== cred.account_id) {
            return res.status(401).json({ error: 'Clé non autorisée' });
        }

        const { rpID, expectedOrigin } = rpInfo();
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: stored.challenge,
            expectedOrigin,
            expectedRPID: rpID,
            credential: {
                id: cred.credential_id,
                publicKey: b64uToBuffer(cred.public_key),
                counter: Number(cred.counter) || 0,
                transports: cred.transports ? cred.transports.split(',') : undefined,
            },
            requireUserVerification: false,
        });
        if (!verification.verified) return res.status(401).json({ error: 'Vérification échouée' });

        const newCounter = verification.authenticationInfo?.newCounter ?? cred.counter;
        await db.execute(
            'UPDATE account_passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?',
            [newCounter, cred.id],
        );

        const [accs] = await db.execute('SELECT * FROM accounts WHERE id = ?', [cred.account_id]);
        const account = accs[0];
        if (!account) return res.status(401).json({ error: 'Compte introuvable' });
        if (!account.email_verified) return res.status(403).json({ error: 'Email non vérifié' });

        await db.execute('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'Erreur serveur' });
            req.session.account = { id: account.id, loginAt: Date.now() };
            res.json({ account: publicAccount(account) });
        });
    } catch (err) {
        console.error('passkey auth complete:', err.message);
        res.status(500).json({ error: err.message || 'Erreur serveur' });
    }
});

app.post('/api/account/discord/unlink', requireAccount, async (req, res) => {
    try {
        await db.execute(
            `UPDATE accounts SET
                discord_id = NULL, discord_username = NULL, discord_avatar = NULL,
                discord_linked_at = NULL, discord_access_token = NULL,
                discord_refresh_token = NULL, discord_token_expires_at = NULL,
                discord_guilds_json = NULL, discord_guilds_fetched_at = NULL
             WHERE id = ?`,
            [req.session.account.id],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('discord unlink:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Manual refresh of the cached guild list (calls Discord with the
// stored access token, refreshes if expired)
app.post('/api/account/discord/refresh-guilds', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, discord_access_token, discord_refresh_token, discord_token_expires_at
             FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a || !a.discord_access_token) return res.status(400).json({ error: 'Aucun Discord lié' });
        let token = a.discord_access_token;
        const expired = a.discord_token_expires_at && new Date(a.discord_token_expires_at) < new Date();
        if (expired && a.discord_refresh_token) {
            const refreshed = await axios.post(
                'https://discord.com/api/v10/oauth2/token',
                new URLSearchParams({
                    client_id: process.env.CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: a.discord_refresh_token,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
            );
            token = refreshed.data.access_token;
            await db.execute(
                `UPDATE accounts SET discord_access_token = ?, discord_refresh_token = ?,
                  discord_token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?`,
                [
                    refreshed.data.access_token,
                    refreshed.data.refresh_token,
                    Math.max(60, parseInt(refreshed.data.expires_in, 10) || 0),
                    a.id,
                ],
            );
        }
        const guilds = await fetchDiscordGuildsFor(token);
        await db.execute(
            'UPDATE accounts SET discord_guilds_json = ?, discord_guilds_fetched_at = NOW() WHERE id = ?',
            [JSON.stringify(guilds), a.id],
        );
        res.json({ success: true, guilds_count: guilds.length });
    } catch (err) {
        console.error('refresh-guilds:', err.response?.data || err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Re-send verification email if the user lost it
const RESEND_COOLDOWN_MS = 60_000;
app.post('/api/account/resend-verification', accountAuthLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email requis' });
    try {
        const [rows] = await db.execute('SELECT id, email, pseudo, email_verified FROM accounts WHERE email = ? LIMIT 1', [email]);
        const a = rows[0];
        // Always 200 to avoid email enumeration
        if (!a || a.email_verified) return res.json({ success: true });

        // Cooldown : refuse si un code a été émis il y a moins de 60s
        const [last] = await db.execute(
            `SELECT created_at FROM account_tokens
             WHERE account_id = ? AND type = 'email_verify'
             ORDER BY id DESC LIMIT 1`,
            [a.id]
        );
        if (last[0]) {
            const elapsed = Date.now() - new Date(last[0].created_at).getTime();
            if (elapsed < RESEND_COOLDOWN_MS) {
                const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
                return res.status(429).json({ error: `Patiente ${wait}s avant un nouveau code.`, retryAfter: wait });
            }
        }

        // Invalider les codes précédents pour cet account
        await db.execute(
            `UPDATE account_tokens SET used_at = NOW()
             WHERE account_id = ? AND type = 'email_verify' AND used_at IS NULL`,
            [a.id]
        );
        const code = generateVerificationCode();
        const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
        await db.execute(
            `INSERT INTO account_tokens (account_id, type, token_hash, expires_at)
             VALUES (?, 'email_verify', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
            [a.id, tokenHash],
        );
        await sendVerificationEmail(a, code);
        res.json({ success: true });
    } catch (err) {
        console.error('resend:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
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

        // Discord OAuth doesn't include `email` in the `identify` scope by
        // default, so this is usually undefined. Validate strictly anyway:
        // the value is attacker-controllable (Discord profile email) and
        // Stripe will accept any string. Only forward something that
        // actually looks like an email and is not absurdly long.
        const rawEmail = typeof req.user?.email === 'string' ? req.user.email.trim() : '';
        const safeEmail = rawEmail.length > 0 && rawEmail.length <= 254
            && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
            ? rawEmail
            : undefined;

        const session = await stripe.checkout.sessions.create({
            mode: isMonthly ? 'subscription' : 'payment',
            line_items: [{ price_data: priceData, quantity: 1 }],
            metadata: { guildId, guildName: userGuild.name, plan: planChoice },
            ...(isMonthly ? { subscription_data: { metadata: { guildId, guildName: userGuild.name, plan: planChoice } } } : {}),
            customer_email: safeEmail,
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

// Legacy Discord-only login is removed — visitors must register a
// Shardtown account at /account/signup and link Discord from /account.
// Kept as redirects for any old bookmark or email link.
app.get('/login', (req, res) => res.redirect('/account/login'));
app.get('/callback', (req, res) => res.redirect('/account/login'));
app.get('/logout', (req, res) => {
    req.logout?.(() => req.session.destroy(() => res.redirect('/')));
});

// Migrated to React SPA
// Legacy redirect — the EJS dashboard template was removed (its
// build sites used innerHTML with audit-log fields and would have
// reintroduced stored-XSS sinks). The React SPA handles /dashboard.
app.get('/_legacy/dashboard', (req, res) => res.redirect('/dashboard'));

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
        res.status(500).json({ success: false, error: 'Erreur serveur' });
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
        res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' });
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
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' }); }
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
    const shuffled = cryptoShuffle(entries);
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

app.delete('/shard/guild/:guildID/scheduled/:id', checkAuthShard, async (req, res) => {
    const { guildID, id } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_scheduled WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
        const safeKeys = Object.keys(config).filter(isSafeColumnName);
        if (safeKeys.length === 0) return res.json({ success: true });
        const cols = safeKeys.map(k => `\`${k}\` = ?`).join(', ');
        const vals = safeKeys.map(k => config[k]);
        await db.execute(`UPDATE settings SET ${cols} WHERE guildId = ?`, [...vals, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
        const safeKeys = Object.keys(config).filter(isSafeColumnName);
        if (safeKeys.length === 0) return res.json({ success: true });
        const cols = safeKeys.map(k => `\`${k}\` = ?`).join(', ');
        const vals = safeKeys.map(k => config[k]);
        await db.execute(`UPDATE shard_settings SET ${cols} WHERE guildId = ?`, [...vals, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

app.delete('/shard/guild/:guildID/shop/:id', checkAuthShard, async (req, res) => {
    const { guildID, id } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && ((g.permissions & 0x8) === 0x8 || g.owner));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_shop WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

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

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur sauvegarde MySQL:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
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
// The non-/api guild routes (config save, giveaway/poll/scheduled
// creation, etc.) write to Discord and were previously unrate-limited.
// Each successful call hits the Discord API at least once, so an
// authenticated attacker could spam them to either bloat the audit log
// or get the bot token rate-limited globally by Discord.
app.use('/shardguard/guild', apiLimiter);
app.use('/shard/guild', apiLimiter);

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
        res.status(500).json({ success: false, error: 'Erreur serveur' });
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
        res.status(500).json({ success: false, error: e.response?.data?.message || 'Erreur serveur' });
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
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
                lastError = e.response?.data?.message || 'Erreur serveur';
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
                lastError = e.response?.data?.message || 'Erreur serveur';
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
        res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' });
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
    return timingSafeEqual(String(input || ''), fallback);
}

// Boot-time check: warn loudly if the admin password is sitting in
// plaintext in the env. We don't refuse to start (would brick existing
// deployments) but the warning is unmissable in PM2 logs and we log
// the migration command so the operator can fix it in seconds.
(function checkAdminPasswordHardening() {
    const hasHash = process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD_HASH.includes(':');
    const hasPlaintext = !!process.env.ADMIN_PASSWORD;
    if (!hasHash && !hasPlaintext) {
        console.error('❌ Aucun ADMIN_PASSWORD_HASH ni ADMIN_PASSWORD défini — login admin impossible.');
        return;
    }
    if (!hasHash && hasPlaintext) {
        console.warn('━'.repeat(72));
        console.warn('⚠️  ADMIN_PASSWORD est stocké en clair dans l\'environnement.');
        console.warn('   Migre vers ADMIN_PASSWORD_HASH (scrypt salt:hash) :');
        console.warn('   node -e "const c=require(\'crypto\'),s=c.randomBytes(16).toString(\'hex\');' +
            'console.log(s+\':\'+c.scryptSync(process.argv[1],s,64).toString(\'hex\'))" "TON_MOT_DE_PASSE"');
        console.warn('   Puis ajoute ADMIN_PASSWORD_HASH=<résultat> à .env, et supprime ADMIN_PASSWORD.');
        console.warn('━'.repeat(72));
    }
})();

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

// Admin logout — POST so cross-site can't trigger it (`<img src="...">`
// won't fire). The global CSRF guard already requires X-CSRF-Token on
// any non-GET request, so this is automatically protected.
app.post('/admin/logout', (req, res) => {
    if (req.session && req.session.isAdmin) {
        const sid = req.sessionID;
        db.execute('DELETE FROM admin_sessions WHERE sid = ?', [sid]).catch(() => {});
        adminSessionCache.delete(sid);
        logAdminAction(req, 'logout').catch(() => {});
    }
    req.session.destroy(() => res.json({ success: true }));
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

// Aggregated detail page for a single guild — combines Discord data,
// per-bot presence, shard mapping, premium flag, audit logs, warnings.
app.get('/api/admin/guild/:guildId', checkAdmin, async (req, res) => {
    const { guildId } = req.params;
    if (!isValidSnowflake(guildId)) return res.status(400).json({ error: 'Guild ID invalide' });

    try {
        const result = {
            guildId,
            bots: [],
            owner: null,
            recentAuditLogs: [],
            warningsCount: 0,
            blocked: false,
            blocked_at: null,
            blocked_name: null,
        };

        for (const bot of BOTS) {
            const entry = { label: bot.label, present: false };
            try {
                const guildRes = await axios.get(
                    `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
                    {
                        headers: { Authorization: `Bot ${bot.token}` },
                        validateStatus: s => s === 200 || s === 404 || s === 403,
                        timeout: 5000,
                    },
                );
                if (guildRes.status === 200) {
                    entry.present = true;
                    entry.guild = {
                        id: guildRes.data.id,
                        name: guildRes.data.name,
                        icon: guildRes.data.icon,
                        owner_id: guildRes.data.owner_id,
                        member_count: guildRes.data.approximate_member_count ?? null,
                        presence_count: guildRes.data.approximate_presence_count ?? null,
                        verification_level: guildRes.data.verification_level,
                        boost_tier: guildRes.data.premium_tier,
                        boost_count: guildRes.data.premium_subscription_count ?? 0,
                        roles_count: guildRes.data.roles?.length || 0,
                        emoji_count: guildRes.data.emojis?.length || 0,
                        features: guildRes.data.features || [],
                    };

                    // Owner profile (only fetch once)
                    if (!result.owner) {
                        try {
                            const ownerRes = await axios.get(
                                `https://discord.com/api/v10/users/${guildRes.data.owner_id}`,
                                {
                                    headers: { Authorization: `Bot ${bot.token}` },
                                    timeout: 5000,
                                },
                            );
                            result.owner = {
                                id: ownerRes.data.id,
                                username: ownerRes.data.username,
                                global_name: ownerRes.data.global_name || null,
                                avatar: ownerRes.data.avatar || null,
                            };
                        } catch { /* non-fatal */ }
                    }

                    // Shard mapping
                    try {
                        const [rows] = await db.execute(
                            'SELECT shard_id FROM shard_guilds WHERE bot_label = ? AND guild_id = ?',
                            [bot.label, guildId],
                        );
                        if (rows[0]) entry.shardId = rows[0].shard_id;
                    } catch { /* non-fatal */ }

                    // Premium flag
                    try {
                        const table = bot.label === 'ShardGuard' ? 'settings' : 'shard_settings';
                        const [s] = await db.execute(
                            `SELECT isPremium FROM ${table} WHERE guildId = ?`,
                            [guildId],
                        );
                        entry.isPremium = !!s[0]?.isPremium;
                    } catch { /* non-fatal */ }
                }
            } catch { /* network: leave entry.present = false */ }
            result.bots.push(entry);
        }

        const [blockedRows] = await db.execute(
            'SELECT guild_name, blocked_at FROM blocked_guilds WHERE guild_id = ?',
            [guildId],
        );
        if (blockedRows[0]) {
            result.blocked = true;
            result.blocked_name = blockedRows[0].guild_name;
            result.blocked_at = blockedRows[0].blocked_at;
        }

        try {
            const [logs] = await db.execute(
                `SELECT id, userId, username, action, details, timestamp
                 FROM audit_logs WHERE guildId = ? ORDER BY id DESC LIMIT 20`,
                [guildId],
            );
            result.recentAuditLogs = logs;
        } catch { /* non-fatal */ }

        try {
            const [w] = await db.execute(
                'SELECT COUNT(*) as count FROM warnings WHERE guildId = ?',
                [guildId],
            );
            result.warningsCount = w[0]?.count || 0;
        } catch { /* non-fatal */ }

        res.json(result);
    } catch (err) {
        console.error('GET /api/admin/guild:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

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

// Resolve a Discord bot user ID → its config entry. Originally each call
// hit Discord's `/users/@me` once per bot to find a match — N requests
// per admin action. We now warm a `botId → bot` map at first call and
// use it as a static lookup; only one Discord round-trip per bot, ever.
const botIdCache = new Map();
let botIdCacheReady = false;
let botIdCachePromise = null;

async function warmBotIdCache() {
    if (botIdCacheReady) return;
    if (botIdCachePromise) return botIdCachePromise;
    botIdCachePromise = (async () => {
        for (const b of BOTS) {
            if (!b.token) continue;
            try {
                const me = await axios.get('https://discord.com/api/v10/users/@me', {
                    headers: { Authorization: `Bot ${b.token}` },
                    timeout: 5000,
                });
                if (me.data?.id) botIdCache.set(me.data.id, b);
            } catch (e) { console.error('warmBotIdCache:', b.label, e.message); }
        }
        botIdCacheReady = true;
    })();
    await botIdCachePromise;
}

async function resolveBotByBotId(botId) {
    if (!isValidSnowflake(botId)) return null;
    if (!botIdCacheReady) await warmBotIdCache();
    return botIdCache.get(botId) || null;
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
        await logAdminAction(req, 'guild.leave.failed', { botId, guildId }, { error: 'Erreur serveur' });
        res.json({ success: false, error: err.response?.data?.message || 'Erreur serveur' });
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
        await logAdminAction(req, 'guild.block.failed', { botId, guildId }, { error: 'Erreur serveur' });
        res.json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/admin/guild/:guildId/unblock', checkAdmin, verifyCsrf, async (req, res) => {
    const { guildId } = req.params;
    try {
        await db.execute('DELETE FROM blocked_guilds WHERE guild_id = ?', [guildId]);
        await logAdminAction(req, 'guild.unblock', { guildId });
        res.json({ success: true });
    } catch (err) {
        await logAdminAction(req, 'guild.unblock.failed', { guildId }, { error: 'Erreur serveur' });
        res.json({ success: false, error: 'Erreur serveur' });
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

// Global error handler — last line of defense for synchronous throws or
// unhandled promise rejections that bubble up. Always returns a generic
// message; the original error is only logged server-side.
app.use((err, req, res, next) => {
    console.error('[unhandled]', req.method, req.path, err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Erreur serveur' });
});

console.log('Tentative de démarrage du serveur...');
app.listen(PORT, () => console.log(`Tableau de bord démarré sur http://localhost:${PORT}`));