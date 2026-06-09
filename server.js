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
const helmet = require('helmet');
/* ─── TOTP (RFC 6238) — no external dep, pure crypto ──────────────────── */
const _B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totpGenerateSecret() {
    const buf = crypto.randomBytes(20);
    let bits = 0, acc = 0, out = '';
    for (const b of buf) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; out += _B32[(acc >> bits) & 31]; } }
    if (bits) out += _B32[(acc << (5 - bits)) & 31];
    return out;
}
function _b32decode(s) {
    s = s.toUpperCase().replace(/=+$/, '');
    let bits = 0, acc = 0; const out = [];
    for (const c of s) { const v = _B32.indexOf(c); if (v < 0) continue; acc = (acc << 5) | v; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
    return Buffer.from(out);
}
function _totpCode(secret, step) {
    const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
    const h = crypto.createHmac('sha1', _b32decode(secret)).update(msg).digest();
    const off = h[h.length - 1] & 0x0f;
    return String(((h[off] & 0x7f) << 24 | h[off+1] << 16 | h[off+2] << 8 | h[off+3]) % 1_000_000).padStart(6, '0');
}
const authenticator = {
    generateSecret: () => totpGenerateSecret(),
    keyuri: (account, issuer, secret) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`,
    verify: ({ token, secret }) => { const step = Math.floor(Date.now() / 30000); return [-1,0,1].some(d => _totpCode(secret, step+d) === String(token).trim()); },
};
const QRCode = require('qrcode');
const { SHARDTOWN_KNOWLEDGE } = require('./chatbot-knowledge');
const presence = require('./presence');
const { cryptoShuffle, timingSafeEqual, verifyAdminPassword } = require('./lib/security');
const apns = require('./lib/apns');
const customBotManager = require('./lib/customBotManager');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('❌ SESSION_SECRET manquant ou trop court (>=32 chars requis).');
    process.exit(1);
}

// CSP is disabled because the app serves a mix of EJS templates, a Vite SPA,
// inline styles from the visual editor and assets from cdn.discordapp.com /
// shardtwn.fr; tuning a one-size-fits-all policy at this layer would block
// legitimate traffic. The desktop Tauri wrapper enforces its own strict CSP
// (see desktop-tauri/src-tauri/tauri.conf.json), and the SPA itself escapes
// untrusted HTML before injection.
app.use(helmet({ contentSecurityPolicy: false }));

// Catch errors that escaped every try/catch and would otherwise crash the
// process. We log and keep running — PM2 will still restart on hard exits,
// but a single rogue promise rejection no longer takes the whole server down.
process.on('uncaughtException', (err, origin) => {
    console.error('[uncaughtException]', origin, err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason, promise);
});

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
        // Wrapped in its own try/catch — on a fresh DB `settings` doesn't
        // exist yet and we must not block the CREATE TABLE statements below.
        try { const [columns] = await db.execute('SHOW COLUMNS FROM settings');
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
        } catch { /* settings table not yet created — skip, CREATE TABLE below handles it */ }

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
            // Device tokens collected from the Tauri desktop app for APNs
            // remote pushes. One row per (account, device) pair — the
            // UNIQUE constraint lets us upsert on re-registration.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS push_device_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    device_token VARCHAR(255) NOT NULL,
                    platform VARCHAR(20) NOT NULL DEFAULT 'macos',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_account_token (account_id, device_token),
                    KEY idx_account (account_id)
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
                    shard_count INT DEFAULT 0,
                    avg_latency INT DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.execute(`ALTER TABLE bot_stats ADD COLUMN IF NOT EXISTS shard_count INT DEFAULT 0`).catch(() => {});
            await db.execute(`ALTER TABLE bot_stats ADD COLUMN IF NOT EXISTS avg_latency INT DEFAULT 0`).catch(() => {});
            // Purge migration artifacts: rows inserted before shard_count/avg_latency were tracked
            await db.execute(`DELETE FROM bot_stats WHERE shard_count = 0 AND avg_latency = 0`).catch(() => {});
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
            try {
                await db.execute(
                    `UPDATE settings SET rules_fr = ? WHERE rules_fr IS NULL OR rules_fr = '' OR rules_fr = '[]'`,
                    [defaultRulesFr]
                );
                await db.execute(
                    `UPDATE settings SET rules_en = ? WHERE rules_en IS NULL OR rules_en = '' OR rules_en = '[]'`,
                    [defaultRulesEn]
                );
            } catch { /* legacy table — skip on fresh DB */ }

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

            // Codes promo (discount appliqué au checkout, ≠ redeem_codes qui
            // activent Premium gratuitement). Créés par l'admin ou par le
            // bot Shard via /api/bot/promo-codes. discount_type: "percent"
            // (1-100) ou "fixed" (centimes). applies_to: "all" | "monthly"
            // | "yearly" | "lifetime".
            await db.execute(`
                CREATE TABLE IF NOT EXISTS promo_codes (
                    code VARCHAR(64) PRIMARY KEY,
                    discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
                    discount_value INT NOT NULL,
                    applies_to VARCHAR(32) NOT NULL DEFAULT 'all',
                    max_uses INT DEFAULT 0,
                    used_count INT DEFAULT 0,
                    expires_at DATETIME DEFAULT NULL,
                    created_by VARCHAR(64) DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS promo_code_uses (
                    code VARCHAR(64) NOT NULL,
                    discordUserId VARCHAR(255) NOT NULL,
                    guildId VARCHAR(255) NOT NULL,
                    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (code, discordUserId, guildId)
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
            // Same idea for user accounts — defeats distributed brute
            // force where the IP rate limiter alone wouldn't help.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS account_login_attempts (
                    account_id INT PRIMARY KEY,
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
            await db.execute(`
                CREATE TABLE IF NOT EXISTS account_personal_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    name VARCHAR(64) NOT NULL,
                    token_hash CHAR(64) NOT NULL UNIQUE,
                    last_used_at DATETIME DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_account (account_id),
                    INDEX idx_token (token_hash)
                )
            `);
            // token_plain pour affichage côté compte
            try {
                await db.execute(`ALTER TABLE account_personal_tokens ADD COLUMN token_plain TEXT DEFAULT NULL`);
            } catch { /* already exists */ }
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
                // Shard bot Discord linking (separate Discord application)
                `ALTER TABLE accounts ADD COLUMN shard_id VARCHAR(255) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_username VARCHAR(255) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_avatar VARCHAR(255) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_access_token TEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_refresh_token TEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_token_expires_at DATETIME DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_linked_at DATETIME DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_guilds_json MEDIUMTEXT DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN shard_guilds_fetched_at DATETIME DEFAULT NULL`,
                `ALTER TABLE accounts ADD UNIQUE KEY uniq_shard (shard_id)`,
            ]) {
                try { await db.execute(ddl); } catch { /* already exists */ }
            }
            // 2FA columns
            for (const ddl of [
                `ALTER TABLE accounts ADD COLUMN totp_secret VARCHAR(64) DEFAULT NULL`,
                `ALTER TABLE accounts ADD COLUMN totp_enabled TINYINT DEFAULT 0`,
                `ALTER TABLE accounts ADD COLUMN email_2fa_enabled TINYINT DEFAULT 0`,
            ]) {
                try { await db.execute(ddl); } catch { /* already exists */ }
            }
            // Pending 2FA login sessions (short-lived, verified after password)
            await db.execute(`
                CREATE TABLE IF NOT EXISTS account_2fa_pending (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    token_hash CHAR(64) NOT NULL UNIQUE,
                    email_code_hash CHAR(64) DEFAULT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_token (token_hash),
                    INDEX idx_account (account_id)
                )
            `);
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
            // Shard-bot tables + columns (formerly migrated lazily on every
            // GET /api/shard/guild/:id, which spammed 50+ ALTERs per page
            // load and masked real schema errors via .catch).
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
            const shardSettingsAlters = [
                `ALTER TABLE shard_settings ADD COLUMN welcomeTitle TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN welcomeFooter TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN welcomeColor VARCHAR(7) DEFAULT '#3b82f6'`,
                `ALTER TABLE shard_settings ADD COLUMN leaveTitle TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN leaveFooter TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN leaveColor VARCHAR(7) DEFAULT '#6b7280'`,
                `ALTER TABLE shard_settings ADD COLUMN autoRoleId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN tempVoiceTrigger VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN tempVoiceCategory VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN tempVoiceName VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN autoReactions JSON`,
                `ALTER TABLE shard_settings ADD COLUMN levelsEnabled TINYINT(1) DEFAULT 0`,
                `ALTER TABLE shard_settings ADD COLUMN xpMin INT DEFAULT 15`,
                `ALTER TABLE shard_settings ADD COLUMN xpMax INT DEFAULT 25`,
                `ALTER TABLE shard_settings ADD COLUMN xpCooldown INT DEFAULT 60`,
                `ALTER TABLE shard_settings ADD COLUMN levelUpChannelId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN levelRewards JSON`,
                `ALTER TABLE shard_settings ADD COLUMN levelUpMessage VARCHAR(500) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN levelUpColor VARCHAR(7) DEFAULT '#3b82f6'`,
                `ALTER TABLE shard_settings ADD COLUMN levelThresholds JSON`,
                `ALTER TABLE shard_settings ADD COLUMN ticketEnabled TINYINT(1) DEFAULT 0`,
                `ALTER TABLE shard_settings ADD COLUMN ticketCategoryId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketSupportRoleId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketLogChannelId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketMaxPerUser INT DEFAULT 1`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelChannelId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelTitle VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelDescription TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelColor VARCHAR(7) DEFAULT '#3b82f6'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelButtonLabel VARCHAR(80) DEFAULT 'Ouvrir un ticket'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelButtonEmoji VARCHAR(100) DEFAULT '🎫'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketPanelButtonStyle TINYINT DEFAULT 1`,
                `ALTER TABLE shard_settings ADD COLUMN ticketCloseButtonEmoji VARCHAR(100) DEFAULT '🔒'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketCloseButtonStyle TINYINT DEFAULT 4`,
                `ALTER TABLE shard_settings ADD COLUMN ticketTranscriptEnabled TINYINT(1) DEFAULT 1`,
                `ALTER TABLE shard_settings ADD COLUMN ticketOpenTitle VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketOpenDescription TEXT`,
                `ALTER TABLE shard_settings ADD COLUMN ticketOpenFooter VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketOpenColor VARCHAR(7) DEFAULT '#3b82f6'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketCloseButtonLabel VARCHAR(80) DEFAULT 'Fermer le ticket'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketLogOpenTitle VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketLogOpenColor VARCHAR(7) DEFAULT '#3b82f6'`,
                `ALTER TABLE shard_settings ADD COLUMN ticketLogCloseTitle VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN ticketLogCloseColor VARCHAR(7) DEFAULT '#ef4444'`,
                `ALTER TABLE shard_settings ADD COLUMN birthdayChannelId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN birthdayMessage VARCHAR(500) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN birthdayRoleId VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_settings ADD COLUMN economyEnabled TINYINT(1) DEFAULT 0`,
                `ALTER TABLE shard_settings ADD COLUMN economyCurrencyName VARCHAR(50) DEFAULT 'coins'`,
                `ALTER TABLE shard_settings ADD COLUMN economyDailyMin INT DEFAULT 50`,
                `ALTER TABLE shard_settings ADD COLUMN economyDailyMax INT DEFAULT 200`,
                `ALTER TABLE shard_settings ADD COLUMN isPremium TINYINT(1) DEFAULT 0`,
                `ALTER TABLE shard_settings ADD COLUMN xpRoleMultipliers JSON`,
                `ALTER TABLE shard_settings ADD COLUMN referralEnabled TINYINT(1) DEFAULT 0`,
                `ALTER TABLE shard_settings ADD COLUMN referralReward INT DEFAULT 100`,
                `ALTER TABLE shard_settings ADD COLUMN twitchAlerts JSON`,
                `ALTER TABLE shard_settings ADD COLUMN youtubeAlerts JSON`,
                // Paramètres globaux serveur (mee6-style) — fuseau horaire + couleur embed
                `ALTER TABLE shard_settings ADD COLUMN timezone VARCHAR(64) DEFAULT 'Europe/Paris'`,
                `ALTER TABLE shard_settings ADD COLUMN embedColor VARCHAR(7) DEFAULT '#5865F2'`,
            ];
            for (const ddl of shardSettingsAlters) {
                try { await db.execute(ddl); } catch { /* already exists */ }
            }
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
            `);
            for (const ddl of [
                `ALTER TABLE shard_giveaways ADD COLUMN minRole VARCHAR(255) DEFAULT ''`,
                `ALTER TABLE shard_giveaways ADD COLUMN minLevel INT DEFAULT 0`,
            ]) { try { await db.execute(ddl); } catch {} }
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_giveaway_entries (
                    giveawayId INT NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    PRIMARY KEY (giveawayId, userId)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_birthdays (
                    userId VARCHAR(255) NOT NULL,
                    guildId VARCHAR(255) NOT NULL,
                    day INT NOT NULL,
                    month INT NOT NULL,
                    PRIMARY KEY (guildId, userId)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_scheduled (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(255) NOT NULL,
                    channelId VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    intervalHours INT NOT NULL DEFAULT 24,
                    nextRun DATETIME NOT NULL
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_economy (
                    guildId VARCHAR(255) NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    balance BIGINT DEFAULT 0,
                    lastDaily DATETIME DEFAULT NULL,
                    PRIMARY KEY (guildId, userId)
                )
            `);
            // Transcripts of closed tickets, served by GET /transcripts/:id.
            // The id is a 32-char hex token — unguessable, so no extra
            // auth gate on the public viewer.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_ticket_transcripts (
                    id CHAR(32) PRIMARY KEY,
                    guildId VARCHAR(255) NOT NULL,
                    guildName VARCHAR(255) DEFAULT '',
                    channelName VARCHAR(255) NOT NULL,
                    openedById VARCHAR(255) NOT NULL,
                    openedByName VARCHAR(255) NOT NULL,
                    closedById VARCHAR(255) DEFAULT '',
                    closedByName VARCHAR(255) DEFAULT '',
                    openedAt DATETIME NOT NULL,
                    closedAt DATETIME NOT NULL,
                    messages JSON NOT NULL,
                    INDEX (guildId, closedAt)
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
            `);
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
            `);
            try { await db.execute(`ALTER TABLE shard_polls ADD COLUMN anonymous TINYINT(1) DEFAULT 0`); } catch {}
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_poll_votes (
                    pollId INT NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    choiceIndex INT NOT NULL,
                    PRIMARY KEY (pollId, userId)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_tickets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(255) NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    channelId VARCHAR(255) NOT NULL,
                    status ENUM('open','closed') DEFAULT 'open',
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_levels (
                    guildId VARCHAR(255) NOT NULL,
                    userId VARCHAR(255) NOT NULL,
                    xp BIGINT DEFAULT 0,
                    level INT DEFAULT 0,
                    PRIMARY KEY (guildId, userId)
                )
            `);
            // Premium feature : bot Discord personnalisé (token apporté par
            // l'utilisateur, le code reste celui de Shard). 1 ligne par
            // guild ; le token est stocké chiffré via encryptToken().
            // status : 'configured' (saved, pas encore lancé), 'running',
            // 'stopped', 'error'. Le worker de spawn arrive plus tard ; pour
            // l'instant la table sert juste à la UI.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_custom_bots (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(64) NOT NULL UNIQUE,
                    accountId INT NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    avatarUrl TEXT,
                    bannerUrl TEXT,
                    botUserId VARCHAR(64),
                    tokenEncrypted TEXT NOT NULL,
                    presence VARCHAR(16) DEFAULT 'online',
                    activityType VARCHAR(16) DEFAULT 'listening',
                    activityText VARCHAR(128) DEFAULT '',
                    status VARCHAR(32) DEFAULT 'configured',
                    statusMessage TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_account (accountId)
                )
            `);
            // ALTERs idempotents pour les installs qui avaient déjà la table
            // d'avant l'ajout de banner/presence/activity. Try/catch silencieux
            // pour ignorer "Duplicate column" si déjà appliqué.
            const customBotAlters = [
                `ALTER TABLE shard_custom_bots ADD COLUMN bannerUrl TEXT AFTER avatarUrl`,
                `ALTER TABLE shard_custom_bots ADD COLUMN presence VARCHAR(16) DEFAULT 'online' AFTER tokenEncrypted`,
                `ALTER TABLE shard_custom_bots ADD COLUMN activityType VARCHAR(16) DEFAULT 'listening' AFTER presence`,
                `ALTER TABLE shard_custom_bots ADD COLUMN activityText VARCHAR(128) DEFAULT '' AFTER activityType`,
                // Pour accueillir les data URIs base64 d'images uploadées
                // côté client (avatar ~50-200KB, banner ~200-500KB en base64).
                `ALTER TABLE shard_custom_bots MODIFY COLUMN avatarUrl MEDIUMTEXT`,
                `ALTER TABLE shard_custom_bots MODIFY COLUMN bannerUrl MEDIUMTEXT`,
                // Secret OAuth2 du bot (chiffré) — utilisé pour échanger le
                // code d'autorisation contre un access token lors de la
                // synchro des commandes via /custom-bot-auth.
                `ALTER TABLE shard_custom_bots ADD COLUMN oauth2ClientSecretEncrypted TEXT AFTER tokenEncrypted`,
                // Flag passé à 1 une fois que le user a complété le flow
                // OAuth2 (étape 3 de l'activation).
                `ALTER TABLE shard_custom_bots ADD COLUMN oauthAuthorized TINYINT(1) DEFAULT 0 AFTER oauth2ClientSecretEncrypted`,
            ];
            for (const ddl of customBotAlters) {
                try { await db.execute(ddl); } catch (e) { /* idempotent */ }
            }
            // Verified badge: accounts with a specific Discord role get a badge on their profile.
            try { await db.execute(`ALTER TABLE accounts ADD COLUMN verified TINYINT(1) DEFAULT 0`); } catch { /* idempotent */ }
            await db.execute(`
                CREATE TABLE IF NOT EXISTS global_blacklist (
                    userId VARCHAR(255) NOT NULL PRIMARY KEY,
                    reason TEXT,
                    addedBy VARCHAR(255),
                    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS config_backups (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(255) NOT NULL,
                    botLabel VARCHAR(50) NOT NULL,
                    configJson LONGTEXT NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
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
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_referrals (
                    guildId VARCHAR(255) NOT NULL,
                    inviterId VARCHAR(255) NOT NULL,
                    inviteeId VARCHAR(255) NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guildId, inviteeId)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_invite_cache (
                    guildId VARCHAR(255) NOT NULL,
                    inviteCode VARCHAR(50) NOT NULL,
                    uses INT DEFAULT 0,
                    PRIMARY KEY (guildId, inviteCode)
                )
            `);
            // Stream alerts (Twitch + YouTube). `lastStreamId` =
            // identifiant unique du dernier live notifié pour ne pas
            // re-poster à chaque tick tant que le live est en cours.
            // Twitch : stream id. YouTube : videoId du live.
            await db.execute(`
                CREATE TABLE IF NOT EXISTS shard_streamers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guildId VARCHAR(255) NOT NULL,
                    platform ENUM('twitch', 'youtube') NOT NULL,
                    handle VARCHAR(255) NOT NULL,
                    discordChannelId VARCHAR(255) NOT NULL,
                    mentionRoleId VARCHAR(255) DEFAULT NULL,
                    customMessage TEXT DEFAULT NULL,
                    lastStreamId VARCHAR(255) DEFAULT NULL,
                    lastCheckedAt DATETIME DEFAULT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_streamer (guildId, platform, handle),
                    INDEX idx_platform (platform)
                )
            `);
            await db.execute(`
                CREATE TABLE IF NOT EXISTS blocked_guilds (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(255) UNIQUE NOT NULL,
                    guild_name VARCHAR(255),
                    blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
    } catch (err) {
        console.error('❌ Erreur MySQL Dashboard:', err.message);
    }
}
console.log('Démarrage de connectDB()...');
connectDB().then(() => {
    console.log('connectDB() terminé.');
    // Init du manager une fois `db` peuplé + encryptToken/decryptToken
    // définis, puis on relance les bots custom des serveurs Premium.
    customBotManager.init({ db, decryptToken });
    require('./lib/ticketDB').init(db).catch(err => console.error('[ticketDB] init error:', err.message));
    customBotManager.startAll().catch(err => {
        console.error('[customBot] startAll fatal', err.message);
    });
});
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

// ─── Token-at-rest encryption ─────────────────────────────────────────
// OAuth access/refresh tokens are persisted in MySQL. Without
// encryption, a DB dump leaks live credentials for every linked user
// (Discord identify+guilds, Google, GitHub). We use AES-256-GCM with a
// key derived from SESSION_SECRET (HKDF-style), so no extra .env entry
// is required. Format on disk: "v1:<iv-hex>:<authTag-hex>:<ct-hex>".
// Decrypt is forward-compatible: legacy plaintext rows pass through
// unchanged (handy during the gradual migration). Re-encryption happens
// on the next write.
const TOKEN_ENC_KEY = crypto.createHash('sha256')
    .update(`token-enc:${process.env.SESSION_SECRET || ''}`)
    .digest();

function encryptToken(plain) {
    if (plain == null) return null;
    if (typeof plain !== 'string') plain = String(plain);
    if (plain === '') return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_ENC_KEY, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decryptToken(stored) {
    if (stored == null || stored === '') return stored;
    if (typeof stored !== 'string') return stored;
    if (!stored.startsWith('v1:')) return stored; // legacy plaintext
    try {
        const [, ivHex, tagHex, ctHex] = stored.split(':');
        if (!ivHex || !tagHex || !ctHex) return null;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const ct = Buffer.from(ctHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', TOKEN_ENC_KEY, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

function isSafeRedirect(url) {
    if (!url || typeof url !== 'string') return false;
    const TRUSTED = ['https://support.shardtwn.fr'];
    if (TRUSTED.some(o => url === o || url.startsWith(o + '/'))) return true;
    if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return false;
    try {
        const u = new URL(url, 'https://placeholder.local');
        return u.origin === 'https://placeholder.local';
    } catch { return false; }
}

function isValidSnowflake(id) {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

// Discord returns guild.permissions as a stringified 64-bit integer.
// `g.permissions & 0x8` happens to work for the ADMINISTRATOR bit (it's
// in the low 32 bits) but breaks the moment anyone checks a higher bit
// since JS bitwise ops coerce to 32-bit signed int. Use BigInt as
// recommended by Discord's docs.
const PERM_ADMIN = 0x8n;
function hasGuildAdmin(guild) {
    if (!guild) return false;
    if (guild.owner) return true;
    try {
        return (BigInt(guild.permissions || 0) & PERM_ADMIN) === PERM_ADMIN;
    } catch { return false; }
}

/**
 * Convert a string from the dashboard into the `emoji` object that Discord's
 * REST API expects on a button.
 *
 * Accepted shapes:
 *   "🎫"          → { name: "🎫" }              (unicode)
 *   "<:name:1234>"  → { name, id, animated: false }
 *   "<a:name:1234>" → { name, id, animated: true }
 *
 * If the input is empty/unparseable we return `undefined` so the button
 * is rendered with no emoji (still valid for Discord).
 */
function parseDiscordEmoji(raw) {
    const s = String(raw || '').trim();
    if (!s) return undefined;
    const m = s.match(/^<(a?):([A-Za-z0-9_~]+):(\d{15,25})>$/);
    if (m) return { name: m[2], id: m[3], animated: m[1] === 'a' };
    // Anything else: treat as a unicode emoji / single character glyph.
    return { name: s.slice(0, 32) };
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
    // il n'a pas besoin de 'unsafe-inline'. The legacy EJS templates
    // rendered under /_legacy/ still contain inline <script> blocks and
    // onclick="..." handlers AND pull Tailwind from a CDN, so for those
    // paths we keep the looser policy. cdnjs/jsdelivr were allowed
    // historically but aren't referenced anywhere in the current code.
    //
    // Stripe.js : autorisé en script-src + frame-src (iframe PaymentElement
    // + popup 3D Secure) + connect-src (API stripe.com) + img-src (pixels).
    // Recommandations officielles : stripe.com/docs/security/guide#content-security-policy
    const isLegacy = req.path.startsWith('/_legacy/');
    const scriptSrc = isLegacy
        ? "'self' 'unsafe-inline' https://cdn.tailwindcss.com https://js.stripe.com"
        : "'self' https://js.stripe.com";

    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        `script-src ${scriptSrc}; ` +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' https://cdn.discordapp.com data: https://*.stripe.com; " +
        "connect-src 'self' https://api.stripe.com https://m.stripe.network https://m.stripe.com; " +
        "frame-src https://js.stripe.com https://hooks.stripe.com; " +
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
        maxAge: 24 * 60 * 60 * 1000,
        domain: process.env.APP_URL?.includes('shardtwn.fr') ? '.shardtwn.fr' : undefined,
    }
}));

// ─── Maintenance mode ──────────────────────────────────────────────────────
// Set MAINTENANCE_MODE=true in .env to block access to the whole site.
// Exempted: Stripe webhooks, static assets needed by the maintenance page,
// auto-updater payloads, and the download redirect.
if (process.env.MAINTENANCE_MODE === 'true') {
    const MAINTENANCE_HTML = path.join(__dirname, 'views', 'maintenance.html');
    app.use((req, res, next) => {
        const p = req.path;
        if (
            p.startsWith('/webhook/') ||
            p.startsWith('/image/') ||
            p.startsWith('/updates/') ||
            p === '/download/mac' ||
            p === '/favicon.ico'
        ) return next();
        res.status(503).sendFile(MAINTENANCE_HTML);
    });
}
// ──────────────────────────────────────────────────────────────────────────

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Stripe webhook signature invalide:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Atomic idempotency: only the row that wins the unique-key insert
    // proceeds with side effects. The previous check-then-insert pattern
    // had a TOCTOU race where two concurrent webhooks for the same
    // event.id could both pass the check and double-execute. INSERT
    // IGNORE returns affectedRows = 0 on conflict.
    let alreadyProcessed = false;
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS stripe_events_processed (
                event_id VARCHAR(255) PRIMARY KEY,
                event_type VARCHAR(100),
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const [r] = await db.execute(
            'INSERT IGNORE INTO stripe_events_processed (event_id, event_type) VALUES (?, ?)',
            [event.id, event.type],
        );
        if (r.affectedRows === 0) alreadyProcessed = true;
    } catch (err) {
        console.error('Erreur idempotence Stripe:', err.message);
    }
    if (alreadyProcessed) {
        return res.json({ received: true, duplicate: true });
    }

    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid' || event.type === 'payment_intent.succeeded') {
        const obj = event.data.object;
        const meta = obj.metadata
            || obj.subscription_details?.metadata
            || obj.lines?.data?.[0]?.metadata
            || {};
        const guildId = meta.guildId;
        if (guildId && isValidSnowflake(String(guildId))) {
            try {
                await db.execute(`UPDATE settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
                await db.execute(`UPDATE shard_settings SET isPremium = 1 WHERE guildId = ?`, [guildId]);
                console.log(`✅ Premium activé via Stripe (${event.type}) pour le serveur ${guildId}`);
            } catch (err) {
                console.error('Erreur activation premium Stripe:', err.message);
            }
        }
        // Comptage d'utilisation des codes promo : on incrémente uniquement
        // après confirmation du paiement, pour ne pas brûler un code si
        // l'utilisateur abandonne après avoir ouvert la modale.
        const promoCode = meta.promoCode;
        if (promoCode && typeof promoCode === 'string') {
            try {
                await db.execute('UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?', [promoCode]);
                if (guildId && meta.discordUserId) {
                    await db.execute(
                        `INSERT IGNORE INTO promo_code_uses (code, discordUserId, guildId) VALUES (?, ?, ?)`,
                        [promoCode, meta.discordUserId, guildId],
                    );
                }
            } catch (err) {
                console.error('Erreur compteur promo code:', err.message);
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

// Limit pour le custom-bot PUT (avatar + banner en base64 ~1 MB combiné).
// 4 MB global est confortable et reste loin du DoS — l'auth middleware
// rejette de toute façon les requêtes anonymes.
app.use(express.json({ limit: '4mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '4mb' }));

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

// apple-app-site-association — utilisé par l'app iOS Shardtown (ShardLink)
// pour autoriser les passkeys (webcredentials) sur le domaine et capter le
// callback OAuth via universal link (applinks). Apple exige :
//   - HTTPS sans redirect
//   - Content-Type: application/json (PAS application/json; charset=utf-8)
//   - Pas d'extension dans l'URL
const AASA_PATH = path.join(__dirname, 'status-app', 'public', '.well-known', 'apple-app-site-association');
app.get('/.well-known/apple-app-site-association', (req, res) => {
    try {
        const body = fs.readFileSync(AASA_PATH);
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(body);
    } catch {
        res.status(404).send('Not found');
    }
});

app.use(passport.initialize());
app.use(passport.session());

// Synthesize req.user from the linked Discord on the current account.
// Lets all dashboard routes (which read `req.user.guilds`, `req.user.id`,
// etc.) work transparently when the user signed in via /account/login
// rather than via the legacy passport-discord flow.
app.use(async (req, res, next) => {
    if (req.user && req.session?.shardUser) return next(); // déjà tout hydraté
    if (!req.session?.account?.id) return next();
    try {
        const [rows] = await db.execute(
            `SELECT discord_id, discord_username, discord_avatar, discord_guilds_json,
                    shard_id, shard_username, shard_avatar, shard_guilds_json
             FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a) return next();

        // Synth req.user depuis le Discord OAuth lié au compte (si présent).
        if (!req.user && a.discord_id) {
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
        }
        // Synth req.session.shardUser depuis le Shard OAuth lié au compte.
        // Le bot étant fusionné, on n'a plus besoin de deux OAuth distinctes :
        // une seule des deux liaisons doit suffire à tous les endpoints. Si
        // shard_* manque mais discord_* existe, on hydrate shardUser depuis
        // discord_* — et inversement pour req.user. Voir aussi le fallback
        // symétrique dans checkAuth / checkAuthShard.
        if (!req.session.shardUser) {
            if (a.shard_id) {
                let guilds = [];
                try { guilds = a.shard_guilds_json ? JSON.parse(a.shard_guilds_json) : []; } catch { /* */ }
                req.session.shardUser = {
                    id: a.shard_id,
                    username: a.shard_username || '',
                    avatar: a.shard_avatar || null,
                    guilds,
                };
            } else if (a.discord_id) {
                // Fallback : pas de shard_* mais Discord linké → on réutilise
                // la même identité + le même guild list pour l'auth Shard.
                let guilds = [];
                try { guilds = a.discord_guilds_json ? JSON.parse(a.discord_guilds_json) : []; } catch { /* */ }
                req.session.shardUser = {
                    id: a.discord_id,
                    username: a.discord_username || '',
                    avatar: a.discord_avatar || null,
                    guilds,
                };
            }
        }
        // Et le symétrique : si Shard est linké mais pas Discord, synth user.
        if (!req.user && a.shard_id) {
            let guilds = [];
            try { guilds = a.shard_guilds_json ? JSON.parse(a.shard_guilds_json) : []; } catch { /* */ }
            req.user = {
                id: a.shard_id,
                username: a.shard_username || '',
                global_name: a.shard_username || null,
                avatar: a.shard_avatar || null,
                discriminator: '0',
                guilds,
            };
        }
    } catch { /* swallow — fall back to anonymous */ }
    next();
});

// Personal-access-token auth — runs before CSRF so bearer-authed requests
// can skip the cookie-based CSRF check (CSRF only protects against ambient
// session cookies; explicit Authorization headers are not subject to it).
//
// Beyond setting `req.session.account`, we also hydrate `req.user` (the
// shape the passport-Discord routes expect) and `req.session.shardUser`
// (the Shard OAuth shape) from the account's stored Discord data. This
// way every existing endpoint that checks one of those works with bearer
// auth — no per-route refactor needed.
const BEARER_RE = /^Bearer\s+(.+)$/i;
app.use(async (req, res, next) => {
    const auth = req.headers.authorization || '';
    const m = BEARER_RE.exec(auth);
    // No bearer token → fall through to whatever cookie-based session
    // express-session has set up.
    if (!m) return next();
    // If a bearer is present we ALWAYS validate it, even when an existing
    // session cookie is also attached. The bearer is the source of truth
    // for desktop clients; otherwise the global CSRF guard would block
    // every POST because the bearer-authed request wouldn't be flagged.
    const tokenHash = crypto.createHash('sha256').update(m[1].trim()).digest('hex');
    try {
        const [rows] = await db.execute(
            'SELECT id, account_id FROM account_personal_tokens WHERE token_hash = ? LIMIT 1',
            [tokenHash],
        );
        if (!rows[0]) return next();

        const accountId = rows[0].account_id;
        req.session.account = { id: accountId, viaToken: true };
        req.bearerAuthed = true;
        // Fire-and-forget last_used_at update; don't block the request.
        db.execute(
            'UPDATE account_personal_tokens SET last_used_at = NOW() WHERE id = ?',
            [rows[0].id],
        ).catch(() => {});

        // Hydrate req.user / req.session.shardUser from the account record so
        // existing dashboard endpoints (/api/me, /api/shard/server, etc.) work
        // out of the box for bearer requests.
        const [accountRows] = await db.execute(
            `SELECT discord_id, discord_username, discord_avatar, discord_guilds_json,
                    shard_id, shard_username, shard_avatar, shard_guilds_json
             FROM accounts WHERE id = ? LIMIT 1`,
            [accountId],
        );
        const a = accountRows[0];
        if (a?.discord_id) {
            let guilds = [];
            try { guilds = a.discord_guilds_json ? JSON.parse(a.discord_guilds_json) : []; } catch { /* */ }
            req.user = {
                id: a.discord_id,
                username: a.discord_username,
                avatar: a.discord_avatar,
                guilds,
            };
        }
        if (a?.shard_id) {
            let guilds = [];
            try { guilds = a.shard_guilds_json ? JSON.parse(a.shard_guilds_json) : []; } catch { /* */ }
            req.session.shardUser = {
                id: a.shard_id,
                username: a.shard_username,
                avatar: a.shard_avatar,
                guilds,
            };
        }
        // Cross-synth — bot fusionné : une seule des deux liaisons doit
        // suffire à débloquer les deux familles d'endpoints. Si une seule
        // est présente, on duplique son identité de l'autre côté.
        if (!req.user && a?.shard_id) {
            let guilds = [];
            try { guilds = a.shard_guilds_json ? JSON.parse(a.shard_guilds_json) : []; } catch { /* */ }
            req.user = {
                id: a.shard_id,
                username: a.shard_username,
                avatar: a.shard_avatar,
                guilds,
            };
        }
        if (!req.session.shardUser && a?.discord_id) {
            let guilds = [];
            try { guilds = a.discord_guilds_json ? JSON.parse(a.discord_guilds_json) : []; } catch { /* */ }
            req.session.shardUser = {
                id: a.discord_id,
                username: a.discord_username,
                avatar: a.discord_avatar,
                guilds,
            };
        }
    } catch { /* swallow, treat as unauth */ }
    next();
});

// Global CSRF guard — applies to every state-changing request that carries a
// session cookie. Skipped for safe methods, the Stripe webhook (signature-
// verified, no session), bearer-authed requests, /api/bot/* (server-to-server,
// authenticated by X-Bot-Key), and the OAuth callback (passport
// state-protected). Individual routes used to opt in via `verifyCsrf`;
// this catches the ones that didn't.
app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.path === '/webhook/stripe') return next();
    if (req.bearerAuthed) return next();
    // Endpoints internes consommés par le bot Discord (server-to-server) :
    // auth dédiée via header X-Bot-Key, donc pas de session ni de CSRF.
    if (req.path.startsWith('/api/bot/')) return next();
    // Bridge OAuth mobile : l'app iOS appelle /api/mobile/auth/exchange
    // depuis ASWebAuthenticationSession sans cookie ni token de session,
    // donc pas de CSRF possible. Le code échangé est à usage unique +
    // protégé par PKCE, ce qui couvre l'attaque que CSRF empêche normalement.
    if (req.path === '/api/mobile/auth/exchange') return next();
    // Uptime Kuma webhook — authenticated via secret query param, no session
    if (req.path.startsWith('/api/support/webhook/')) return next();
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

// Tout passe sous Shard. Les routes /shardguard/* sont les chemins legacy
// (gardés pour les anciens clients/bookmarks) ; le client à jour utilise
// /shard/mod/*. Les deux pointent vers les mêmes handlers. L'auth utilise
// shardUser + SHARD_TOKEN ; pas de Discord OAuth historique requis.
app.use(['/shardguard', '/shard/mod'], liveGuildAdminGuard(req => req.session?.shardUser?.id, () => process.env.SHARD_TOKEN));
app.use('/shard', liveGuildAdminGuard(req => req.session?.shardUser?.id, () => process.env.SHARD_TOKEN));
app.use(['/api/shardguard', '/api/shard/mod'], liveGuildAdminGuard(req => req.session?.shardUser?.id, () => process.env.SHARD_TOKEN));
app.use('/api/shard', liveGuildAdminGuard(req => req.session?.shardUser?.id, () => process.env.SHARD_TOKEN));

// Migrated to React SPA — kept only as legacy fallback for the EJS template (unused once SPA catch-all is registered)
app.get('/_legacy/', async (req, res) => {
    if (!req.user) return res.render('index', { user: null, botGuildIds: [], adminGuilds: [] });
    try {
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);
        const adminGuilds = req.user.guilds
            .filter(g => hasGuildAdmin(g))
            .sort((a, b) => {
                const aIn = botGuildIds.includes(a.id);
                const bIn = botGuildIds.includes(b.id);
                if (aIn && !bIn) return -1;
                if (!aIn && bIn) return 1;
                return 0;
            });
        res.render('index', { user: req.user, botGuildIds, adminGuilds });
    } catch {
        res.render('index', { user: req.user, botGuildIds: [], adminGuilds: req.user.guilds.filter(g => hasGuildAdmin(g)) });
    }
});

// React SPA: assets are served at /assets/* (Vite output base = "/")
const SPA_DIST = path.join(__dirname, 'status-app', 'dist');
app.use('/assets', (req, res, next) => {
    if (req.hostname === 'support.shardtwn.fr') return next();
    express.static(path.join(SPA_DIST, 'assets'), { maxAge: '1y', immutable: true })(req, res, next);
});
app.use((req, res, next) => {
    if (req.hostname === 'support.shardtwn.fr') return next();
    express.static(SPA_DIST, { index: false, fallthrough: true, maxAge: '1h' })(req, res, next);
});

// Auto-updater payloads (latest.json + .app.tar.gz + .sig + .dmg).
// Pushed here by the GitHub Actions release workflow via rsync over SSH.
// Public — no auth — integrity enforced by ed25519 signature that the
// desktop app verifies with its embedded public key.
const UPDATES_DIR = path.join(__dirname, 'updates');
try { fs.mkdirSync(UPDATES_DIR, { recursive: true }); } catch { /* */ }
app.use('/updates', express.static(UPDATES_DIR, {
    setHeaders(res, file) {
        // latest.json must be fresh; binaries are immutable (named by version)
        if (file.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=60');
        else                        res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    },
}));

// Stable "give me the latest macOS build" URL — reads the version out of
// latest.json on disk and 302-redirects to the versioned .dmg. Used by the
// website's download CTA so the marketing page never needs to know which
// build is current. Best-effort: if latest.json is missing/broken we send
// the user to the GitHub releases page instead.
app.get('/download/mac', (_req, res) => {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(UPDATES_DIR, 'latest.json'), 'utf8'));
        const v = String(manifest.version || '').replace(/^v/, '').trim();
        if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error('bad version');
        return res.redirect(302, `/updates/Shardtown_${v}_universal.dmg`);
    } catch {
        return res.redirect(302, 'https://github.com/Shardtown/shardtown/releases/latest');
    }
});

// Lightweight session info for the React app
app.get('/api/me', async (req, res) => {
    // Prefer the new accounts session (email/password / OAuth). When a
    // Discord is linked we surface its id/username/avatar so the SPA's
    // avatar helper can build the right cdn.discordapp.com URL — without
    // this the avatar shows blank for users who signed up with GitHub
    // (or email) and only later linked Discord.
    if (req.session?.account?.id && db) {
        try {
            const [rows] = await db.execute(
                `SELECT id, email, pseudo,
                        discord_id, discord_username, discord_avatar
                 FROM accounts WHERE id = ? LIMIT 1`,
                [req.session.account.id]
            );
            const a = rows[0];
            if (a) {
                return res.json({
                    user: a.discord_id
                        ? {
                            id: a.discord_id,
                            username: a.discord_username || a.pseudo,
                            global_name: a.discord_username || a.pseudo,
                            avatar: a.discord_avatar || null,
                            discriminator: null,
                        }
                        : {
                            id: a.id,
                            username: a.pseudo,
                            global_name: a.pseudo,
                            avatar: null,
                            discriminator: null,
                        },
                });
            }
            // Stale session pointing to deleted account
            req.session.account = null;
        } catch { /* fall through */ }
    }
    // Legacy Discord passport user
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

// ─── Live presence (Canva-style) ───────────────────────────────────
// In-memory who's-where: each dashboard SPA heartbeats every ~8s
// while on a page, and polls peers every ~6s. Scope is typically the
// SPA route ("/shardguard/guild/123"). Optional `field` says which
// input the user is currently focused on, so peers can render a
// small avatar next to the field being edited.
//
// Requires an authenticated user — we identify by Discord ID (set by
// passport or the account-session hydration middleware above).

function presenceIdentify(req) {
    const u = req.user;
    if (!u || !u.id) return null;
    return {
        id: String(u.id),
        username: u.username || '',
        global_name: u.global_name || u.username || '',
        avatar: u.avatar || null,
    };
}

app.post('/api/presence/heartbeat', (req, res) => {
    const user = presenceIdentify(req);
    if (!user) return res.status(401).json({ error: 'auth' });
    const { scope, field, path, cursor } = req.body || {};
    if (typeof scope !== 'string' || !scope || scope.length > 200) {
        return res.status(400).json({ error: 'scope' });
    }
    const f = typeof field === 'string' && field.length > 0 && field.length <= 80 ? field : null;
    const p = typeof path === 'string' && path.length > 0 && path.length <= 500 ? path : null;
    let c = null;
    if (cursor && typeof cursor === 'object'
        && typeof cursor.x === 'number' && cursor.x >= 0 && cursor.x <= 100
        && typeof cursor.y === 'number' && cursor.y >= 0 && cursor.y <= 100) {
        c = { x: cursor.x, y: cursor.y };
    }
    presence.heartbeat(scope, user, { field: f, path: p, cursor: c });
    res.json({ success: true });
});

app.post('/api/presence/leave', (req, res) => {
    const user = presenceIdentify(req);
    if (!user) return res.status(401).json({ error: 'auth' });
    const { scope } = req.body || {};
    if (typeof scope === 'string' && scope) presence.leave(scope, user.id);
    res.json({ success: true });
});

app.get('/api/presence', (req, res) => {
    const user = presenceIdentify(req);
    const scope = String(req.query.scope || '');
    if (!scope || scope.length > 200) return res.status(400).json({ error: 'scope' });
    res.json({ peers: presence.peers(scope, user?.id || null) });
});

// ─── Chatbot IA (assistant Shardtown via Ollama auto-hébergé) ─────────
// La base de connaissance (chatbot-knowledge.js) est injectée comme
// message system Ollama. Ollama tourne sur le VPS — pas d'API tierce.
//
// Variables :
//   OLLAMA_URL    (def. http://127.0.0.1:11434) — endpoint local
//   OLLAMA_MODEL  (def. qwen2.5:3b-instruct)    — modèle pull au préalable
//
// L'historique de conversation est gardé en mémoire process, indexé par
// req.sessionID. Pas de persistance — on ne stocke pas les questions.

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 180_000;
// Garde le modèle chargé en RAM. -1 = indéfini (recommandé sur un VPS dédié,
// le modèle ne se décharge jamais → pas de cold start sur le 1er message).
// Override avec OLLAMA_KEEP_ALIVE=30m si tu veux libérer la RAM en idle.
// Ollama accepte string ("30m") ou nombre (-1, 0, secondes). On normalise.
const OLLAMA_KEEP_ALIVE_RAW = process.env.OLLAMA_KEEP_ALIVE || '-1';
const OLLAMA_KEEP_ALIVE = /^-?\d+$/.test(OLLAMA_KEEP_ALIVE_RAW)
    ? parseInt(OLLAMA_KEEP_ALIVE_RAW, 10)
    : OLLAMA_KEEP_ALIVE_RAW;

// Très court : avec un petit modèle (3b), un historique long le pousse à
// répéter le pattern de sa dernière réponse au lieu de traiter le NOUVEAU
// message. 4 paires user/assistant suffisent pour garder le fil.
const CHATBOT_MAX_HISTORY = 4;
const CHATBOT_MAX_USER_LEN = 2000;
const CHATBOT_MAX_TOKENS = 512;

// Map<sessionID, { role: 'user' | 'assistant', content: string }[]>
const chatbotHistories = new Map();
const CHATBOT_SESSION_TTL = 60 * 60 * 1000;
const chatbotLastSeen = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [sid, ts] of chatbotLastSeen) {
        if (now - ts > CHATBOT_SESSION_TTL) {
            chatbotHistories.delete(sid);
            chatbotLastSeen.delete(sid);
        }
    }
}, 5 * 60 * 1000).unref?.();

const chatbotRateLimit = rateLimit({
    windowMs: 60_000,
    max: 20,
    message: { error: 'Trop de messages. Patiente une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const CHATBOT_SYSTEM_PROMPT = SHARDTOWN_KNOWLEDGE;

// Ping Ollama au démarrage et déclenche un warmup en arrière-plan.
//
// Le warmup fait DEUX choses :
//   1. charge le modèle en RAM (sinon cold start de 30-60 s sur 1re requête)
//   2. **ingère le system prompt complet** pour le mettre dans le KV-cache
//      d'Ollama. Toutes les requêtes utilisateur suivantes envoyant le MÊME
//      system prompt en tête réutilisent ce cache et n'ingèrent que les
//      nouveaux tokens (le message user). Ça transforme une 1re requête
//      utilisateur de ~28 s en ~2-5 s.
//
// La pénalité du long prompt est donc payée UNE FOIS au boot du serveur,
// pas à chaque utilisateur.
async function pingOllama() {
    try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const names = (j.models || []).map(m => m.name);
        if (!names.includes(OLLAMA_MODEL)) {
            console.warn(`[chatbot] Ollama joignable mais le modèle "${OLLAMA_MODEL}" n'est pas pull. Lance: ollama pull ${OLLAMA_MODEL}`);
            return;
        }
        console.log(`[chatbot] Ollama OK — modèle "${OLLAMA_MODEL}" prêt, warmup + ingestion system prompt…`);
        const t0 = Date.now();
        const w = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                // Strict prefix MATCH avec ce qu'on enverra dans /api/chatbot/message
                // → Ollama réutilise le KV-cache du system prompt sur les requêtes
                // suivantes. Si on changeait l'ordre ou le contenu du system,
                // le cache serait invalidé. C'est intentionnel.
                messages: [
                    { role: 'system', content: CHATBOT_SYSTEM_PROMPT },
                    { role: 'user', content: 'ping' },
                ],
                stream: false,
                keep_alive: OLLAMA_KEEP_ALIVE,
                options: {
                    temperature: 0.4,
                    top_p: 0.9,
                    num_predict: 1, // une seule sortie : on veut JUSTE faire ingérer le prefix
                },
            }),
        }).catch(e => { console.warn('[chatbot] warmup KO:', e.message); return null; });
        if (w && w.ok) {
            const data = await w.json().catch(() => ({}));
            const tokens = data?.prompt_eval_count ?? 0;
            console.log(
                `[chatbot] system prompt ingéré (${tokens} tokens) en ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
                `les requêtes user suivantes ne paieront que la nouvelle question.`,
            );
        }
    } catch (e) {
        console.warn(`[chatbot] Ollama injoignable sur ${OLLAMA_URL} (${e.message}). Le chatbot répondra "indisponible" tant qu'Ollama n'est pas lancé.`);
    }
}
pingOllama();

function getChatbotHistory(sid) {
    return chatbotHistories.get(sid) || [];
}

// Toggle d'urgence pour mettre Samia en maintenance sans toucher au code.
// Activer côté .env avec CHATBOT_MAINTENANCE=1 puis `pm2 restart shardtown`.
// Quand actif :
//   - /history renvoie un message d'avertissement comme si Samia avait parlé
//     (le SPA l'affiche dans la liste, sans modif côté front)
//   - /message coupe l'appel Ollama et renvoie une erreur SSE claire
//   - /reset reste fonctionnel pour vider l'historique côté serveur
const CHATBOT_MAINTENANCE = /^(1|true|yes|on)$/i.test(String(process.env.CHATBOT_MAINTENANCE || ''));
const CHATBOT_MAINTENANCE_MESSAGE =
    process.env.CHATBOT_MAINTENANCE_MESSAGE
    || "⚠️ L'assistant Shardtown est en maintenance. Reviens un peu plus tard — pour toute question urgente, écris à contact@shardtwn.fr.";
if (CHATBOT_MAINTENANCE) {
    console.warn('[chatbot] MAINTENANCE active — toutes les requêtes /api/chatbot/* renvoient un message statique.');
}

// Réponse 503 standardisée pour tous les /api/chatbot/* en maintenance.
// Le SPA détecte `maintenance: true` côté client et bascule en page
// "en maintenance" plein écran (pas de chat, pas de input, rien).
function maintenanceResponse(res) {
    return res.status(503).json({
        error: CHATBOT_MAINTENANCE_MESSAGE,
        maintenance: true,
    });
}

app.get('/api/chatbot/history', (req, res) => {
    if (CHATBOT_MAINTENANCE) return maintenanceResponse(res);
    const messages = getChatbotHistory(req.sessionID);
    res.json({
        messages: messages.map((m, i) => ({
            id: i,
            role: m.role,
            content: m.content,
        })),
        enabled: true,
    });
});

app.post('/api/chatbot/reset', (req, res) => {
    if (CHATBOT_MAINTENANCE) return maintenanceResponse(res);
    chatbotHistories.delete(req.sessionID);
    chatbotLastSeen.delete(req.sessionID);
    res.json({ success: true });
});

// Endpoint streaming. Renvoie du Server-Sent Events :
//   event: chunk\ndata: {"text":"..."}\n\n         (un par token Ollama)
//   event: done \ndata: {"reply":"..."}\n\n        (réponse complète)
//   event: error\ndata: {"error":"..."}\n\n        (sur erreur)
app.post('/api/chatbot/message', chatbotRateLimit, async (req, res) => {
    if (CHATBOT_MAINTENANCE) return maintenanceResponse(res);
    const content = String(req.body?.content || '').trim().slice(0, CHATBOT_MAX_USER_LEN);
    if (!content) return res.status(400).json({ error: 'Message vide' });

    const sid = req.sessionID;
    const history = getChatbotHistory(sid);
    const userTurn = { role: 'user', content };
    const conversation = [...history, userTurn];

    const ollamaMessages = [
        { role: 'system', content: CHATBOT_SYSTEM_PROMPT },
        ...conversation.map(m => ({ role: m.role, content: m.content })),
    ];

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Indique à nginx de ne PAS bufferiser cette réponse
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sse = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OLLAMA_TIMEOUT_MS);
    // Si le client ferme la connexion avant la fin, on coupe Ollama aussi
    req.on('close', () => ac.abort());

    let fullReply = '';

    try {
        const r = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: ollamaMessages,
                stream: true,
                keep_alive: OLLAMA_KEEP_ALIVE,
                options: {
                    // 0.4 = compromis : suffisamment bas pour rester sur les
                    // rails du system prompt, mais assez haut pour que le
                    // modèle ne reste pas COLLÉ sur le pattern de sa dernière
                    // réponse quand le user change de sujet.
                    temperature: 0.4,
                    top_p: 0.9,
                    num_predict: CHATBOT_MAX_TOKENS,
                    // Pénalise la répétition exacte des phrases déjà dites.
                    // qwen2.5 répond bien à ce signal.
                    repeat_penalty: 1.15,
                },
            }),
            signal: ac.signal,
        });

        if (!r.ok) {
            const text = await r.text().catch(() => '');
            console.error(`[chatbot] Ollama HTTP ${r.status}: ${text.slice(0, 200)}`);
            sse('error', { error: r.status === 404
                ? `Modèle "${OLLAMA_MODEL}" pas chargé sur le serveur.`
                : "Erreur de l'assistant. Réessaie dans un instant." });
            res.end();
            clearTimeout(timer);
            return;
        }

        // Ollama envoie du NDJSON (une ligne JSON par chunk)
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                let obj;
                try { obj = JSON.parse(trimmed); } catch { continue; }
                const piece = obj?.message?.content;
                if (piece) {
                    fullReply += piece;
                    sse('chunk', { text: piece });
                }
                if (obj.done) {
                    const finalReply = fullReply.trim()
                        || "Je n'ai pas réussi à formuler de réponse, peux-tu reformuler ?";
                    const newHistory = [...conversation, { role: 'assistant', content: finalReply }];
                    chatbotHistories.set(sid, newHistory.slice(-CHATBOT_MAX_HISTORY * 2));
                    chatbotLastSeen.set(sid, Date.now());
                    sse('done', {
                        reply: finalReply,
                        usage: {
                            prompt_tokens: obj.prompt_eval_count ?? 0,
                            completion_tokens: obj.eval_count ?? 0,
                            total_duration_ms: obj.total_duration ? Math.round(obj.total_duration / 1e6) : 0,
                        },
                    });
                }
            }
        }

        clearTimeout(timer);
        res.end();
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            // Soit timeout, soit client a fermé la connexion. Dans le 2e cas
            // res est déjà fermé, write devient no-op.
            console.error(`[chatbot] Ollama abort (timeout ou client fermé)`);
            try { sse('error', { error: "L'IA met trop de temps à répondre. Réessaie." }); } catch (sseErr) { console.error('[chatbot] SSE write failed:', sseErr.message); }
        } else {
            const msg = err?.cause?.code || err.message || 'unknown';
            console.error('[chatbot] Ollama error:', msg);
            try { sse('error', { error: "L'assistant est hors-ligne. Réessaie plus tard ou écris à contact@shardtwn.fr." }); } catch (sseErr) { console.error('[chatbot] SSE write failed:', sseErr.message); }
        }
        try { res.end(); } catch (endErr) { console.error('[chatbot] res.end failed:', endErr.message); }
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
        // SMTP non configuré : on NE log PAS le code (les logs PM2/journalctl
        // sont souvent monde-lisibles ou archivés — n'importe qui avec un
        // accès lecture aux logs pourrait prendre le compte). En dev,
        // configure SMTP_HOST=localhost avec un MailHog/MailCatcher.
        console.warn(`[mailer] SMTP non configuré — vérif email impossible pour ${account.email}`);
        return;
    }
    try {
        await m.sendMail({
            from: process.env.SMTP_FROM || '"Shardtown" <noreply@shardtwn.fr>',
            to: account.email,
            subject, text, html,
        });
    } catch (e) {
        console.error('[mailer] envoi échoué pour', account.email, '—', e.message);
    }
}

async function send2faEmailCode(account, code) {
    const m = getMailer();
    const subject = `Code A2F Shardtown : ${code}`;
    const text = `Salut ${account.pseudo},\n\nTon code de connexion à deux facteurs : ${code}\n\nValable 5 minutes. Si tu n'es pas à l'origine de cette connexion, change ton mot de passe immédiatement.\n\n— Shardtown`;
    const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:40px;text-align:center">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;letter-spacing:-0.02em">Code de connexion 🔐</h1>
    <p style="margin:0 0 28px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.5">
      Un code de vérification à deux facteurs a été demandé pour ton compte <strong>${account.pseudo}</strong>.
    </p>
    <div style="font-size:36px;font-weight:800;letter-spacing:0.4em;background:#000;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;margin-bottom:28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff">${code}</div>
    <p style="margin:0;color:rgba(255,255,255,0.4);font-size:13px;line-height:1.5">
      Code valable 5 minutes. Si tu n'es pas à l'origine de cette connexion, change ton mot de passe immédiatement.
    </p>
  </div>
  <p style="text-align:center;margin:24px 0 0;color:rgba(255,255,255,0.3);font-size:11px">— L'équipe Shardtown</p>
</div>`;
    if (!m) {
        console.warn(`[mailer] SMTP non configuré — code 2FA impossible pour ${account.email}`);
        return;
    }
    try {
        await m.sendMail({
            from: process.env.SMTP_FROM || '"Shardtown" <noreply@shardtwn.fr>',
            to: account.email,
            subject, text, html,
        });
    } catch (e) {
        console.error('[mailer] envoi 2FA échoué pour', account.email, '—', e.message);
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
// Live pseudo-availability check pour le formulaire d'inscription.
// Plus généreux que l'auth (l'utilisateur tape lettre par lettre) mais
// borné pour éviter qu'un script enumère la table accounts.
const pseudoCheckLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

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
        shard_id: a.shard_id || null,
        shard_username: a.shard_username || null,
        shard_avatar: a.shard_avatar || null,
        shard_linked_at: a.shard_linked_at || null,
        created_at: a.created_at,
        totp_enabled: !!a.totp_enabled,
        email_2fa_enabled: !!a.email_2fa_enabled,
        verified: !!a.verified,
    };
}

// Captcha generation is canvas-bound (CPU-intensive). Without a limit
// an attacker can spam this endpoint to spike CPU on a small VPS.
const captchaRateLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});

// Captcha — issues an image + an opaque ID; the answer is stashed in
// the session and consumed once on signup/login. New call replaces any
// previous captcha for this session.
app.get('/api/account/captcha', captchaRateLimiter, (req, res) => {
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
app.get('/api/account/pseudo-available', pseudoCheckLimiter, async (req, res) => {
    const pseudo = String(req.query.pseudo || '').trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(pseudo)) {
        return res.json({ available: false, reason: 'format' });
    }
    try {
        const [rows] = await db.execute('SELECT id FROM accounts WHERE pseudo = ? LIMIT 1', [pseudo]);
        res.json({ available: rows.length === 0 });
    } catch (err) {
        console.error('pseudo-available:', err.message);
        res.status(500).json({ available: false, reason: 'server' });
    }
});

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
        // Anti-enumeration: distinct error messages for email vs pseudo
        // collision used to leak which one already exists. Pseudo is
        // public (visible on profiles) so we keep its error specific;
        // email is sensitive so we mask it behind a generic "compte
        // déjà existant" and return the same 200 + pendingVerification
        // shape as a real signup (the verification email won't actually
        // arrive — but an attacker can't tell that from the response).
        const [byPseudo] = await db.execute('SELECT id FROM accounts WHERE pseudo = ? LIMIT 1', [pseudo]);
        if (byPseudo.length) return res.status(409).json({ error: 'Pseudo déjà pris' });
        const [byEmail] = await db.execute('SELECT id FROM accounts WHERE email = ? LIMIT 1', [email]);
        if (byEmail.length) {
            return res.json({ success: true, pendingVerification: true, email });
        }

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

        // Token d'accès automatique à la création du compte
        try {
            const tok = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
            const tokHash = crypto.createHash('sha256').update(tok).digest('hex');
            const tokPlain = encryptToken(tok);
            await db.execute(
                'INSERT INTO account_personal_tokens (account_id, name, token_hash, token_plain) VALUES (?, ?, ?, ?)',
                [accountId, 'Token principal', tokHash, tokPlain],
            );
        } catch (e) { console.error('signup token creation:', e.message); }

        res.json({ success: true, pendingVerification: true, email });
    } catch (err) {
        console.error('signup:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Per-account lockout for /api/account/login. Same escalation curve as
// admin login so a distributed brute force across many IPs (which would
// slip past the IP-keyed accountAuthLimiter) still gets stopped.
const ACCOUNT_LOCKOUT_SCHEDULE = [
    { attempts: 5,  ms: 5 * 60 * 1000 },
    { attempts: 10, ms: 30 * 60 * 1000 },
    { attempts: 15, ms: 24 * 60 * 60 * 1000 },
];

async function checkAccountLockout(accountId) {
    if (!accountId) return { locked: false };
    try {
        const [rows] = await db.execute(
            'SELECT locked_until FROM account_login_attempts WHERE account_id = ?',
            [accountId],
        );
        const r = rows[0];
        if (r && r.locked_until && new Date(r.locked_until) > new Date()) {
            return { locked: true, until: r.locked_until };
        }
        return { locked: false };
    } catch { return { locked: false }; }
}

async function recordFailedAccountLogin(accountId) {
    if (!accountId) return;
    try {
        const [rows] = await db.execute(
            'SELECT failed_attempts FROM account_login_attempts WHERE account_id = ?',
            [accountId],
        );
        const next = (rows[0]?.failed_attempts || 0) + 1;
        const tier = [...ACCOUNT_LOCKOUT_SCHEDULE].reverse().find(t => next >= t.attempts);
        const lockedUntil = tier ? new Date(Date.now() + tier.ms) : null;
        await db.execute(
            `INSERT INTO account_login_attempts (account_id, failed_attempts, last_failed_at, locked_until)
             VALUES (?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE failed_attempts = VALUES(failed_attempts),
                 last_failed_at = VALUES(last_failed_at), locked_until = VALUES(locked_until)`,
            [accountId, next, lockedUntil],
        );
    } catch (e) { console.error('recordFailedAccountLogin:', e.message); }
}

async function clearAccountLockout(accountId) {
    if (!accountId) return;
    try {
        await db.execute('DELETE FROM account_login_attempts WHERE account_id = ?', [accountId]);
    } catch { /* swallow */ }
}

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

        // Lockout check before password verification: an attacker spamming a
        // valid identifier shouldn't be able to time the scrypt computation.
        const lockout = await checkAccountLockout(a.id);
        if (lockout.locked) {
            return res.status(429).json({
                error: 'Trop de tentatives échouées. Réessaie plus tard.',
                lockedUntil: lockout.until,
            });
        }

        const test = hashPassword(password, a.password_salt);
        const stored = Buffer.from(a.password_hash, 'hex');
        const computed = Buffer.from(test, 'hex');
        if (stored.length !== computed.length || !crypto.timingSafeEqual(stored, computed)) {
            await recordFailedAccountLogin(a.id);
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        await clearAccountLockout(a.id);
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
        // Si TOTP activé, bloquer ici et demander le code
        if (a.totp_enabled) {
            const pendingTokenRaw = crypto.randomBytes(32).toString('hex');
            const pendingTokenHash = crypto.createHash('sha256').update(pendingTokenRaw).digest('hex');
            await db.execute(
                `INSERT INTO account_2fa_pending (account_id, token_hash, email_code_hash, expires_at)
                 VALUES (?, ?, NULL, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
                [a.id, pendingTokenHash],
            );
            return res.json({
                pending2fa: true,
                methods: { totp: true, email: false },
                pendingToken: pendingTokenRaw,
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
    // Coupe aussi la session Passport (login Discord legacy) si présente,
    // sinon req.user reste hydraté à la prochaine requête via passport.session().
    const finalize = () => {
        if (req.session) req.session.account = null;
        req.session.destroy(() => {
            // express-session ne supprime pas le cookie côté client par défaut.
            // On l'efface explicitement (mêmes options que celles utilisées à
            // la création — voir app.use(session({...})) plus haut).
            res.clearCookie('sgid', { path: '/', httpOnly: true, sameSite: 'lax' });
            res.json({ success: true });
        });
    };
    if (typeof req.logout === 'function') {
        // passport >= 0.6 : req.logout est asynchrone et prend un callback
        req.logout(err => {
            if (err) console.warn('[logout] passport req.logout:', err.message);
            finalize();
        });
    } else {
        finalize();
    }
});

// ─── Personal access tokens ──────────────────────────────────────────────
// Used by desktop / CLI / third-party tools to authenticate without a session
// cookie. The plaintext is shown ONCE at creation; only a SHA-256 hash is
// stored. Bearer auth skips CSRF (see middleware above).
const TOKEN_PREFIX = 'jr_';
const TOKEN_BYTES = 32;

// Token principal du compte — lecture (déchiffré)
app.get('/api/account/tokens/my-token', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, token_plain, last_used_at, created_at
             FROM account_personal_tokens WHERE account_id = ? ORDER BY id ASC LIMIT 1`,
            [req.session.account.id],
        );
        if (!rows[0]) return res.json({ token: null });
        const plain = rows[0].token_plain ? decryptToken(rows[0].token_plain) : null;
        res.json({ token: plain, last_used_at: rows[0].last_used_at, created_at: rows[0].created_at });
    } catch (err) {
        console.error('my-token:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Réinitialiser le token principal
app.post('/api/account/tokens/reset', requireAccount, async (req, res) => {
    if (req.session.account.viaToken) {
        return res.status(403).json({ error: 'Réinitialisation interdite via auth par token' });
    }
    try {
        await db.execute(
            'DELETE FROM account_personal_tokens WHERE account_id = ?',
            [req.session.account.id],
        );
        const tok = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
        const tokHash = crypto.createHash('sha256').update(tok).digest('hex');
        const tokPlain = encryptToken(tok);
        await db.execute(
            'INSERT INTO account_personal_tokens (account_id, name, token_hash, token_plain) VALUES (?, ?, ?, ?)',
            [req.session.account.id, 'Token principal', tokHash, tokPlain],
        );
        res.json({ token: tok });
    } catch (err) {
        console.error('reset token:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Conservé pour compatibilité desktop / CLI — retourne le token principal existant
app.get('/api/account/tokens', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, last_used_at, created_at
             FROM account_personal_tokens WHERE account_id = ? ORDER BY id ASC LIMIT 1`,
            [req.session.account.id],
        );
        res.json({ tokens: rows });
    } catch (err) {
        console.error('list tokens:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Cache the bot guild list (Discord API call) — used by /api/account/guilds
// to avoid hitting Discord on every dashboard load. 60s TTL is short enough
// to reflect new joins quickly, long enough to absorb refresh spam.
const BOT_GUILDS_TTL_MS = 60_000;
const botGuildsCache = new Map(); // bot key -> { ids: Set<string>, expires: number }

async function fetchBotGuildIds(botKey) {
    const cached = botGuildsCache.get(botKey);
    if (cached && cached.expires > Date.now()) return cached.ids;
    const token = botKey === 'shardguard' ? process.env.DISCORD_TOKEN : process.env.SHARD_TOKEN;
    if (!token) return new Set();
    try {
        const r = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${token}` },
            timeout: 6000,
        });
        const ids = new Set(r.data.map(g => g.id));
        botGuildsCache.set(botKey, { ids, expires: Date.now() + BOT_GUILDS_TTL_MS });
        return ids;
    } catch (err) {
        console.error(`fetchBotGuildIds(${botKey}):`, err.response?.data || err.message);
        // Don't cache failures — let the next request retry.
        return cached?.ids ?? new Set();
    }
}

// List the user's admin guilds for a given bot. The user's guild list comes
// from the cached `accounts.{discord|shard}_guilds_json` (refreshed via the
// existing /api/account/{discord|shard}/refresh-guilds endpoints). We filter
// to admin-only and annotate each guild with `bot_present` so the desktop
// app can mark guilds where the bot still needs to be invited.
app.get('/api/account/guilds', requireAccount, async (req, res) => {
    // bot=mod est l'alias canonique de bot=shardguard (legacy). On normalise
    // tôt pour que toute la suite raisonne en termes de "side": community vs
    // moderation, sans plus jamais avoir à parler de "shardguard".
    const rawBot = String(req.query.bot || '').toLowerCase();
    const bot = rawBot === 'mod' ? 'shardguard' : rawBot;
    if (bot !== 'shardguard' && bot !== 'shard') {
        return res.status(400).json({ error: 'bot=shard|mod requis (legacy: shardguard)' });
    }
    const col = bot === 'shardguard' ? 'discord_guilds_json' : 'shard_guilds_json';
    const fetchedCol = bot === 'shardguard' ? 'discord_guilds_fetched_at' : 'shard_guilds_fetched_at';
    try {
        const [rows] = await db.execute(
            `SELECT ${col} AS guilds_json, ${fetchedCol} AS fetched_at FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a) return res.status(401).json({ error: 'Compte introuvable' });
        let guilds = [];
        try { guilds = a.guilds_json ? JSON.parse(a.guilds_json) : []; } catch { /* corrupt JSON, treat as empty */ }
        const botGuildIds = await fetchBotGuildIds(bot);
        const adminGuilds = guilds
            .filter(g => hasGuildAdmin(g))
            .map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon || null,
                owner: !!g.owner,
                bot_present: botGuildIds.has(g.id),
            }))
            .sort((x, y) => {
                if (x.bot_present !== y.bot_present) return x.bot_present ? -1 : 1;
                return x.name.localeCompare(y.name, 'fr');
            });
        res.json({
            bot,
            guilds: adminGuilds,
            fetched_at: a.fetched_at,
            stale: !a.fetched_at,
        });
    } catch (err) {
        console.error('/api/account/guilds:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/account/tokens/:id', requireAccount, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    try {
        await db.execute(
            'DELETE FROM account_personal_tokens WHERE id = ? AND account_id = ?',
            [id, req.session.account.id],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('delete token:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Auto-verified: check Discord role 1417244225950453933 in guild 1409954518682042462.
// Cached per user for 5 min to avoid hammering the Discord API.
const VERIFIED_ROLE_ID  = '1417244225950453933';
const VERIFIED_GUILD_ID = '1409954518682042462';
const verifiedCheckCache = new Map(); // discordId → { ts, verified }

async function syncVerifiedRole(account) {
    if (!account.discord_id) return account.verified;
    const cached = verifiedCheckCache.get(account.discord_id);
    if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.verified;
    try {
        const r = await axios.get(
            `https://discord.com/api/v10/guilds/${VERIFIED_GUILD_ID}/members/${account.discord_id}`,
            { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}` }, timeout: 4000 },
        );
        const hasRole = Array.isArray(r.data.roles) && r.data.roles.includes(VERIFIED_ROLE_ID);
        verifiedCheckCache.set(account.discord_id, { ts: Date.now(), verified: hasRole });
        if (!!hasRole !== !!account.verified) {
            await db.execute('UPDATE accounts SET verified = ? WHERE id = ?', [hasRole ? 1 : 0, account.id]);
        }
        return hasRole;
    } catch {
        // Discord API unreachable or user not in guild → keep current DB value.
        verifiedCheckCache.set(account.discord_id, { ts: Date.now(), verified: !!account.verified });
        return !!account.verified;
    }
}

app.get('/api/account/me', async (req, res) => {
    if (!req.session?.account?.id) return res.json({ account: null });
    try {
        const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ? LIMIT 1', [req.session.account.id]);
        if (!rows[0]) {
            req.session.account = null;
            return res.json({ account: null });
        }
        const a = rows[0];
        a.verified = await syncVerifiedRole(a);
        res.json({ account: publicAccount(a) });
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

// ─── Desktop OAuth bridge ──────────────────────────────────────────────
// Tauri webview can't carry the user through a redirect-based OAuth flow:
// the SPA loads from tauri://localhost (different origin from the API)
// and the desktop client authenticates via a Bearer token, not a session
// cookie. So the "Lier mon Discord" button on the desktop calls
// /api/account/oauth-bridge/init to get a one-time URL it opens in the
// system browser; that URL promotes the bearer account into a real
// cookie session and forwards to the regular Discord/Shard link flow.
// The callback (below) detects the `fromDesktop` session flag and
// renders a small "you can return to the desktop app" page that fires
// a shardtwn:// deep link instead of redirecting to /account.
const desktopLinkTokens = new Map();
const DESKTOP_LINK_TTL_MS = 5 * 60 * 1000;
function issueDesktopLinkToken(accountId, provider) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + DESKTOP_LINK_TTL_MS;
    desktopLinkTokens.set(token, { accountId, provider, expiresAt });
    if (desktopLinkTokens.size > 1000) {
        const now = Date.now();
        for (const [k, v] of desktopLinkTokens) {
            if (v.expiresAt < now) desktopLinkTokens.delete(k);
        }
    }
    return token;
}
function consumeDesktopLinkToken(token) {
    if (!token || typeof token !== 'string') return null;
    const entry = desktopLinkTokens.get(token);
    if (!entry) return null;
    desktopLinkTokens.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
}

app.post('/api/account/oauth-bridge/init', requireAccount, (req, res) => {
    const provider = String(req.body?.provider || '').toLowerCase();
    if (provider !== 'discord' && provider !== 'shard') {
        return res.status(400).json({ error: 'provider=discord|shard requis' });
    }
    const token = issueDesktopLinkToken(req.session.account.id, provider);
    const base = process.env.APP_URL || 'http://localhost:3000';
    res.json({ url: `${base}/api/oauth-bridge/use?token=${token}` });
});

app.get('/api/oauth-bridge/use', (req, res) => {
    const entry = consumeDesktopLinkToken(String(req.query.token || ''));
    if (!entry) {
        return res.status(400).type('html').send(`<!doctype html>
<meta charset="utf-8"><title>Lien expiré</title>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px">
<div style="max-width:480px;text-align:center">
<h1 style="font-size:28px;font-weight:800;letter-spacing:-0.02em;margin:0 0 12px">Lien expiré</h1>
<p style="color:rgba(255,255,255,.55);line-height:1.55;margin:0">Réessaie depuis l'application Shardtown.</p>
</div>`);
    }
    req.session.regenerate(err => {
        if (err) return res.status(500).send('Erreur de session');
        req.session.account = { id: entry.accountId };
        req.session.fromDesktop = true;
        res.redirect(`/api/account/${entry.provider}/link`);
    });
});

function renderDesktopReturn(res, opts) {
    const { ok, reason, provider } = opts;
    const status = ok ? 'ok' : 'error';
    const params = new URLSearchParams({ linked: status, provider });
    if (reason) params.set('reason', reason);
    const deepLink = `shardtwn://open/account?${params}`;
    const safeDeep = deepLink.replace(/"/g, '&quot;');
    res.type('html').send(`<!doctype html>
<meta charset="utf-8">
<title>${ok ? 'Compte lié' : 'Liaison échouée'}</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}
.card{max-width:480px;text-align:center}
h1{font-size:32px;font-weight:800;letter-spacing:-0.02em;margin:0 0 16px}
p{color:rgba(255,255,255,.55);line-height:1.55;margin:0 0 28px}
a.btn{display:inline-block;padding:12px 24px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font-weight:700;font-size:13px}
.small{color:rgba(255,255,255,.35);font-size:12px;margin-top:18px}
</style>
<div class="card">
<h1>${ok ? '✓ Compte lié' : 'Liaison échouée'}</h1>
<p>${ok ? "Tu peux retourner sur l'application Shardtown — la liste de tes serveurs est prête." : "Réessaie depuis l'application Shardtown."}</p>
<a class="btn" href="${safeDeep}">Ouvrir Shardtown</a>
<p class="small">Cette fenêtre peut être fermée.</p>
</div>
<script>setTimeout(function(){location.href=${JSON.stringify(deepLink)};}, 400);</script>`);
}

// L'app OAuth historique (CLIENT_ID) s'appelle "ShardGuard" côté Discord :
// le user voyait l'écran de consentement "ShardGuard wants to access...".
// Le bot étant fusionné sous l'identité "Shard", on redirige systématiquement
// vers l'OAuth de l'app Shard. Le callback /api/account/shard/callback écrit
// désormais aussi les colonnes discord_* pour que l'ancien front (qui
// vérifie account.discord_id) continue de fonctionner.
app.get('/api/account/discord/link', requireAccount, (req, res) => {
    res.redirect('/api/account/shard/link');
});

// Endpoint legacy conservé pour compat (anciens deep links desktop, etc.).
// On garde le path d'origine accessible via /api/account/discord/link.legacy
// si jamais on a besoin du flux séparé un jour ; sinon mort.
app.get('/api/account/discord/link.legacy', requireAccount, (req, res) => {
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
    const fromDesktop = !!req.session.fromDesktop;
    delete req.session.fromDesktop;
    const fail = (reason) => fromDesktop
        ? renderDesktopReturn(res, { ok: false, reason, provider: 'discord' })
        : res.redirect(`/account?linked=error&reason=${reason}`);
    const state = String(req.query.state || '');
    const expectedState = req.session.discordLinkState;
    req.session.discordLinkState = null;
    if (!state || !expectedState || !timingSafeEqual(state, expectedState)) return fail('state');
    const code = String(req.query.code || '');
    if (!code) return fail('code');

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
        if (otherRows.length) return fail('already_linked');

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
                encryptToken(access_token),
                encryptToken(refresh_token),
                Math.max(60, parseInt(expires_in, 10) || 0),
                JSON.stringify(guilds),
                req.session.account.id,
            ],
        );
        if (fromDesktop) return renderDesktopReturn(res, { ok: true, provider: 'discord' });
        res.redirect('/account?linked=ok');
    } catch (err) {
        console.error('discord link callback:', err.response?.data || err.message);
        return fail('exchange');
    }
});

// ─── Shard bot linking — separate Discord application ───────────────────
const SHARD_LINK_REDIRECT = (process.env.APP_URL || 'http://localhost:3000') + '/api/account/shard/callback';

app.get('/api/account/shard/link', requireAccount, (req, res) => {
    if (!process.env.SHARD_CLIENT_ID || !process.env.SHARD_CLIENT_SECRET) {
        return res.status(503).send('Shard OAuth non configuré');
    }
    const state = crypto.randomBytes(24).toString('hex');
    req.session.shardLinkState = state;
    const params = new URLSearchParams({
        client_id: process.env.SHARD_CLIENT_ID,
        redirect_uri: SHARD_LINK_REDIRECT,
        response_type: 'code',
        scope: 'identify guilds',
        state,
        prompt: 'consent',
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/account/shard/callback', async (req, res) => {
    if (!req.session?.account?.id) return res.redirect('/account/login');
    const fromDesktop = !!req.session.fromDesktop;
    delete req.session.fromDesktop;
    const fail = (reason) => fromDesktop
        ? renderDesktopReturn(res, { ok: false, reason, provider: 'shard' })
        : res.redirect(`/account?shardLinked=error&reason=${reason}`);
    const state = String(req.query.state || '');
    const expectedState = req.session.shardLinkState;
    req.session.shardLinkState = null;
    if (!state || !expectedState || !timingSafeEqual(state, expectedState)) return fail('state');
    const code = String(req.query.code || '');
    if (!code) return fail('code');

    try {
        const tokenRes = await axios.post(
            'https://discord.com/api/v10/oauth2/token',
            new URLSearchParams({
                client_id: process.env.SHARD_CLIENT_ID,
                client_secret: process.env.SHARD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: SHARD_LINK_REDIRECT,
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

        // Le bot étant fusionné, on bloque si l'identité Discord est déjà
        // liée à un autre compte — peu importe la colonne (shard_id OU
        // discord_id), c'est le même user.id Discord dans les deux.
        const [otherRows] = await db.execute(
            'SELECT id FROM accounts WHERE (shard_id = ? OR discord_id = ?) AND id <> ? LIMIT 1',
            [me.id, me.id, req.session.account.id],
        );
        if (otherRows.length) return fail('already_linked');

        // On hydrate à la fois shard_* ET discord_* depuis la même OAuth.
        // Comme ça l'ancien front qui regarde account.discord_id continue de
        // fonctionner sans qu'on doive faire la cross-synth à chaque requête.
        await db.execute(
            `UPDATE accounts SET
                shard_id = ?,
                shard_username = ?,
                shard_avatar = ?,
                shard_linked_at = NOW(),
                shard_access_token = ?,
                shard_refresh_token = ?,
                shard_token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                shard_guilds_json = ?,
                shard_guilds_fetched_at = NOW(),
                discord_id = COALESCE(discord_id, ?),
                discord_username = COALESCE(discord_username, ?),
                discord_avatar = COALESCE(discord_avatar, ?),
                discord_linked_at = COALESCE(discord_linked_at, NOW()),
                discord_access_token = COALESCE(discord_access_token, ?),
                discord_refresh_token = COALESCE(discord_refresh_token, ?),
                discord_token_expires_at = COALESCE(discord_token_expires_at, DATE_ADD(NOW(), INTERVAL ? SECOND)),
                discord_guilds_json = COALESCE(discord_guilds_json, ?),
                discord_guilds_fetched_at = COALESCE(discord_guilds_fetched_at, NOW())
             WHERE id = ?`,
            [
                me.id,
                me.username,
                me.avatar || null,
                encryptToken(access_token),
                encryptToken(refresh_token),
                Math.max(60, parseInt(expires_in, 10) || 0),
                JSON.stringify(guilds),
                // Discord side mirror (COALESCE → ne touche pas si déjà rempli)
                me.id,
                me.username,
                me.avatar || null,
                encryptToken(access_token),
                encryptToken(refresh_token),
                Math.max(60, parseInt(expires_in, 10) || 0),
                JSON.stringify(guilds),
                req.session.account.id,
            ],
        );
        if (fromDesktop) return renderDesktopReturn(res, { ok: true, provider: 'shard' });
        res.redirect('/account?linked=ok');
    } catch (err) {
        console.error('shard link callback:', err.response?.data || err.message);
        return fail('exchange');
    }
});

app.post('/api/account/shard/unlink', requireAccount, async (req, res) => {
    try {
        await db.execute(
            `UPDATE accounts SET
                shard_id = NULL, shard_username = NULL, shard_avatar = NULL,
                shard_linked_at = NULL,
                shard_access_token = NULL, shard_refresh_token = NULL,
                shard_token_expires_at = NULL,
                shard_guilds_json = NULL, shard_guilds_fetched_at = NULL
             WHERE id = ?`,
            [req.session.account.id],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('shard unlink:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
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
    // Discord OAuth is *also* served by passport at /auth/discord for the
    // web sign-in flow. This entry is the path the mobile bridge uses
    // (see /api/mobile/auth/start) and reuses the shared
    // /api/account/oauth/:provider/callback so a single Discord OAuth
    // App redirect URI covers both.
    discord: {
        authUrl: 'https://discord.com/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scope: 'identify email',
        clientIdEnv: 'CLIENT_ID',
        clientSecretEnv: 'CLIENT_SECRET',
        idColumn: 'discord_id',
        labelColumn: 'discord_username',
        async fetchProfile(accessToken) {
            const r = await axios.get('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 8000,
            });
            return {
                providerId: String(r.data.id),
                email: r.data.verified ? r.data.email : null,
                username: r.data.global_name || r.data.username || null,
                avatar: r.data.avatar || null,
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

    console.log('[web-oauth] start', req.params.provider, 'ua:', String(req.headers['user-agent'] || '').slice(0, 80));

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

    const incomingState = String(req.query.state || '');

    // Mobile flow detection: /api/mobile/auth/start signs a state token
    // containing { provider, codeChallenge }. If the incoming state is a
    // valid mobile token, we run the mobile finisher (deep link back to
    // the app) instead of the web flow (cookie session + /account
    // redirect). Stateless — works across PM2 cluster workers and
    // process restarts. One OAuth App per provider covers both flows.
    const mobileEntry = verifyMobileToken('state', incomingState);
    console.log('[oauth-cb]', provider, 'state-len:', incomingState.length,
        'mobile:', !!mobileEntry, mobileEntry ? `mp:${mobileEntry.provider}` : '');
    if (mobileEntry && mobileEntry.provider === provider) {
        return handleMobileCallback(req, res, provider, cfg, mobileEntry);
    }

    // Verify state
    const expected = req.session.oauthState;
    req.session.oauthState = null;
    if (!expected || expected.provider !== provider || !expected.state
        || !timingSafeEqual(incomingState, expected.state)) {
        return res.redirect('/account/login?oauth=error&reason=state');
    }
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

// ─── Mobile OAuth bridge (iOS app) ─────────────────────────────────────
// Native iOS app authenticates via ASWebAuthenticationSession: the app
// opens our /api/mobile/auth/start/:provider in a system-isolated web
// session (no shared cookies), the provider OAuth runs, the web callback
// (/api/account/oauth/:provider/callback) detects the mobile state and
// fires a `shardapp://auth/callback?code=…` deep link, the app exchanges
// the code + its PKCE verifier for a long-lived Bearer token, then
// stores it in the iOS Keychain. The Bearer token reuses the existing
// `account_personal_tokens` table so every API endpoint that already
// works with personal tokens just works.
//
// PKCE protects against an attacker intercepting the deep link: without
// the verifier (only the app knows it), the auth code is useless.
//
// Crucial design choice: the redirect_uri we send to the OAuth provider
// is the **same** as the web flow's (/api/account/oauth/:provider/
// callback). That means one OAuth App per provider serves both web and
// mobile — no extra callback URL to register, and GitHub's single-URL
// limitation is a non-issue.
const MOBILE_DEEP_LINK_SCHEME = 'shardapp';
const DESKTOP_DEEP_LINK_SCHEME = 'shardtwn';
// Allowlist for `?scheme=` on /api/mobile/auth/start. Same OAuth flow,
// different deep link target depending on which Shard client kicked it
// off (iOS = shardapp://, Tauri desktop = shardtwn://). Both schemes are
// registered as system-level URL handlers by their respective bundles,
// so the OS guarantees only the right app receives the callback.
const ALLOWED_DEEP_LINK_SCHEMES = new Set([MOBILE_DEEP_LINK_SCHEME, DESKTOP_DEEP_LINK_SCHEME]);
const MOBILE_AUTH_TTL_MS = 5 * 60 * 1000;

// Stateless signed tokens — survive process restarts and work across PM2
// cluster workers without a shared store. Format:
//   base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(data, key))
// `kind` discriminates "state" (start → callback) from "code"
// (callback → exchange) so a token can't be cross-used between the two
// stages. `exp` enforces the TTL.
const mobileTokenKey = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update('mobile-auth/v1')
    .digest();

function signMobileToken(kind, payload) {
    const body = { ...payload, kind, exp: Date.now() + MOBILE_AUTH_TTL_MS };
    const data = Buffer.from(JSON.stringify(body)).toString('base64url');
    const mac = crypto.createHmac('sha256', mobileTokenKey).update(data).digest('base64url');
    return `${data}.${mac}`;
}

function verifyMobileToken(kind, token) {
    if (!token || typeof token !== 'string') return null;
    const dot = token.indexOf('.');
    if (dot < 1) return null;
    const data = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', mobileTokenKey).update(data).digest('base64url');
    if (mac.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    } catch { return null; }
    if (payload.kind !== kind) return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
}

function redirectToApp(res, params, scheme = MOBILE_DEEP_LINK_SCHEME) {
    // The URL scheme is registered exclusively by the matching native app
    // bundle (shardapp = iOS, shardtwn = Tauri desktop); the OS guarantees
    // only that app can receive the callback URL.
    const effective = ALLOWED_DEEP_LINK_SCHEMES.has(scheme) ? scheme : MOBILE_DEEP_LINK_SCHEME;
    const qs = new URLSearchParams(params).toString();
    return res.redirect(`${effective}://auth/callback?${qs}`);
}

const mobileAuthLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

// Step 1 — the iOS app opens this URL in ASWebAuthenticationSession.
// We stash the PKCE challenge against a random `state` token, then
// redirect to the OAuth provider using the SHARED web callback URL.
// When the provider bounces back to that callback, the shared handler
// notices the mobile state and routes into handleMobileCallback below.
app.get('/api/mobile/auth/start/:provider', mobileAuthLimiter, (req, res) => {
    const cfg = OAUTH_CONFIGS[req.params.provider];
    if (!cfg) return res.status(404).type('text/plain').send('Provider inconnu');

    // PKCE S256: 43-128 chars base64url
    const challenge = String(req.query.code_challenge || '');
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
        return res.status(400).type('text/plain').send('code_challenge invalide');
    }

    // Optional `?scheme=` picks the deep-link target (iOS vs Tauri desktop).
    // Default keeps backwards-compat with the iOS app that doesn't send one.
    const rawScheme = String(req.query.scheme || MOBILE_DEEP_LINK_SCHEME);
    const scheme = ALLOWED_DEEP_LINK_SCHEMES.has(rawScheme) ? rawScheme : MOBILE_DEEP_LINK_SCHEME;

    const clientId = process.env[cfg.clientIdEnv];
    if (!clientId) return res.status(503).type('text/plain').send(`${req.params.provider} OAuth non configuré`);

    // Stateless signed state — survives cluster workers + restarts.
    const state = signMobileToken('state', {
        provider: req.params.provider,
        codeChallenge: challenge,
        scheme,
    });
    console.log('[mobile-auth] start', req.params.provider, 'scheme:', scheme, 'state-len:', state.length);

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

// Step 2 — called *from inside* /api/account/oauth/:provider/callback
// when the incoming state matches a mobile entry. Finishes the OAuth
// exchange, runs the same find/create logic as the web flow, then
// issues a single-use auth code and bounces to the deep link. The
// final Bearer token never appears in a URL the OS or system log
// might capture — only the auth code does.
async function handleMobileCallback(req, res, provider, cfg, stateEntry) {
    const scheme = stateEntry.scheme || MOBILE_DEEP_LINK_SCHEME;
    const code = String(req.query.code || '');
    if (!code) return redirectToApp(res, { error: 'code' }, scheme);

    let profile;
    try {
        const tokenRes = await axios.post(
            cfg.tokenUrl,
            new URLSearchParams({
                client_id: process.env[cfg.clientIdEnv],
                client_secret: process.env[cfg.clientSecretEnv],
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
        console.error(`[mobile-auth:${provider}]`, err.response?.data || err.message);
        return redirectToApp(res, { error: 'exchange' }, scheme);
    }

    if (!profile.providerId) return redirectToApp(res, { error: 'profile' }, scheme);

    let account;
    try {
        const [byProvider] = await db.execute(
            `SELECT * FROM accounts WHERE ${cfg.idColumn} = ? LIMIT 1`,
            [profile.providerId],
        );
        account = byProvider[0];

        if (!account && profile.email) {
            const [byEmail] = await db.execute(
                'SELECT * FROM accounts WHERE email = ? LIMIT 1',
                [profile.email.toLowerCase()],
            );
            if (byEmail.length) {
                account = byEmail[0];
                await db.execute(
                    `UPDATE accounts SET ${cfg.idColumn} = ?, ${cfg.labelColumn} = ? WHERE id = ?`,
                    [profile.providerId, profile.username || profile.email, account.id],
                );
            }
        }

        if (!account) {
            if (!profile.email) return redirectToApp(res, { error: 'no_email' }, scheme);
            const pseudo = await uniquePseudo(profile.username || profile.email.split('@')[0]);
            const salt = crypto.randomBytes(16).toString('hex');
            const randomPwd = crypto.randomBytes(32).toString('hex');
            const hash = hashPassword(randomPwd, salt);
            const [insert] = await db.execute(
                `INSERT INTO accounts
                  (email, email_verified, pseudo, password_hash, password_salt, ${cfg.idColumn}, ${cfg.labelColumn})
                 VALUES (?, 1, ?, ?, ?, ?, ?)`,
                [profile.email.toLowerCase(), pseudo, hash, salt, profile.providerId, profile.username || profile.email],
            );
            const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ?', [insert.insertId]);
            account = rows[0];
        }

        // Discord avatar refresh (only on the Discord path; the column
        // doesn't exist for Google/GitHub).
        if (provider === 'discord' && profile.avatar) {
            await db.execute(
                'UPDATE accounts SET discord_avatar = ? WHERE id = ?',
                [profile.avatar, account.id],
            ).catch(() => {});
        }

        await db.execute('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);
    } catch (err) {
        console.error(`[mobile-auth:${provider}] db`, err.message);
        return redirectToApp(res, { error: 'db' }, scheme);
    }

    // Stateless signed auth code — the native app will trade this for a
    // Bearer token within the TTL via /api/mobile/auth/exchange.
    const authCode = signMobileToken('code', {
        accountId: account.id,
        codeChallenge: stateEntry.codeChallenge,
        scheme,
    });
    console.log('[mobile-auth] callback OK', provider, 'scheme:', scheme, 'account:', account.id, 'deep-link →');
    return redirectToApp(res, { code: authCode, provider }, scheme);
}

// Step 3 — the iOS app POSTs the auth code + the PKCE verifier; we
// confirm SHA256(verifier) === stored challenge, then mint a Bearer
// token from `account_personal_tokens`. Same shape as desktop tokens,
// so every existing endpoint that takes Bearer just works.
app.post('/api/mobile/auth/exchange', express.json({ limit: '4kb' }), mobileAuthLimiter, async (req, res) => {
    const code = String(req.body?.code || '');
    const verifier = String(req.body?.code_verifier || '');
    if (!code || !verifier) return res.status(400).json({ error: 'code et code_verifier requis' });
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
        return res.status(400).json({ error: 'code_verifier invalide' });
    }

    const entry = verifyMobileToken('code', code);
    if (!entry) return res.status(400).json({ error: 'code expiré ou invalide' });

    const expected = crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (!timingSafeEqual(expected, entry.codeChallenge)) {
        return res.status(400).json({ error: 'PKCE mismatch' });
    }

    try {
        const token = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const tokenLabel = entry.scheme === DESKTOP_DEEP_LINK_SCHEME ? 'Desktop Shard app' : 'iOS Shard app';
        await db.execute(
            'INSERT INTO account_personal_tokens (account_id, name, token_hash) VALUES (?, ?, ?)',
            [entry.accountId, tokenLabel, tokenHash],
        );
        const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ? LIMIT 1', [entry.accountId]);
        if (!rows[0]) return res.status(500).json({ error: 'Compte introuvable' });
        res.json({ token, account: publicAccount(rows[0]) });
    } catch (err) {
        console.error('[mobile-auth] exchange', err.message);
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
        // 5 min TTL — without this, a session could keep an unused
        // challenge alive for the entire 24h cookie life.
        req.session.passkeyRegChallenge = {
            challenge: options.challenge,
            expiresAt: Date.now() + 5 * 60 * 1000,
        };
        res.json(options);
    } catch (err) {
        console.error('passkey register begin:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/account/passkey/register-complete', requireAccount, async (req, res) => {
    const stored = req.session.passkeyRegChallenge;
    req.session.passkeyRegChallenge = null;
    if (!stored?.challenge) return res.status(400).json({ error: 'Pas de challenge en cours' });
    if (stored.expiresAt && Date.now() > stored.expiresAt) {
        return res.status(400).json({ error: 'Challenge expiré' });
    }
    const expectedChallenge = stored.challenge;

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
        // Always 200 with a generic challenge to avoid user enumeration.
        // For unknown identifiers we fabricate a deterministic-looking
        // dummy `allowCredentials` derived from a hash of the identifier
        // so the response shape (and roughly the size) matches what a
        // real account would return — defeats the trivial timing/size
        // distinguisher that "empty allowCredentials = unknown user".
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
        } else {
            const seed = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'shardtown')
                .update(`passkey-decoy:${identifier}`).digest();
            const decoyCount = (seed[0] % 2) + 1; // 1 or 2 dummy creds
            for (let i = 0; i < decoyCount; i++) {
                const buf = crypto.createHash('sha256').update(seed).update(Buffer.from([i])).digest();
                allowCredentials.push({
                    id: bufferToB64u(buf),
                    transports: ['internal', 'hybrid'],
                });
            }
        }
        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });
        req.session.passkeyAuthChallenge = {
            challenge: options.challenge,
            accountId: a?.id || null,
            expiresAt: Date.now() + 5 * 60 * 1000,
        };
        res.json(options);
    } catch (err) {
        console.error('passkey auth begin:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/account/passkey/auth-complete', accountAuthLimiter, async (req, res) => {
    const stored = req.session.passkeyAuthChallenge;
    req.session.passkeyAuthChallenge = null;
    if (!stored?.challenge) return res.status(400).json({ error: 'Pas de challenge en cours' });
    if (stored.expiresAt && Date.now() > stored.expiresAt) {
        return res.status(400).json({ error: 'Challenge expiré' });
    }

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
        let token = decryptToken(a.discord_access_token);
        const refreshTokenPlain = decryptToken(a.discord_refresh_token);
        const expired = a.discord_token_expires_at && new Date(a.discord_token_expires_at) < new Date();
        if (expired && refreshTokenPlain) {
            const refreshed = await axios.post(
                'https://discord.com/api/v10/oauth2/token',
                new URLSearchParams({
                    client_id: process.env.CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: refreshTokenPlain,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
            );
            token = refreshed.data.access_token;
            await db.execute(
                `UPDATE accounts SET discord_access_token = ?, discord_refresh_token = ?,
                  discord_token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?`,
                [
                    encryptToken(refreshed.data.access_token),
                    encryptToken(refreshed.data.refresh_token),
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

// Same but for the Shard bot's separate Discord OAuth.
app.post('/api/account/shard/refresh-guilds', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, shard_access_token, shard_refresh_token, shard_token_expires_at
             FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a || !a.shard_access_token) return res.status(400).json({ error: 'Aucun Shard lié' });
        let token = decryptToken(a.shard_access_token);
        const refreshTokenPlain = decryptToken(a.shard_refresh_token);
        const expired = a.shard_token_expires_at && new Date(a.shard_token_expires_at) < new Date();
        if (expired && refreshTokenPlain) {
            const refreshed = await axios.post(
                'https://discord.com/api/v10/oauth2/token',
                new URLSearchParams({
                    client_id: process.env.SHARD_CLIENT_ID,
                    client_secret: process.env.SHARD_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: refreshTokenPlain,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
            );
            token = refreshed.data.access_token;
            await db.execute(
                `UPDATE accounts SET shard_access_token = ?, shard_refresh_token = ?,
                  shard_token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?`,
                [
                    encryptToken(refreshed.data.access_token),
                    encryptToken(refreshed.data.refresh_token),
                    Math.max(60, parseInt(refreshed.data.expires_in, 10) || 0),
                    a.id,
                ],
            );
        }
        const guilds = await fetchDiscordGuildsFor(token);
        await db.execute(
            'UPDATE accounts SET shard_guilds_json = ?, shard_guilds_fetched_at = NOW() WHERE id = ?',
            [JSON.stringify(guilds), a.id],
        );
        res.json({ success: true, guilds_count: guilds.length });
    } catch (err) {
        // Token issued before the `guilds` scope was added returns 401 here.
        // Surface a hint so the UI can suggest re-linking.
        const status = err.response?.status;
        if (status === 401 || status === 403) {
            return res.status(403).json({ error: 'Re-liaison requise', reason: 'scope' });
        }
        console.error('shard refresh-guilds:', err.response?.data || err.message);
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

// ─── A2F / 2FA ───────────────────────────────────────────────────────────────

// Statut A2F du compte connecté
app.get('/api/account/2fa/status', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT totp_enabled, email_2fa_enabled FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a) return res.status(401).json({ error: 'Compte introuvable' });
        res.json({ totpEnabled: !!a.totp_enabled, emailTwoFaEnabled: !!a.email_2fa_enabled });
    } catch (err) {
        console.error('2fa/status:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Générer un secret TOTP temporaire + QR code (stocké en session, pas encore en DB)
app.post('/api/account/2fa/totp/setup', requireAccount, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT pseudo, email FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a) return res.status(401).json({ error: 'Compte introuvable' });
        const secret = authenticator.generateSecret();
        const otpAuthUrl = authenticator.keyuri(a.email, 'Shardtown', secret);
        const qrDataUri = await QRCode.toDataURL(otpAuthUrl, { width: 200, margin: 1, color: { dark: '#ffffffff', light: '#00000000' } });
        req.session.totp2faSetupSecret = secret;
        await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
        res.json({ secret, qrDataUri });
    } catch (err) {
        console.error('2fa/totp/setup:', err.stack || err.message);
        res.status(500).json({ error: err.message || 'Erreur serveur' });
    }
});

// Confirmer le setup TOTP : vérifier le premier code, sauvegarder en DB
app.post('/api/account/2fa/totp/confirm', requireAccount, async (req, res) => {
    try {
        const code = String(req.body?.code || '').replace(/\s/g, '');
        const secret = req.session.totp2faSetupSecret;
        if (!secret) return res.status(400).json({ error: 'Session de configuration expirée. Recommence.' });
        if (!authenticator.verify({ token: code, secret })) {
            return res.status(400).json({ error: 'Code invalide. Vérifie que l\'heure de ton appareil est correcte.' });
        }
        await db.execute(
            `UPDATE accounts SET totp_secret = ?, totp_enabled = 1 WHERE id = ?`,
            [secret, req.session.account.id],
        );
        delete req.session.totp2faSetupSecret;
        res.json({ success: true });
    } catch (err) {
        console.error('2fa/totp/confirm:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Désactiver le TOTP (requiert le code TOTP actuel)
app.post('/api/account/2fa/totp/disable', requireAccount, async (req, res) => {
    try {
        const code = String(req.body?.code || '').replace(/\s/g, '');
        const [rows] = await db.execute(
            `SELECT totp_secret FROM accounts WHERE id = ? LIMIT 1`,
            [req.session.account.id],
        );
        const a = rows[0];
        if (!a?.totp_secret) return res.status(400).json({ error: 'TOTP non activé.' });
        if (!authenticator.verify({ token: code, secret: a.totp_secret })) {
            return res.status(401).json({ error: 'Code TOTP invalide.' });
        }
        await db.execute(
            `UPDATE accounts SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?`,
            [req.session.account.id],
        );
        res.json({ success: true });
    } catch (err) {
        console.error('2fa/totp/disable:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Vérification A2F lors du login (après le mot de passe)
app.post('/api/account/2fa/verify', accountAuthLimiter, async (req, res) => {
    try {
        const pendingTokenRaw = String(req.body?.pendingToken || '');
        const totpCode = String(req.body?.totpCode || '').replace(/\s/g, '');
        const emailCode = String(req.body?.emailCode || '').replace(/\s/g, '');
        if (!pendingTokenRaw) return res.status(400).json({ error: 'Token requis.' });

        const tokenHash = crypto.createHash('sha256').update(pendingTokenRaw).digest('hex');
        const [pendingRows] = await db.execute(
            `SELECT * FROM account_2fa_pending WHERE token_hash = ? AND expires_at > NOW() LIMIT 1`,
            [tokenHash],
        );
        const pending = pendingRows[0];
        if (!pending) return res.status(401).json({ error: 'Session A2F expirée ou invalide. Reconnecte-toi.' });

        const [accountRows] = await db.execute(
            `SELECT * FROM accounts WHERE id = ? LIMIT 1`,
            [pending.account_id],
        );
        const a = accountRows[0];
        if (!a) return res.status(401).json({ error: 'Compte introuvable.' });

        // Vérifier TOTP
        if (!totpCode) return res.status(400).json({ error: 'Code TOTP requis.' });
        if (!authenticator.verify({ token: totpCode, secret: a.totp_secret })) {
            return res.status(401).json({ error: 'Code TOTP invalide.' });
        }

        // Supprimer le pending, créer la session
        await db.execute(`DELETE FROM account_2fa_pending WHERE token_hash = ?`, [tokenHash]);
        await db.execute('UPDATE accounts SET last_login_at = NOW() WHERE id = ?', [a.id]);
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'Erreur serveur' });
            req.session.account = { id: a.id, loginAt: Date.now() };
            res.json({ account: publicAccount(a) });
        });
    } catch (err) {
        console.error('2fa/verify:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Premium summary for the desktop "Mon compte" / Premium pages.
// Returns whether the user currently has at least one server with active
// premium, plus the list of those servers with name + thumbnail. Drives
// the "Basique / Premium" badge in the desktop shell.
app.get('/api/account/premium', async (req, res) => {
    if (!req.user) return res.json({ is_premium: false, guilds: [] });
    try {
        const adminGuilds = req.user.guilds.filter(g => hasGuildAdmin(g));
        if (adminGuilds.length === 0) return res.json({ is_premium: false, guilds: [] });
        const ids = adminGuilds.map(g => g.id);
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await db.execute(
            `SELECT guildId, isPremium FROM settings WHERE guildId IN (${placeholders})`,
            ids,
        );
        const premiumIds = new Set(rows.filter(r => Number(r.isPremium) === 1).map(r => String(r.guildId)));
        const guilds = adminGuilds
            .filter(g => premiumIds.has(String(g.id)))
            .map(g => ({ id: g.id, name: g.name, icon: g.icon || null }));
        res.json({ is_premium: guilds.length > 0, guilds });
    } catch {
        res.json({ is_premium: false, guilds: [] });
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
            .filter(g => hasGuildAdmin(g))
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
            .filter(g => hasGuildAdmin(g))
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
    const userGuild = req.user.guilds.find(g => g.id === guildId && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Vous n\'êtes pas administrateur de ce serveur.' });
    // Re-verify admin live with Discord — the session-cached guild list
    // is a 24h OAuth snapshot, so without this a deposed admin can still
    // buy Premium for a server they no longer manage.
    if (!(await isGuildAdminLive(req.user.id, guildId, process.env.DISCORD_TOKEN))) {
        return res.status(403).json({ success: false, error: 'Vous n\'êtes plus administrateur de ce serveur.' });
    }
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

// ─── Codes promo Shardtown ──────────────────────────────────────────
//
// Codes promo créés par l'admin ou par le bot Shard (slash command),
// appliqués au checkout pour réduire le montant prélevé. Diffère des
// redeem_codes qui activent Premium directement (skip checkout).
//
// Stockage : table promo_codes (cf. connectDB). Discount au format
// percent (1-100) ou fixed (centimes). applies_to filtre par plan.
//
// Helpers exposés ici pour pouvoir réutiliser dans /api/premium/payment-intent
// (validation + application au montant) et dans /api/premium/promo/validate
// (pré-validation côté UI checkout).

/** Charge + valide un code promo. Renvoie { ok, row } ou { ok:false, error }. */
async function loadPromoCode(code, plan) {
    if (!code || typeof code !== 'string') return { ok: false, error: 'Code invalide.' };
    const normalized = code.trim().toUpperCase();
    if (normalized.length === 0 || normalized.length > 64) return { ok: false, error: 'Code invalide.' };
    try {
        const [rows] = await db.execute('SELECT * FROM promo_codes WHERE code = ?', [normalized]);
        const row = rows[0];
        if (!row) return { ok: false, error: 'Code promo introuvable.' };
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
            return { ok: false, error: 'Code expiré.' };
        }
        if (row.max_uses > 0 && row.used_count >= row.max_uses) {
            return { ok: false, error: 'Code épuisé.' };
        }
        if (row.applies_to && row.applies_to !== 'all' && row.applies_to !== plan) {
            return { ok: false, error: `Ce code n'est utilisable que sur le plan ${row.applies_to}.` };
        }
        return { ok: true, row };
    } catch (err) {
        console.error('loadPromoCode:', err.message);
        return { ok: false, error: 'Erreur lors de la vérification du code.' };
    }
}

/** Applique un discount à un montant en centimes. Plancher à 0. */
function applyDiscount(amountCents, row) {
    if (row.discount_type === 'percent') {
        const pct = Math.max(0, Math.min(100, parseInt(row.discount_value) || 0));
        return Math.max(0, Math.round(amountCents * (100 - pct) / 100));
    }
    if (row.discount_type === 'fixed') {
        const off = Math.max(0, parseInt(row.discount_value) || 0);
        return Math.max(0, amountCents - off);
    }
    return amountCents;
}

// Pré-validation côté UI : on permet à la modale checkout d'afficher
// le discount appliqué avant que l'utilisateur clique "Payer".
app.post('/api/premium/promo/validate', async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Non connecté.' });
    const { code, plan } = req.body || {};
    const planChoice = plan === 'monthly' || plan === 'yearly' ? plan : 'lifetime';
    const r = await loadPromoCode(code, planChoice);
    if (!r.ok) return res.status(400).json({ success: false, error: r.error });
    // Renvoie au client la structure du discount sans exposer l'usage interne.
    res.json({
        success: true,
        code: r.row.code,
        discountType: r.row.discount_type,
        discountValue: r.row.discount_value,
        appliesTo: r.row.applies_to,
        expiresAt: r.row.expires_at,
    });
});

// ─── Bot Shard API (clé partagée) ─────────────────────────────────
// Endpoints internes appelés par le bot Discord pour créer / lister
// les codes promo via slash commands. Auth via header
// `X-Bot-Key: <BOT_API_KEY>`. La clé doit matcher process.env.BOT_API_KEY.
// Si la variable d'env est vide, ces endpoints sont désactivés.

function checkBotKey(req, res, next) {
    const expected = process.env.BOT_API_KEY;
    if (!expected || expected.length < 16) {
        return res.status(503).json({ success: false, error: 'API bot désactivée (BOT_API_KEY manquant).' });
    }
    const provided = req.headers['x-bot-key'];
    if (typeof provided !== 'string' || !timingSafeEqual(provided, expected)) {
        return res.status(401).json({ success: false, error: 'Clé bot invalide.' });
    }
    next();
}

// Crée un code promo. Le bot envoie discord_user_id du créateur dans
// le body pour traçabilité (sera stocké dans created_by).
app.post('/api/bot/promo-codes', checkBotKey, async (req, res) => {
    const {
        code, discountType, discountValue,
        appliesTo, maxUses, expiresAt, createdBy,
    } = req.body || {};
    if (!code || typeof code !== 'string') return res.status(400).json({ success: false, error: 'code requis.' });
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(normalized)) {
        return res.status(400).json({ success: false, error: 'code: 3-64 caractères, A-Z 0-9 _ - uniquement.' });
    }
    const dType = discountType === 'fixed' ? 'fixed' : 'percent';
    const dValue = parseInt(discountValue);
    if (!Number.isFinite(dValue) || dValue <= 0) {
        return res.status(400).json({ success: false, error: 'discountValue: entier > 0 requis.' });
    }
    if (dType === 'percent' && dValue > 100) {
        return res.status(400).json({ success: false, error: 'percent: max 100.' });
    }
    const allowedTargets = ['all', 'monthly', 'yearly', 'lifetime'];
    const target = allowedTargets.includes(appliesTo) ? appliesTo : 'all';
    const maxU = Number.isFinite(parseInt(maxUses)) ? Math.max(0, parseInt(maxUses)) : 0;
    let expSql = null;
    if (expiresAt) {
        const d = new Date(expiresAt);
        if (Number.isFinite(d.getTime())) expSql = d;
    }
    const createdByStr = typeof createdBy === 'string' ? createdBy.slice(0, 64) : '';

    try {
        await db.execute(
            `INSERT INTO promo_codes (code, discount_type, discount_value, applies_to, max_uses, expires_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [normalized, dType, dValue, target, maxU, expSql, createdByStr],
        );
        res.json({ success: true, code: normalized });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Ce code existe déjà.' });
        }
        console.error('POST /api/bot/promo-codes:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur.' });
    }
});

// Liste tous les codes promo (le bot peut afficher la liste à un admin).
app.get('/api/bot/promo-codes', checkBotKey, async (_req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT code, discount_type, discount_value, applies_to,
                    max_uses, used_count, expires_at, created_by, created_at
             FROM promo_codes ORDER BY created_at DESC LIMIT 200`,
        );
        res.json({ success: true, codes: rows });
    } catch (err) {
        console.error('GET /api/bot/promo-codes:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur.' });
    }
});

app.delete('/api/bot/promo-codes/:code', checkBotKey, async (req, res) => {
    const normalized = String(req.params.code || '').trim().toUpperCase();
    try {
        const [r] = await db.execute('DELETE FROM promo_codes WHERE code = ?', [normalized]);
        if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'Code introuvable.' });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/bot/promo-codes:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur.' });
    }
});

// ─── Stripe Elements (terminal de paiement embedded Shardtown) ──────
//
// Le flow "embedded" remplace progressivement le redirect vers Stripe
// Checkout : la carte est saisie via Stripe Elements dans la modale
// CheckoutModal, et confirmée côté client par stripe.confirmPayment().
// On crée ici l'intent (PaymentIntent ou Subscription) côté serveur et
// on renvoie un client_secret que le front utilise pour confirmer.
//
// Sécurité : la clé publishable est sûre à exposer côté client — c'est
// son but. La clé secret reste exclusivement côté serveur. Le webhook
// /webhook/stripe existant traite déjà invoice.paid + checkout.session.completed ;
// on lui ajoute payment_intent.succeeded juste en dessous pour le cas
// lifetime (one-shot).
app.get('/api/stripe/config', (_req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    });
});

app.post('/api/premium/payment-intent', checkoutRateLimiter, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Non connecté.' });
    const { guildId, plan } = req.body;
    if (!guildId || !isValidSnowflake(String(guildId))) {
        return res.status(400).json({ success: false, error: 'Serveur requis.' });
    }
    const planChoice = plan === 'monthly' || plan === 'yearly' ? plan : 'lifetime';

    const userGuild = req.user.guilds.find(g => g.id === guildId && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Vous n\'êtes pas administrateur de ce serveur.' });
    // Vérif live avec SHARD_TOKEN — c'est le bot unifié qui est présent
    // sur les serveurs de l'utilisateur. DISCORD_TOKEN est l'ancien
    // legacy ShardGuard et n'est plus garanti d'être sur les guilds.
    if (!(await isGuildAdminLive(req.user.id, guildId, process.env.SHARD_TOKEN))) {
        return res.status(403).json({ success: false, error: 'Vous n\'êtes plus administrateur de ce serveur.' });
    }

    try {
        const currency = process.env.STRIPE_CURRENCY || 'eur';
        const productId = process.env.STRIPE_PRODUCT_ID;

        // Montants en centimes. Défauts cohérents avec l'UI client
        // (3,99 € intro / 7,99 € full pour mensuel, 19,99 € intro /
        // 39,99 € full pour annuel, 34,99 € pour lifetime). L'intro est
        // pour l'instant ignoré côté Stripe — à brancher plus tard via
        // un coupon "first month" pour matcher le pricing affiché.
        const baseAmount = planChoice === 'lifetime'
            ? parseInt(process.env.STRIPE_LIFETIME_AMOUNT || '3499')
            : planChoice === 'yearly'
                ? parseInt(process.env.STRIPE_YEARLY_AMOUNT || '3999')
                : parseInt(process.env.STRIPE_MONTHLY_AMOUNT || '799');

        // Code promo — optionnel. On valide ici aussi (en plus du
        // /validate côté front) pour éviter qu'un client malicieux
        // soumette directement un code après avoir contourné la
        // validation. Si valide, on déduit du montant. On log
        // l'utilisation seulement après confirmation du paiement
        // (cf. webhook).
        const rawPromo = typeof req.body.promoCode === 'string' ? req.body.promoCode.trim().toUpperCase() : '';
        let promoApplied = null;
        let amount = baseAmount;
        if (rawPromo) {
            const promo = await loadPromoCode(rawPromo, planChoice);
            if (!promo.ok) {
                return res.status(400).json({ success: false, error: promo.error });
            }
            amount = applyDiscount(baseAmount, promo.row);
            promoApplied = {
                code: promo.row.code,
                discountType: promo.row.discount_type,
                discountValue: promo.row.discount_value,
            };
        }
        // Stripe refuse les montants < 50 cents. On floor à ce seuil.
        if (amount < 50) amount = 50;

        const rawEmail = typeof req.user?.email === 'string' ? req.user.email.trim() : '';
        const safeEmail = rawEmail.length > 0 && rawEmail.length <= 254
            && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
            ? rawEmail
            : undefined;

        const metadata = {
            guildId,
            guildName: userGuild.name,
            plan: planChoice,
            discordUserId: req.user.id,
            // Si un code promo a été appliqué, on l'embarque dans le
            // metadata Stripe — le webhook s'en sert pour incrémenter
            // used_count après confirmation du paiement (et seulement à
            // ce moment-là, pour éviter qu'un code soit "consommé"
            // simplement parce que l'utilisateur a ouvert la modale).
            ...(promoApplied ? { promoCode: promoApplied.code } : {}),
        };

        if (planChoice === 'lifetime') {
            // One-shot : un simple PaymentIntent. Pas besoin de Customer ;
            // l'activation Premium se fait dans le webhook quand on reçoit
            // payment_intent.succeeded (cf. plus bas).
            // payment_method_types: ['card'] (au lieu de automatic_payment_methods)
            // pour éviter l'éparpillement Klarna/Amazon Pay/Link qui rend la
            // modale trop grande.
            const intent = await stripe.paymentIntents.create({
                amount,
                currency,
                receipt_email: safeEmail,
                metadata,
                payment_method_types: ['card'],
                description: `Shardtown Premium Lifetime — ${userGuild.name}`,
            });
            return res.json({
                success: true,
                clientSecret: intent.client_secret,
                mode: 'payment',
                amount,
                currency,
            });
        }

        // ─── Abonnement (mensuel / annuel) ──────────────────────────────
        // Pattern Stripe recommandé : créer un Customer (ou réutiliser),
        // créer la Subscription avec payment_behavior: 'default_incomplete'
        // et expand latest_invoice.payment_intent pour récupérer le
        // client_secret du premier paiement. Le front confirme avec
        // stripe.confirmPayment ; la sub passe en active sur succès.

        // Customer : on tag avec l'ID Discord pour pouvoir le retrouver.
        // Volontairement minimal pour ne pas dupliquer en cas de re-run :
        // si on a déjà créé un customer pour ce discord_id, on le réutilise.
        let customerId = null;
        try {
            const search = await stripe.customers.search({
                query: `metadata['discordUserId']:'${req.user.id}'`,
                limit: 1,
            });
            if (search.data[0]) customerId = search.data[0].id;
        } catch { /* search peut être indispo selon le compte Stripe — on fallback */ }
        if (!customerId) {
            const cust = await stripe.customers.create({
                email: safeEmail,
                metadata: { discordUserId: req.user.id, discordUsername: req.user.username || '' },
            });
            customerId = cust.id;
        }

        const interval = planChoice === 'yearly' ? 'year' : 'month';
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{
                price_data: {
                    currency,
                    product: productId,
                    unit_amount: amount,
                    recurring: { interval },
                },
            }],
            payment_behavior: 'default_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
                payment_method_types: ['card'],
            },
            // L'API Stripe a évolué : sur les comptes récents,
            // latest_invoice.payment_intent est null et c'est
            // latest_invoice.confirmation_secret.client_secret qu'il faut
            // utiliser. On expand les deux pour rester compat anciens +
            // nouveaux comptes ; on lit le premier qui répond.
            expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret'],
            metadata,
        });

        const invoice = subscription.latest_invoice;
        let clientSecret = null;
        if (invoice && typeof invoice !== 'string') {
            // Nouvelle API : confirmation_secret.client_secret
            if (invoice.confirmation_secret && invoice.confirmation_secret.client_secret) {
                clientSecret = invoice.confirmation_secret.client_secret;
            }
            // Ancienne API : payment_intent.client_secret
            if (!clientSecret && invoice.payment_intent && typeof invoice.payment_intent !== 'string') {
                clientSecret = invoice.payment_intent.client_secret || null;
            }
        }

        if (!clientSecret) {
            // Le client_secret n'a pas pu être extrait — soit l'invoice est
            // à 0 € (coupon 100 %, période d'essai), soit l'API a encore
            // changé. On log la structure exacte pour debug, et on rollback
            // la sub pour éviter une souscription orpheline.
            console.error('payment-intent: pas de client_secret dans la sub', JSON.stringify({
                subId: subscription.id,
                invoiceStatus: invoice && typeof invoice !== 'string' ? invoice.status : null,
                hasConfirmationSecret: !!(invoice && typeof invoice !== 'string' && invoice.confirmation_secret),
                hasPaymentIntent: !!(invoice && typeof invoice !== 'string' && invoice.payment_intent),
                amountDue: invoice && typeof invoice !== 'string' ? invoice.amount_due : null,
            }));
            try { await stripe.subscriptions.cancel(subscription.id); } catch { /* best effort */ }
            return res.status(500).json({
                success: false,
                error: 'Subscription créée sans intent de paiement (Stripe API non standard). Voir les logs serveur.',
            });
        }

        return res.json({
            success: true,
            clientSecret,
            subscriptionId: subscription.id,
            mode: 'subscription',
            amount,
            currency,
            interval,
        });
    } catch (err) {
        console.error('Erreur /api/premium/payment-intent:', err.message, err.type, err.code);
        // On expose le message Stripe au client pour faciliter le debug :
        // "No such product", "Invalid API key", "currency not supported"…
        // C'est sans secret et déjà visible côté Stripe Dashboard de toute façon.
        res.status(500).json({
            success: false,
            error: err.message || 'Erreur lors de la création du paiement.',
            code: err.code,
            type: err.type,
        });
    }
});

app.post('/api/redeem-code', redeemRateLimiter, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Non connecté.' });
    const { code, guildId } = req.body;
    if (!code || !guildId) return res.status(400).json({ success: false, error: 'Code et serveur requis.' });
    if (typeof code !== 'string' || code.length > 64) return res.status(400).json({ success: false, error: 'Code invalide.' });
    if (!isValidSnowflake(String(guildId))) return res.status(400).json({ success: false, error: 'Serveur invalide.' });
    const userGuild = req.user.guilds.find(g => g.id === guildId && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Vous n\'êtes pas administrateur de ce serveur.' });
    if (!(await isGuildAdminLive(req.user.id, guildId, process.env.DISCORD_TOKEN))) {
        return res.status(403).json({ success: false, error: 'Vous n\'êtes plus administrateur de ce serveur.' });
    }
    const normalized = code.trim().toUpperCase();
    try {
        // Tables already created at boot in connectDB()
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

// Lit le flag isPremium pour un serveur côté Shard. Source unique de
// vérité = la colonne `shard_settings.isPremium`, écrite uniquement par
// le webhook Stripe (server.js:925-951) ou le panel admin
// (POST /admin/bot/:botId/guild/:guildId/premium).
async function getShardPremium(guildID) {
    try {
        const [rows] = await db.execute('SELECT isPremium FROM shard_settings WHERE guildId = ?', [guildID]);
        return !!rows[0]?.isPremium;
    } catch { return false; }
}

function premiumRequiredResponse(feature) {
    return {
        success: false,
        code: 'premium_required',
        error: `Cette fonctionnalité (${feature}) nécessite Premium. Active-le sur /premium.`,
    };
}

function checkAuthShard(req, res, next) {
    if (req.session && req.session.shardUser) return next();
    // Fall back to the Shardtown account session: the Phase-2 middleware
    // synthesizes req.user from accounts.discord_* columns when a Shardtown
    // account with linked Discord is logged in. Same shape as shardUser.
    if (req.user) {
        req.session.shardUser = {
            id: req.user.id,
            username: req.user.username,
            avatar: req.user.avatar,
            guilds: req.user.guilds || [],
        };
        return next();
    }
    const isAjax = req.headers['content-type'] === 'application/json'
        || req.path.includes('/api/')
        || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isAjax) {
        return res.status(401).json({ error: 'Session expirée', redirect: '/account/login' });
    }
    req.session.shardReturnTo = req.originalUrl;
    res.redirect('/account/login');
}

// Shard dashboard data — consumed by React /shard/server
app.get('/api/shard/server', checkAuthShard, async (req, res) => {
    const shardUser = req.session.shardUser;
    const userPayload = { id: shardUser.id, username: shardUser.username, avatar: shardUser.avatar || null };
    const adminGuilds = shardUser.guilds
        .filter(guild => hasGuildAdmin(guild))
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

// Recent server-activity events for the desktop notification feed: giveaways
// and polls that have ended in the last 24 h on guilds the user can admin.
// The client passes `?since=<unix-ms>` and we only return events strictly
// newer than that, so each native notification fires exactly once.
app.get('/api/notifications/recent', checkAuthShard, async (req, res) => {
    const shardUser = req.session.shardUser;
    const adminGuildIds = (shardUser.guilds || [])
        .filter(g => hasGuildAdmin(g))
        .map(g => g.id);
    if (adminGuildIds.length === 0) return res.json({ events: [] });

    const sinceMs = Math.max(0, Number.parseInt(req.query.since, 10) || 0);
    // Hard floor at -24h so a fresh client doesn't get a flood of historical
    // events on first poll.
    const floorMs = Date.now() - 24 * 60 * 60 * 1000;
    const sinceDate = new Date(Math.max(sinceMs, floorMs));

    const placeholders = adminGuildIds.map(() => '?').join(',');
    try {
        const [giveaways] = await db.execute(
            `SELECT id, guildId, prize, endsAt FROM shard_giveaways
             WHERE ended = 1 AND endsAt > ? AND guildId IN (${placeholders})
             ORDER BY endsAt DESC LIMIT 20`,
            [sinceDate, ...adminGuildIds],
        ).catch(() => [[]]);
        const [polls] = await db.execute(
            `SELECT id, guildId, question, endsAt FROM shard_polls
             WHERE ended = 1 AND endsAt IS NOT NULL AND endsAt > ? AND guildId IN (${placeholders})
             ORDER BY endsAt DESC LIMIT 20`,
            [sinceDate, ...adminGuildIds],
        ).catch(() => [[]]);

        const guildNameById = new Map(
            (shardUser.guilds || []).map(g => [g.id, g.name || g.id]),
        );

        const events = [
            ...giveaways.map(g => ({
                id: `giveaway-${g.id}`,
                type: 'giveaway',
                title: g.prize,
                guildId: g.guildId,
                guildName: guildNameById.get(g.guildId) || g.guildId,
                timestamp: new Date(g.endsAt).getTime(),
            })),
            ...polls.map(p => ({
                id: `poll-${p.id}`,
                type: 'poll',
                title: p.question,
                guildId: p.guildId,
                guildName: guildNameById.get(p.guildId) || p.guildId,
                timestamp: new Date(p.endsAt).getTime(),
            })),
        ].sort((a, b) => b.timestamp - a.timestamp);

        res.json({ events });
    } catch (err) {
        console.error('Erreur /api/notifications/recent:', err.message);
        res.status(500).json({ events: [], error: 'Erreur serveur' });
    }
});

// ─── APNs push notifications ────────────────────────────────────────────
// Tokens registered by the Tauri desktop after the OS hands them back via
// `application:didRegisterForRemoteNotificationsWithDeviceToken:`. Stored
// per Shardtown account so we can push to every device the user has
// signed in on.

function currentAccountId(req) {
    return req.session?.account?.id || null;
}

app.post('/api/push/register', async (req, res) => {
    const accountId = currentAccountId(req);
    if (!accountId) return res.status(401).json({ error: 'Auth requise' });
    const { deviceToken, platform } = req.body || {};
    if (typeof deviceToken !== 'string' || !/^[0-9a-fA-F]{40,200}$/.test(deviceToken)) {
        return res.status(400).json({ error: 'deviceToken invalide' });
    }
    const plat = platform === 'ios' ? 'ios' : 'macos';
    try {
        await db.execute(
            `INSERT INTO push_device_tokens (account_id, device_token, platform)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE last_used_at = NOW(), platform = VALUES(platform)`,
            [accountId, deviceToken, plat],
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Erreur /api/push/register:', e.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/push/unregister', async (req, res) => {
    const accountId = currentAccountId(req);
    if (!accountId) return res.status(401).json({ error: 'Auth requise' });
    const { deviceToken } = req.body || {};
    if (typeof deviceToken !== 'string' || !deviceToken) {
        return res.status(400).json({ error: 'deviceToken requis' });
    }
    try {
        await db.execute(
            `DELETE FROM push_device_tokens WHERE account_id = ? AND device_token = ?`,
            [accountId, deviceToken],
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Erreur /api/push/unregister:', e.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * Push helper used by the rest of server.js — sends one notification to
 * every device the given Shardtown account has registered. Tokens that
 * come back permanently dead (410 / BadDeviceToken / Unregistered) are
 * deleted from the store on the same pass.
 */
async function pushToAccount(accountId, { title, body, extra }) {
    if (!apns.isConfigured()) return { sent: 0, dead: 0, skipped: 'APNS_NOT_CONFIGURED' };
    try {
        const [rows] = await db.execute(
            `SELECT device_token FROM push_device_tokens WHERE account_id = ?`,
            [accountId],
        );
        if (rows.length === 0) return { sent: 0, dead: 0 };
        const tokens = rows.map(r => r.device_token);
        const results = await apns.sendPushBatch(tokens, { title, body, extra });
        const dead = results.filter(r => apns.isDeadToken(r)).map(r => r.deviceToken);
        if (dead.length > 0) {
            await db.execute(
                `DELETE FROM push_device_tokens WHERE account_id = ? AND device_token IN (${dead.map(() => '?').join(',')})`,
                [accountId, ...dead],
            );
        }
        return { sent: results.filter(r => r.ok).length, dead: dead.length };
    } catch (e) {
        console.error('Erreur pushToAccount:', e.message);
        return { sent: 0, dead: 0, error: e.message };
    }
}

// Self-service test push — handy to verify the pipeline end-to-end once
// the Rust side is wired and a device has registered a token.
app.post('/api/push/test', async (req, res) => {
    const accountId = currentAccountId(req);
    if (!accountId) return res.status(401).json({ error: 'Auth requise' });
    const result = await pushToAccount(accountId, {
        title: 'Shardtown',
        body: 'Test de notification push — si tu lis ça, le pipeline marche.',
    });
    res.json(result);
});

// Shard guild config — consumed by React /shard/guild/:id
app.get('/api/shard/guild/:guildID', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

        // Schema migrations now run once at boot in connectDB() — see
        // shardSettingsAlters and the CREATE TABLE block there. This used
        // to spam ~50 DDLs per page load and silently swallowed real
        // schema errors via `.catch(() => {})`.
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
            economyEnabled: 0, economyCurrencyName: 'coins', economyDailyMin: 50, economyDailyMax: 200,
            timezone: 'Europe/Paris', embedColor: '#5865F2',
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
        // Défaut adapté au tier : non-premium = 3 paliers (la limite gratuite),
        // premium = 10 paliers. Avant, on retournait toujours 10 — un user
        // gratuit qui sauvegardait n'importe quel autre module (anniversaires,
        // tickets, etc.) envoyait ces 10 paliers par défaut au save endpoint,
        // qui rejetait avec "Limite atteinte : 3 paliers max".
        const isPremiumForThresholds = await getShardPremium(guildID);
        const defaultThresholds = isPremiumForThresholds
            ? [100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11500, 15000]
            : [100, 250, 500];
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    const {
        welcomeChannelId = '', welcomeTitle = '', welcomeMessage = '', welcomeFooter = '', welcomeColor = '#3b82f6',
        leaveChannelId = '', leaveTitle = '', leaveMessage = '', leaveFooter = '', leaveColor = '#6b7280',
        autoRoleId = '', tempVoiceTrigger = '', tempVoiceCategory = '', tempVoiceName = '',
        levelsEnabled, xpMin = 15, xpMax = 25, xpCooldown = 60, levelUpChannelId = '',
        levelUpMessage = '', levelUpColor = '#3b82f6', levelThresholds = '',
        ticketEnabled, ticketCategoryId = '', ticketSupportRoleId = '', ticketLogChannelId = '', ticketMaxPerUser = 1,
        ticketPanelChannelId = '', ticketPanelTitle = '', ticketPanelDescription = '', ticketPanelColor = '#3b82f6',
        ticketPanelButtonLabel = 'Ouvrir un ticket',
        ticketPanelButtonEmoji = '🎫',
        ticketPanelButtonStyle = 1,
        ticketOpenTitle = '', ticketOpenDescription = '', ticketOpenFooter = '', ticketOpenColor = '#3b82f6',
        ticketCloseButtonLabel = 'Fermer le ticket',
        ticketCloseButtonEmoji = '🔒',
        ticketCloseButtonStyle = 4,
        ticketTranscriptEnabled,
        ticketLogOpenTitle = '', ticketLogOpenColor = '#3b82f6',
        ticketLogCloseTitle = '', ticketLogCloseColor = '#ef4444',
        birthdayChannelId = '', birthdayMessage = '', birthdayRoleId = '',
        economyEnabled, economyCurrencyName = 'coins', economyDailyMin = 50, economyDailyMax = 200,
        // NB : on ignore isPremiumS du body (cf. self-grant) — la vraie
        // valeur vient de la DB existante, écrite uniquement par le
        // webhook Stripe ou le panel admin.
        referralEnabled = '0',
        referralReward = 100,
        xpMultRoleId = [],
        xpMultValue = [],
        // Paramètres globaux du serveur (mee6-style)
        timezone = 'Europe/Paris',
        embedColor = '#5865F2',
    } = req.body;
    // Normalise embedColor : on n'accepte que #RRGGBB (sinon défaut).
    const normalizedEmbedColor = /^#[0-9a-fA-F]{6}$/.test(String(embedColor || '')) ? String(embedColor) : '#5865F2';
    // Timezone : on whiteliste à une chaîne de longueur raisonnable, format
    // "Region/City" ou "UTC". Si invalide → fallback Europe/Paris.
    const normalizedTimezone = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(String(timezone || '')) ? String(timezone) : 'Europe/Paris';
    const levelsEnabledVal = levelsEnabled ? 1 : 0;
    const ticketEnabledVal = ticketEnabled ? 1 : 0;
    const ticketTranscriptEnabledVal = ticketTranscriptEnabled ? 1 : 0;
    const economyEnabledVal = economyEnabled ? 1 : 0;
    const validStyles = [1, 2, 3, 4];
    const panelBtnStyle = validStyles.includes(Number(ticketPanelButtonStyle)) ? Number(ticketPanelButtonStyle) : 1;
    const closeBtnStyle = validStyles.includes(Number(ticketCloseButtonStyle)) ? Number(ticketCloseButtonStyle) : 4;
    // Préserve la valeur DB existante — un client custom ne peut plus
    // se passer Premium en réécrivant la config.
    const [existingShard] = await db.execute('SELECT isPremium FROM shard_settings WHERE guildId = ?', [guildID]);
    const isPremiumSVal = existingShard[0]?.isPremium ? 1 : 0;
    const referralEnabledVal = parseInt(referralEnabled) || 0;
    const roleIds = Array.isArray(xpMultRoleId) ? xpMultRoleId : [xpMultRoleId].filter(Boolean);
    const multVals = Array.isArray(xpMultValue) ? xpMultValue : [xpMultValue].filter(Boolean);
    const xpMults = roleIds.map((id, i) => ({ roleId: id, multiplier: parseFloat(multVals[i]) || 1 })).filter(m => m.roleId);
    const xpRoleMultipliersJson = JSON.stringify(xpMults);
    let thresholdsJson = '[]';
    let parsedThresholds = [];
    try {
        const parsed = typeof levelThresholds === 'string' ? JSON.parse(levelThresholds || '[]') : levelThresholds;
        parsedThresholds = Array.isArray(parsed) ? parsed : [];
        thresholdsJson = JSON.stringify(parsedThresholds);
    } catch { thresholdsJson = '[]'; parsedThresholds = []; }
    // Cap Paliers XP : 3 max gratuit / 20 max Premium ([Premium.tsx:56]).
    {
        const isPremiumForCheck = await getShardPremium(guildID);
        const MAX_LEVELS = isPremiumForCheck ? 20 : 3;
        if (parsedThresholds.length > MAX_LEVELS) {
            return res.status(403).json({
                success: false,
                code: 'premium_required',
                error: `Limite atteinte : ${MAX_LEVELS} paliers XP maximum ${isPremiumForCheck ? '(plafond Premium)' : "— passe Premium pour aller jusqu'à 20"} (${parsedThresholds.length} soumis).`,
            });
        }
    }
    try {
        await db.execute(`
            INSERT INTO shard_settings (guildId, welcomeChannelId, welcomeTitle, welcomeMessage, welcomeFooter, welcomeColor, leaveChannelId, leaveTitle, leaveMessage, leaveFooter, leaveColor, autoRoleId, tempVoiceTrigger, tempVoiceCategory, tempVoiceName, levelsEnabled, xpMin, xpMax, xpCooldown, levelUpChannelId, levelUpMessage, levelUpColor, levelThresholds, ticketEnabled, ticketCategoryId, ticketSupportRoleId, ticketLogChannelId, ticketMaxPerUser, ticketPanelChannelId, ticketPanelTitle, ticketPanelDescription, ticketPanelColor, ticketPanelButtonLabel, ticketPanelButtonEmoji, ticketPanelButtonStyle, ticketOpenTitle, ticketOpenDescription, ticketOpenFooter, ticketOpenColor, ticketCloseButtonLabel, ticketCloseButtonEmoji, ticketCloseButtonStyle, ticketTranscriptEnabled, ticketLogOpenTitle, ticketLogOpenColor, ticketLogCloseTitle, ticketLogCloseColor, birthdayChannelId, birthdayMessage, birthdayRoleId, economyEnabled, economyCurrencyName, economyDailyMin, economyDailyMax, isPremium, referralEnabled, referralReward, xpRoleMultipliers, timezone, embedColor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ticketPanelColor = VALUES(ticketPanelColor),
                ticketPanelButtonLabel = VALUES(ticketPanelButtonLabel),
                ticketPanelButtonEmoji = VALUES(ticketPanelButtonEmoji),
                ticketPanelButtonStyle = VALUES(ticketPanelButtonStyle),
                ticketOpenTitle = VALUES(ticketOpenTitle), ticketOpenDescription = VALUES(ticketOpenDescription),
                ticketOpenFooter = VALUES(ticketOpenFooter), ticketOpenColor = VALUES(ticketOpenColor),
                ticketCloseButtonLabel = VALUES(ticketCloseButtonLabel),
                ticketCloseButtonEmoji = VALUES(ticketCloseButtonEmoji),
                ticketCloseButtonStyle = VALUES(ticketCloseButtonStyle),
                ticketTranscriptEnabled = VALUES(ticketTranscriptEnabled),
                ticketLogOpenTitle = VALUES(ticketLogOpenTitle), ticketLogOpenColor = VALUES(ticketLogOpenColor),
                ticketLogCloseTitle = VALUES(ticketLogCloseTitle), ticketLogCloseColor = VALUES(ticketLogCloseColor),
                birthdayChannelId = VALUES(birthdayChannelId),
                birthdayMessage = VALUES(birthdayMessage), birthdayRoleId = VALUES(birthdayRoleId),
                economyEnabled = VALUES(economyEnabled), economyCurrencyName = VALUES(economyCurrencyName),
                economyDailyMin = VALUES(economyDailyMin), economyDailyMax = VALUES(economyDailyMax),
                isPremium = VALUES(isPremium), referralEnabled = VALUES(referralEnabled),
                referralReward = VALUES(referralReward), xpRoleMultipliers = VALUES(xpRoleMultipliers),
                timezone = VALUES(timezone), embedColor = VALUES(embedColor)
        `, [guildID, welcomeChannelId, welcomeTitle, welcomeMessage, welcomeFooter, welcomeColor, leaveChannelId, leaveTitle, leaveMessage, leaveFooter, leaveColor, autoRoleId, tempVoiceTrigger, tempVoiceCategory, tempVoiceName, levelsEnabledVal, xpMin, xpMax, xpCooldown, levelUpChannelId, levelUpMessage, levelUpColor, thresholdsJson, ticketEnabledVal, ticketCategoryId, ticketSupportRoleId, ticketLogChannelId, ticketMaxPerUser, ticketPanelChannelId, ticketPanelTitle, ticketPanelDescription, ticketPanelColor, ticketPanelButtonLabel, ticketPanelButtonEmoji, panelBtnStyle, ticketOpenTitle, ticketOpenDescription, ticketOpenFooter, ticketOpenColor, ticketCloseButtonLabel, ticketCloseButtonEmoji, closeBtnStyle, ticketTranscriptEnabledVal, ticketLogOpenTitle, ticketLogOpenColor, ticketLogCloseTitle, ticketLogCloseColor, birthdayChannelId, birthdayMessage, birthdayRoleId, economyEnabledVal, economyCurrencyName, economyDailyMin, economyDailyMax, isPremiumSVal, referralEnabledVal, parseInt(referralReward) || 100, xpRoleMultipliersJson, normalizedTimezone, normalizedEmbedColor]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur save shard config:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ─── Bot personnalisé (Premium) ──────────────────────────────────────
// Le user Premium colle son propre token Discord ; on stocke chiffré
// + on synchronise le nom / avatar de l'app via PATCH /users/@me.
// Pour l'instant la config est juste persistée : le worker qui spawn
// un Client Discord par bot custom arrivera plus tard.

// Helper de validation du token : appelle GET /users/@me avec
// Authorization: Bot <token>. Si Discord accepte, on récupère l'identité.
async function fetchDiscordBotIdentity(rawToken) {
    const r = await axios.get('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${rawToken}` },
        timeout: 6000,
        validateStatus: () => true,
    });
    if (r.status !== 200) {
        const err = new Error(r.data?.message || `Discord ${r.status}`);
        err.discordStatus = r.status;
        throw err;
    }
    return { id: r.data.id, username: r.data.username, avatar: r.data.avatar || null };
}

// Renvoie la conf bot custom du serveur — token jamais exposé en clair.
app.get('/api/shard/guild/:guildID/custom-bot', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ error: 'Accès refusé' });
    try {
        const [rows] = await db.execute(
            `SELECT id, guildId, name, avatarUrl, bannerUrl, botUserId,
                    presence, activityType, activityText,
                    status, statusMessage, oauthAuthorized, createdAt, updatedAt
             FROM shard_custom_bots WHERE guildId = ? LIMIT 1`,
            [guildID],
        );
        const isPremium = await getShardPremium(guildID);
        // Runtime status — l'état mémoire du manager dit si la session
        // discord.js est vraiment connectée, et combien de serveurs le bot
        // a rejoint (0 = il est en ligne mais pas invité sur ce serveur).
        const runtime = customBotManager.getRuntimeStatus(guildID);
        res.json({
            isPremium,
            bot: rows[0] || null,
            runtime,
        });
    } catch (err) {
        console.error('GET /api/shard/guild/:id/custom-bot:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Upsert : crée ou met à jour la config. Token requis à la création,
// optionnel à l'update (si vide on garde l'ancien). Validation Discord
// faite avant l'INSERT pour éviter de stocker un token mort.
app.put('/api/shard/guild/:guildID/custom-bot', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });
    if (!(await getShardPremium(guildID))) {
        return res.status(403).json(premiumRequiredResponse('bot personnalisé'));
    }
    const accountId = req.session?.account?.id;
    if (!accountId) {
        return res.status(401).json({ success: false, error: 'Compte Shardtown requis pour cette fonctionnalité.' });
    }
    const { name, avatarUrl, bannerUrl, token, presence, activityType, activityText, clientSecret } = req.body || {};
    // Le nom est dérivé du username Discord à la création si l'utilisateur
    // n'en a pas fourni (cas du flow "Activer le bot personnalisé" qui ne
    // collecte que le token et le secret — la perso vient plus tard). Pour
    // les mises à jour, on garde la contrainte 2-32 chars.
    let trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName && (trimmedName.length < 2 || trimmedName.length > 32)) {
        return res.status(400).json({ success: false, error: 'Le nom doit faire entre 2 et 32 caractères.' });
    }
    // 3 MB raisonnable pour un data URI base64 (image ~2 MB binaire). Au-delà
    // c'est probablement un upload incompressé.
    const MAX_MEDIA = 3_000_000;
    const safeAvatar = typeof avatarUrl === 'string' && avatarUrl.length <= MAX_MEDIA ? avatarUrl.trim() : '';
    const safeBanner = typeof bannerUrl === 'string' && bannerUrl.length <= MAX_MEDIA ? bannerUrl.trim() : '';
    const validPresences = ['online', 'idle', 'dnd', 'invisible'];
    const safePresence = validPresences.includes(presence) ? presence : 'online';
    const validActivities = ['none', 'playing', 'streaming', 'listening', 'watching', 'competing', 'custom'];
    const safeActivityType = validActivities.includes(activityType) ? activityType : 'listening';
    const safeActivityText = typeof activityText === 'string' && activityText.length <= 128
        ? activityText.trim()
        : '';

    const [existingRows] = await db.execute(
        'SELECT id, tokenEncrypted, botUserId, name, avatarUrl, bannerUrl, oauth2ClientSecretEncrypted FROM shard_custom_bots WHERE guildId = ? LIMIT 1',
        [guildID],
    );
    const existing = existingRows[0];

    // Token : obligatoire à la création, optionnel ensuite (sinon on
    // garde l'ancien). On valide le token via Discord avant d'écrire.
    let tokenToStore = existing?.tokenEncrypted || null;
    let rawTokenForPush = null; // utilisé pour PATCH /users/@me + restart manager
    let identity = existing ? { id: existing.botUserId } : null;
    if (token && typeof token === 'string' && token.trim().length > 0) {
        const raw = token.trim();
        // Sanity-check : un token Discord bot fait au moins 50 caractères et
        // a 3 segments séparés par des points (id.timestamp.hmac, tous b64).
        if (raw.length < 50 || raw.split('.').length !== 3) {
            return res.status(400).json({ success: false, error: 'Token invalide (format inattendu).' });
        }
        try {
            identity = await fetchDiscordBotIdentity(raw);
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: `Token rejeté par Discord (${err.discordStatus || 'réseau'}). Vérifie que tu as copié le bon token et que le bot existe encore.`,
            });
        }
        tokenToStore = encryptToken(raw);
        rawTokenForPush = raw;
    } else if (!existing) {
        return res.status(400).json({ success: false, error: 'Le token est requis pour créer le bot personnalisé.' });
    } else {
        // Pas de nouveau token : on déchiffre l'existant pour pouvoir push
        // l'identité et redémarrer le client.
        rawTokenForPush = decryptToken(existing.tokenEncrypted);
    }

    // Création : si aucun nom n'a été fourni, on utilise le username Discord
    // du bot comme valeur par défaut. Le user pourra le changer plus tard
    // depuis le form principal (étape 5 du flow d'activation).
    if (!trimmedName) {
        if (!existing && identity?.username) {
            trimmedName = identity.username.slice(0, 32);
        } else if (existing) {
            trimmedName = existing.name || 'Bot personnalisé';
        } else {
            return res.status(400).json({ success: false, error: 'Le nom est requis.' });
        }
    }

    // Secret OAuth2 (optionnel) — stocké chiffré pour permettre l'échange
    // code → access_token côté /custom-bot-auth (synchro des commandes).
    let secretToStore = existing?.oauth2ClientSecretEncrypted ?? null;
    if (typeof clientSecret === 'string' && clientSecret.trim().length > 0) {
        secretToStore = encryptToken(clientSecret.trim());
    }

    // PATCH /users/@me — pousse uniquement les champs qui ont changé.
    // Username rate-limit Discord = 2/h, donc on évite de spammer.
    // Une erreur ici (ex: rate-limit) ne fait pas échouer le save : on
    // remonte juste un `identityWarning` au client.
    let identityWarning = null;
    if (rawTokenForPush) {
        const patch = {};
        if (trimmedName && trimmedName !== existing?.name) patch.username = trimmedName;
        if (safeAvatar !== (existing?.avatarUrl || '')) patch.avatar = safeAvatar || null;
        if (safeBanner !== (existing?.bannerUrl || '')) patch.banner = safeBanner || null;
        if (Object.keys(patch).length > 0) {
            try {
                await customBotManager.pushIdentity(rawTokenForPush, patch);
            } catch (err) {
                console.error('[customBot] pushIdentity failed', guildID, err.discordStatus, err.message);
                if (err.discordStatus === 429) {
                    identityWarning = 'Discord limite les changements de nom à 2 par heure — la config est enregistrée mais l\'identité Discord sera mise à jour plus tard.';
                } else if (err.discordStatus === 400) {
                    const detail = err.discordBody?.errors ? JSON.stringify(err.discordBody.errors) : (err.message || '');
                    identityWarning = `Discord a refusé la mise à jour d'identité : ${detail.slice(0, 200)}`;
                } else {
                    identityWarning = `Mise à jour identité Discord échouée (${err.discordStatus || 'réseau'}). La config locale est enregistrée.`;
                }
            }
        }
    }

    try {
        await db.execute(
            `INSERT INTO shard_custom_bots
                (guildId, accountId, name, avatarUrl, bannerUrl, botUserId, tokenEncrypted,
                 oauth2ClientSecretEncrypted,
                 presence, activityType, activityText, status, statusMessage)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'configured', NULL)
             ON DUPLICATE KEY UPDATE
                accountId = VALUES(accountId),
                name = VALUES(name),
                avatarUrl = VALUES(avatarUrl),
                bannerUrl = VALUES(bannerUrl),
                botUserId = COALESCE(VALUES(botUserId), botUserId),
                tokenEncrypted = VALUES(tokenEncrypted),
                oauth2ClientSecretEncrypted = COALESCE(VALUES(oauth2ClientSecretEncrypted), oauth2ClientSecretEncrypted),
                presence = VALUES(presence),
                activityType = VALUES(activityType),
                activityText = VALUES(activityText),
                status = 'configured',
                statusMessage = NULL`,
            [
                guildID, accountId, trimmedName, safeAvatar, safeBanner,
                identity?.id || null, tokenToStore, secretToStore,
                safePresence, safeActivityType, safeActivityText,
            ],
        );
        const [rows] = await db.execute(
            `SELECT id, guildId, name, avatarUrl, bannerUrl, botUserId,
                    presence, activityType, activityText,
                    status, statusMessage, oauthAuthorized, createdAt, updatedAt, tokenEncrypted
             FROM shard_custom_bots WHERE guildId = ? LIMIT 1`,
            [guildID],
        );
        const fresh = rows[0];
        // Restart en arrière-plan — on attend pas la fin pour répondre.
        // Le client va appliquer la nouvelle presence/activity au prochain
        // ready event, et setStatus() écrira "running" en BDD. On passe
        // une copie au manager pour pouvoir delete tokenEncrypted de la
        // réponse HTTP sans race avec la lecture async côté manager.
        if (fresh) {
            const rowForManager = { ...fresh };
            customBotManager.restart(rowForManager).catch(err => {
                console.error('[customBot] restart failed', guildID, err.message);
            });
            delete fresh.tokenEncrypted;
        }
        res.json({ success: true, bot: fresh, identityWarning });
    } catch (err) {
        console.error('PUT /api/shard/guild/:id/custom-bot:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/shard/guild/:guildID/custom-bot', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });
    try {
        // Purge complète : le bot quitte tous ses serveurs Discord, ses
        // slash commands sont wipées au niveau application, puis le client
        // est détruit. Ensuite la row BDD est supprimée. Sans le purge, le
        // bot resterait présent dans les serveurs du user sans que rien ne
        // le contrôle depuis Shardtown.
        await customBotManager.stop(guildID, { purge: true }).catch(err => {
            console.error('[customBot] purge before delete failed', guildID, err.message);
        });
        await db.execute('DELETE FROM shard_custom_bots WHERE guildId = ?', [guildID]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/shard/guild/:id/custom-bot:', err.message);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Callback OAuth2 du flow de synchro des commandes (étape 3 d'activation).
// Le user clique "Autoriser les Permissions" → Discord OAuth s'ouvre avec
// redirect_uri=https://shardtwn.fr/custom-bot-auth&state=<guildId>. Au
// retour ici, on échange le code contre un access_token via le client
// secret stocké chiffré, puis on marque oauthAuthorized=1 et on rend une
// page HTML qui ferme la popup ou redirige vers le dashboard.
const CUSTOM_BOT_OAUTH_REDIRECT_URI = (process.env.PUBLIC_BASE_URL || 'https://shardtwn.fr') + '/custom-bot-auth';
app.get('/custom-bot-auth', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const renderResult = (title, body, ok) => {
        // Page minimaliste qui ferme la popup (window.opener) ou redirige.
        res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>body{background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box}.card{max-width:480px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center}.ok{color:#10b981}.err{color:#ef4444}h1{font-size:20px;margin:0 0 12px}p{color:rgba(255,255,255,0.7);font-size:14px;line-height:1.5;margin:0 0 16px}button{background:linear-gradient(to right,#fcd34d,#f59e0b);color:#000;border:0;padding:10px 20px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer}</style>
</head><body><div class="card">
<h1 class="${ok ? 'ok' : 'err'}">${title}</h1>
<p>${body}</p>
<button onclick="if(window.opener){window.opener.postMessage({type:'custom-bot-oauth',ok:${ok}},'*');window.close()}else{location.href='/dashboard'}">Fermer</button>
</div></body></html>`);
    };
    if (!code || !state) {
        return renderResult('Autorisation refusée', "Discord n'a pas renvoyé de code (autorisation refusée ou expirée).", false);
    }
    try {
        const [rows] = await db.execute(
            'SELECT botUserId, oauth2ClientSecretEncrypted FROM shard_custom_bots WHERE guildId = ? LIMIT 1',
            [state],
        );
        const row = rows[0];
        if (!row || !row.botUserId || !row.oauth2ClientSecretEncrypted) {
            return renderResult('Configuration manquante', "Le bot n'est pas configuré côté Shardtown ou le secret OAuth2 n'a pas été enregistré.", false);
        }
        const secret = decryptToken(row.oauth2ClientSecretEncrypted);
        if (!secret) {
            return renderResult('Configuration manquante', 'Secret OAuth2 illisible.', false);
        }
        const params = new URLSearchParams({
            client_id: row.botUserId,
            client_secret: secret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: CUSTOM_BOT_OAUTH_REDIRECT_URI,
        });
        const tokenRes = await axios.post('https://discord.com/api/v10/oauth2/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
            validateStatus: () => true,
        });
        if (tokenRes.status !== 200) {
            console.error('[custom-bot-auth] token exchange failed', tokenRes.status, tokenRes.data);
            return renderResult('Échange de code refusé', `Discord a rejeté l'échange (${tokenRes.status}). Vérifie que le client secret est correct et que ${CUSTOM_BOT_OAUTH_REDIRECT_URI} est bien dans les Redirects du portail.`, false);
        }
        await db.execute(
            'UPDATE shard_custom_bots SET oauthAuthorized = 1 WHERE guildId = ?',
            [state],
        );
        renderResult('Autorisation accordée ✓', 'Les commandes du bot personnalisé seront synchronisées sur ton serveur Discord. Tu peux fermer cette fenêtre.', true);
    } catch (err) {
        console.error('[custom-bot-auth] error', err.message);
        renderResult('Erreur serveur', "Une erreur s'est produite pendant l'autorisation. Réessaie ou contacte le support.", false);
    }
});

// /shard/guild/:guildID/transcripts is now served by /api/support/transcripts/:guildId

// Public transcript viewer — renders a Discord-themed HTML page from the
// JSON blob saved at close time. No auth: the ID is the secret.
// Supports new 8-char alphanumeric IDs (support_transcripts) and legacy 32-char hex IDs.
app.get('/transcripts/:id', async (req, res) => {
    const id = String(req.params.id || '');
    const isNewId  = /^[A-Z2-9]{8}$/i.test(id);
    const isLegacy = /^[a-f0-9]{32}$/i.test(id);
    if (!isNewId && !isLegacy) return res.status(404).send('Transcript introuvable.');

    try {
        if (isNewId) {
            const [rows] = await db.execute('SELECT * FROM support_transcripts WHERE id = ?', [id]);
            if (!rows[0]) return res.status(404).send('Transcript introuvable.');
            const t = rows[0];
            const rawMsgs = typeof t.messages === 'string' ? JSON.parse(t.messages) : (t.messages || []);
            const users = {};
            for (const m of rawMsgs) {
                if (m.author && !users[m.author.id]) {
                    users[m.author.id] = {
                        username: m.author.displayName || m.author.username,
                        avatar:   m.author.avatarURL,
                        bot:      m.author.isBot || false,
                    };
                }
            }
            const messages = rawMsgs.map(m => ({
                id:           m.id,
                timestamp:    m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
                editedAt:     m.edited ? new Date(m.timestamp).toISOString() : null,
                authorId:     m.author?.id || '',
                authorName:   m.author?.displayName || m.author?.username || '',
                authorAvatar: m.author?.avatarURL || '',
                bot:          m.author?.isBot || false,
                content:      m.content || '',
                isVoiceMessage: false,
                attachments:  (m.attachments || []).map(a => ({
                    url: a.url, name: a.name, contentType: a.contentType || '',
                    size: 0, width: null, height: null, duration: null, waveform: null,
                })),
                stickers: [],
                embeds: (m.embeds || []).map(e => ({
                    type: 'rich', title: e.title || '', description: e.description || '',
                    url: '', color: e.color ? parseInt(String(e.color).replace('#', ''), 16) : 0,
                    footer: e.footer?.text || '', footerIcon: '',
                    authorName: '', authorIcon: '', authorUrl: '',
                    image: e.image || '', thumbnail: e.thumbnail || '',
                    video: '', videoWidth: null, videoHeight: null, providerName: '',
                    fields: (e.fields || []).map(f => ({ name: f.name || '', value: f.value || '', inline: !!f.inline })),
                })),
                reply: null,
            }));
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(renderTranscript({
                channelName:   `ticket-${id}`,
                guildName:     '',
                openedByName:  t.author_pseudo || t.author_id || '',
                closedByName:  '',
                openedAt:      t.created_at,
                closedAt:      t.closed_at,
                messages, users, roles: {}, channels: {},
            }));
        }

        // Legacy 32-char hex transcript
        const [rows] = await db.execute('SELECT * FROM shard_ticket_transcripts WHERE id = ?', [id]);
        if (!rows[0]) return res.status(404).send('Transcript introuvable.');
        const t = rows[0];
        const parsed = typeof t.messages === 'string' ? JSON.parse(t.messages) : t.messages;
        const payload = Array.isArray(parsed)
            ? { messages: parsed, users: {}, roles: {}, channels: {} }
            : { messages: parsed?.messages || [], users: parsed?.users || {}, roles: parsed?.roles || {}, channels: parsed?.channels || {} };
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(renderTranscript({
            channelName: t.channelName,
            guildName:   t.guildName || '',
            openedByName: t.openedByName,
            closedByName: t.closedByName,
            openedAt: t.openedAt,
            closedAt: t.closedAt,
            ...payload,
        }));
    } catch (err) {
        console.error('Erreur viewer transcript:', err.message);
        res.status(500).send('Erreur serveur.');
    }
});

function htmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Render a single message body — Discord-flavoured markdown subset.
 *
 * Strategy: tokens that produce HTML containing `<` (custom emojis,
 * mentions) are matched on the RAW input first and replaced with opaque
 * placeholders. Then we HTML-escape, apply text-only markdown (code,
 * bold, italic, autolink), turn newlines into <br>, and finally rehydrate
 * the placeholders. This way the autolink regex never sees the URL
 * inside an injected `<img src=…>`.
 */
function renderInlineMarkdown(s, { users = {}, roles = {}, channels = {} } = {}) {
    if (s == null) return '';
    let src = String(s);
    const tokens = [];
    const token = (html) => {
        const k = ` T${tokens.length} `;
        tokens.push(html);
        return k;
    };

    // 1. Code fences (triple backticks) — keep contents literal, even if
    //    they contain <, &, etc. Capture optional language tag.
    src = src.replace(/```(?:([a-zA-Z0-9_+\-]*)\n)?([\s\S]*?)```/g, (_m, lang, code) => {
        const codeEsc = htmlEscape(code);
        return token(`<pre class="code">${codeEsc}</pre>`);
    });

    // 2. Custom Discord emojis (static + animated). cdn.discordapp.com
    //    returns the right format based on the extension we pick.
    src = src.replace(/<(a?):([A-Za-z0-9_~]+):(\d{15,25})>/g, (_m, an, name, eid) => {
        const ext = an ? 'gif' : 'png';
        return token(`<img class="emoji" src="https://cdn.discordapp.com/emojis/${eid}.${ext}?size=44&quality=lossless" alt=":${htmlEscape(name)}:" title=":${htmlEscape(name)}:">`);
    });

    // 3. Mentions — try to use the captured user/role/channel maps for
    //    real names, fall back to a generic label.
    src = src.replace(/<@!?(\d{15,25})>/g, (_m, id) => {
        const u = users[id];
        return token(`<span class="mention">@${htmlEscape(u?.username || 'utilisateur')}</span>`);
    });
    src = src.replace(/<@&(\d{15,25})>/g, (_m, id) => {
        const r = roles[id];
        return token(`<span class="mention">@${htmlEscape(r?.name || 'rôle')}</span>`);
    });
    src = src.replace(/<#(\d{15,25})>/g, (_m, id) => {
        const c = channels[id];
        return token(`<span class="mention">#${htmlEscape(c?.name || 'salon')}</span>`);
    });

    // 4. Timestamps <t:UNIX[:F]>
    src = src.replace(/<t:(\d+)(?::([tTdDfFR]))?>/g, (_m, ts) => {
        const date = new Date(Number(ts) * 1000);
        const str = isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return token(`<span class="mention">${htmlEscape(str)}</span>`);
    });

    // 5. Now escape what remains.
    let out = htmlEscape(src);

    // 6. Inline code (single backtick).
    out = out.replace(/`([^`\n]+)`/g, (_m, code) => `<code class="inline-code">${code}</code>`);

    // 7. Bold / underline / strike / italic. Underline (__x__) before
    //    italic so the italic pattern doesn't eat the underscores.
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

    // 8. Plain http(s) autolinks. Strip trailing punctuation that's
    //    usually part of the sentence, not the URL.
    out = out.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    // 9. Discord-flavoured headings, applied per-line BEFORE we collapse
    //    newlines. Discord supports `# ` (H1), `## ` (H2), `### ` (H3) at
    //    the start of a line, plus `-# ` for muted subtitle text.
    out = out.split('\n').map(line => {
        let m;
        if ((m = line.match(/^### (.*)$/))) return `<h3 class="md-h3">${m[1]}</h3>`;
        if ((m = line.match(/^## (.*)$/)))  return `<h2 class="md-h2">${m[1]}</h2>`;
        if ((m = line.match(/^# (.*)$/)))   return `<h1 class="md-h1">${m[1]}</h1>`;
        if ((m = line.match(/^-# (.*)$/)))  return `<div class="md-sub">${m[1]}</div>`;
        if ((m = line.match(/^&gt; (.*)$/))) return `<div class="quote">${m[1]}</div>`;
        return line;
    }).join('\n');

    // 10. Newlines → <br>, except right after a block-level element
    //    (heading / quote / subtitle) which already breaks the line.
    out = out.replace(/(<\/h[1-3]>|<\/div>)\n/g, '$1');
    out = out.replace(/\n/g, '<br>');

    // 11. Rehydrate placeholders.
    out = out.replace(/ T(\d+) /g, (_m, i) => tokens[Number(i)] || '');
    return out;
}

function renderAttachment(a) {
    const url = htmlEscape(a.url || '');
    const name = htmlEscape(a.name || 'fichier');
    const ct = String(a.contentType || '').toLowerCase();
    if (ct.startsWith('image/')) {
        return `<a href="${url}" target="_blank" rel="noopener"><img class="att-image" src="${url}" alt="${name}"></a>`;
    }
    if (ct.startsWith('video/')) {
        return `<video class="att-video" controls preload="metadata" src="${url}"></video>`;
    }
    if (ct.startsWith('audio/')) {
        const dur = a.duration ? `<span class="att-audio-meta">${Math.round(a.duration)} s</span>` : '';
        return `<div class="att-audio">
            <audio controls preload="metadata" src="${url}"></audio>
            <div class="att-audio-info">🎙️ ${name}${dur}</div>
        </div>`;
    }
    // Unknown: fall back to a labeled link with size hint.
    const sizeKb = a.size ? Math.round(a.size / 1024) : 0;
    const sizeStr = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : sizeKb ? `${sizeKb} KB` : '';
    return `<a class="att-link" href="${url}" target="_blank" rel="noopener">
        <span class="att-icon">📎</span>
        <span class="att-meta"><b>${name}</b>${sizeStr ? `<span class="att-size">${sizeStr}</span>` : ''}</span>
    </a>`;
}

function renderSticker(s) {
    // Lottie stickers (format 3) require a runtime renderer — we just
    // show a placeholder so the message isn't visually empty.
    const fmt = Number(s.format) || 1;
    if (fmt === 3) {
        return `<div class="sticker-placeholder">🎴 Sticker animé : ${htmlEscape(s.name)}</div>`;
    }
    const ext = fmt === 4 ? 'gif' : 'png';
    return `<img class="sticker" src="https://media.discordapp.net/stickers/${s.id}.${ext}?size=160" alt="${htmlEscape(s.name)}" title="${htmlEscape(s.name)}">`;
}

function renderEmbed(e, ctx) {
    const color = (typeof e.color === 'number' && e.color > 0)
        ? `--embed-accent:#${e.color.toString(16).padStart(6, '0')};`
        : '';
    const author = e.authorName
        ? `<div class="embed-author">${e.authorIcon ? `<img class="embed-author-icon" src="${htmlEscape(e.authorIcon)}">` : ''}${e.authorUrl ? `<a href="${htmlEscape(e.authorUrl)}" target="_blank" rel="noopener">${htmlEscape(e.authorName)}</a>` : htmlEscape(e.authorName)}</div>`
        : '';
    const title = e.title
        ? `<div class="embed-title">${e.url ? `<a href="${htmlEscape(e.url)}" target="_blank" rel="noopener">${renderInlineMarkdown(e.title, ctx)}</a>` : renderInlineMarkdown(e.title, ctx)}</div>`
        : '';
    const desc = e.description ? `<div class="embed-desc">${renderInlineMarkdown(e.description, ctx)}</div>` : '';
    const fields = (e.fields || []).length
        ? `<div class="embed-fields">${e.fields.map(f => `<div class="embed-field ${f.inline ? 'inline' : ''}"><div class="embed-field-name">${renderInlineMarkdown(f.name, ctx)}</div><div class="embed-field-value">${renderInlineMarkdown(f.value, ctx)}</div></div>`).join('')}</div>`
        : '';

    // Tenor / Giphy / Streamable / etc. send "gifv" embeds whose video.url
    // is the actual MP4. Auto-playing them loop+muted matches Discord.
    let media = '';
    if (e.video && (e.type === 'gifv' || e.type === 'video')) {
        media = `<video class="embed-media" src="${htmlEscape(e.video)}" autoplay loop muted playsinline></video>`;
    } else if (e.image) {
        media = `<a href="${htmlEscape(e.image)}" target="_blank" rel="noopener"><img class="embed-media" src="${htmlEscape(e.image)}"></a>`;
    } else if (e.thumbnail) {
        media = `<a href="${htmlEscape(e.thumbnail)}" target="_blank" rel="noopener"><img class="embed-thumb" src="${htmlEscape(e.thumbnail)}"></a>`;
    }

    const footer = e.footer
        ? `<div class="embed-footer">${e.footerIcon ? `<img class="embed-footer-icon" src="${htmlEscape(e.footerIcon)}">` : ''}${htmlEscape(e.footer)}</div>`
        : '';

    // Pure "media-only" embed (Tenor link): render just the media, no chrome.
    if (!e.title && !e.description && !author && !footer && !fields && media && (e.type === 'image' || e.type === 'gifv' || e.type === 'video')) {
        return `<div class="embed-media-only">${media}</div>`;
    }

    return `<div class="embed" style="${color}">
        ${author}${title}${desc}${fields}${media}${footer}
    </div>`;
}

function renderTranscript({ channelName, guildName, openedByName, closedByName, openedAt, closedAt, messages, users, roles, channels }) {
    const ctx = { users, roles, channels };
    const fmtDate = (d) => {
        try {
            return new Date(d).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return ''; }
    };
    const totalMessages = messages.length;
    const participants = new Set(messages.map(m => m.authorId)).size;

    // Group consecutive messages by the same author (Discord style).
    const groups = [];
    for (const m of messages) {
        const last = groups[groups.length - 1];
        // Replies break the visual grouping in Discord — treat them as new groups too.
        if (last && last.authorId === m.authorId && !m.reply && (new Date(m.timestamp) - new Date(last.lastTs)) < 5 * 60 * 1000) {
            last.messages.push(m);
            last.lastTs = m.timestamp;
        } else {
            groups.push({
                authorId: m.authorId,
                authorName: m.authorName,
                authorAvatar: m.authorAvatar,
                firstTs: m.timestamp,
                lastTs: m.timestamp,
                bot: !!m.bot,
                messages: [m],
            });
        }
    }

    const groupsHtml = groups.map(g => {
        const avatar = g.authorAvatar
            ? `<img class="avatar" src="${htmlEscape(g.authorAvatar)}" alt="">`
            : `<div class="avatar avatar-placeholder">${htmlEscape((g.authorName || '?').slice(0, 1).toUpperCase())}</div>`;
        const msgsHtml = g.messages.map(m => {
            const replyHtml = m.reply
                ? `<div class="reply"><span class="reply-author">↪ ${htmlEscape(m.reply.authorName || 'utilisateur')}</span><span class="reply-content">${renderInlineMarkdown(m.reply.content || '', ctx)}</span></div>`
                : '';
            const contentHtml = m.content ? `<div class="content">${renderInlineMarkdown(m.content, ctx)}${m.editedAt ? '<span class="edited"> (modifié)</span>' : ''}</div>` : '';
            const stickers = (m.stickers || []).map(renderSticker).join('');
            const atts = (m.attachments || []).map(renderAttachment).join('');
            const embeds = (m.embeds || []).map(e => renderEmbed(e, ctx)).join('');
            return `<div class="msg">${replyHtml}${contentHtml}${atts}${stickers}${embeds}</div>`;
        }).join('');
        return `<div class="group">
            ${avatar}
            <div class="group-body">
                <div class="head">
                    <span class="author">${htmlEscape(g.authorName)}${g.bot ? '<span class="badge">BOT</span>' : ''}</span>
                    <span class="timestamp">${fmtDate(g.firstTs)}</span>
                </div>
                ${msgsHtml}
            </div>
        </div>`;
    }).join('');

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(channelName)} — Transcript Shardtown</title>
<style>
  :root {
    --bg: #1e1f22;
    --bg-2: #2b2d31;
    --bg-3: #313338;
    --text: #dbdee1;
    --text-mut: #949ba4;
    --text-dim: #6d6f78;
    --accent: #5865f2;
    --border: rgba(255,255,255,0.06);
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 15px;
    line-height: 1.45;
  }
  .topbar {
    position: sticky; top: 0; z-index: 10;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex; align-items: center; gap: 16px;
    backdrop-filter: blur(8px);
  }
  .topbar .icon { font-size: 22px; color: var(--text-mut); }
  .topbar .name { font-weight: 700; font-size: 16px; }
  .topbar .meta { color: var(--text-mut); font-size: 12.5px; margin-left: auto; display: flex; gap: 16px; }
  .topbar .meta b { color: var(--text); font-weight: 600; }
  .container { max-width: 920px; margin: 0 auto; padding: 24px; }
  .summary {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px;
  }
  .summary .cell { display: flex; flex-direction: column; }
  .summary .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 700; margin-bottom: 2px; }
  .summary .value { font-size: 14px; font-weight: 600; }
  .group { display: flex; gap: 14px; padding: 16px 0 4px; }
  .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    flex-shrink: 0; object-fit: cover;
    background: var(--bg-3);
  }
  .avatar-placeholder {
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: var(--text-mut);
  }
  .group-body { flex: 1; min-width: 0; }
  .head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .author { font-weight: 600; color: #fff; font-size: 15px; }
  .badge {
    display: inline-block; margin-left: 6px;
    background: var(--accent); color: #fff;
    border-radius: 4px; font-size: 10px; font-weight: 700;
    padding: 1px 5px; vertical-align: middle;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .timestamp { color: var(--text-dim); font-size: 12px; }
  .msg { word-wrap: break-word; }
  .content { white-space: pre-wrap; word-break: break-word; }
  .content a { color: #00a8fc; text-decoration: none; }
  .content a:hover { text-decoration: underline; }
  .emoji { width: 22px; height: 22px; vertical-align: -5px; }
  .inline-code {
    background: var(--bg-2);
    padding: 1px 5px; border-radius: 4px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13.5px;
  }
  pre.code {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px; margin: 6px 0;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
    overflow-x: auto;
    white-space: pre-wrap; word-break: break-word;
  }
  .mention {
    color: #c9cdfb;
    background: rgba(88, 101, 242, 0.15);
    padding: 0 2px; border-radius: 3px;
    font-weight: 500;
  }
  .att-image { max-width: 100%; max-height: 360px; border-radius: 6px; margin-top: 6px; display: block; }
  .att-video { max-width: 520px; max-height: 360px; border-radius: 6px; margin-top: 6px; display: block; background: #000; }
  .att-audio {
    display: inline-flex; flex-direction: column;
    gap: 6px; margin-top: 6px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px; max-width: 480px;
  }
  .att-audio audio { width: 320px; max-width: 100%; outline: none; }
  .att-audio-info { color: var(--text-mut); font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .att-audio-meta { color: var(--text-dim); font-size: 11px; }
  .att-link {
    display: inline-flex; align-items: center; gap: 10px;
    margin-top: 6px;
    background: var(--bg-2); padding: 10px 14px;
    border-radius: 6px; color: var(--text); text-decoration: none;
    border: 1px solid var(--border);
    max-width: 420px;
  }
  .att-link:hover { background: var(--bg-3); }
  .att-icon { font-size: 18px; opacity: 0.6; }
  .att-meta { display: flex; flex-direction: column; min-width: 0; }
  .att-meta b { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .att-size { color: var(--text-dim); font-size: 11.5px; }
  .sticker { width: 160px; height: 160px; object-fit: contain; margin-top: 6px; display: block; }
  .sticker-placeholder {
    margin-top: 6px; padding: 16px;
    background: var(--bg-2); border-radius: 8px;
    color: var(--text-mut); font-size: 13px; text-align: center;
    width: 160px;
  }
  .reply {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 4px; color: var(--text-mut);
    font-size: 13px; padding-left: 14px; position: relative;
  }
  .reply::before {
    content: ""; position: absolute;
    left: 0; top: 50%; width: 10px; height: 8px;
    border-left: 2px solid var(--text-dim);
    border-top: 2px solid var(--text-dim);
    border-top-left-radius: 4px;
    transform: translateY(-50%);
  }
  .reply-author { color: var(--text); font-weight: 600; }
  .reply-content { color: var(--text-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 480px; }
  .edited { color: var(--text-dim); font-size: 11px; }
  .quote {
    display: block;
    border-left: 4px solid var(--text-dim);
    padding: 2px 0 2px 10px; margin: 2px 0;
    color: var(--text-mut);
  }
  .md-h1 { font-size: 22px; font-weight: 800; margin: 6px 0 2px; color: #fff; line-height: 1.25; }
  .md-h2 { font-size: 18px; font-weight: 700; margin: 6px 0 2px; color: #fff; line-height: 1.3; }
  .md-h3 { font-size: 15.5px; font-weight: 700; margin: 6px 0 2px; color: #fff; line-height: 1.3; }
  .md-sub { font-size: 12px; color: var(--text-mut); margin: 2px 0; }
  .embed {
    --embed-accent: var(--accent);
    margin-top: 6px;
    background: var(--bg-2);
    border-left: 4px solid var(--embed-accent);
    border-radius: 4px;
    padding: 10px 14px;
    max-width: 520px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .embed-author { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; }
  .embed-author a { color: var(--text); text-decoration: none; }
  .embed-author a:hover { text-decoration: underline; }
  .embed-author-icon { width: 24px; height: 24px; border-radius: 50%; }
  .embed-title { font-weight: 700; font-size: 15px; }
  .embed-title a { color: #00a8fc; text-decoration: none; }
  .embed-title a:hover { text-decoration: underline; }
  .embed-desc { color: var(--text); font-size: 14px; white-space: pre-wrap; }
  .embed-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 12px; margin-top: 4px; }
  .embed-field { grid-column: span 3; min-width: 0; }
  .embed-field.inline { grid-column: span 1; }
  .embed-field-name { font-size: 13px; font-weight: 700; color: var(--text); }
  .embed-field-value { font-size: 13.5px; color: var(--text); white-space: pre-wrap; }
  .embed-media { max-width: 100%; max-height: 320px; border-radius: 4px; display: block; }
  .embed-thumb { max-width: 80px; max-height: 80px; border-radius: 4px; display: block; float: right; margin-left: 14px; }
  .embed-media-only {
    margin-top: 6px;
    max-width: 400px;
  }
  .embed-media-only video,
  .embed-media-only img { max-width: 100%; border-radius: 8px; display: block; }
  .embed-footer { color: var(--text-dim); font-size: 12px; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .embed-footer-icon { width: 20px; height: 20px; border-radius: 50%; }
  .footer {
    text-align: center; color: var(--text-dim); font-size: 12px;
    padding: 32px 16px;
  }
  .footer a { color: var(--text-mut); }
</style>
</head>
<body>
  <div class="topbar">
    <span class="icon">#</span>
    <div>
      <div class="name">${htmlEscape(channelName)}</div>
      ${guildName ? `<div style="color:var(--text-mut);font-size:12px;">${htmlEscape(guildName)}</div>` : ''}
    </div>
    <div class="meta">
      <span><b>${totalMessages}</b> message${totalMessages !== 1 ? 's' : ''}</span>
      <span><b>${participants}</b> participant${participants !== 1 ? 's' : ''}</span>
    </div>
  </div>
  <div class="container">
    <div class="summary">
      <div class="cell"><span class="label">Ouvert par</span><span class="value">${htmlEscape(openedByName)}</span></div>
      <div class="cell"><span class="label">Ouvert le</span><span class="value">${fmtDate(openedAt)}</span></div>
      <div class="cell"><span class="label">Fermé par</span><span class="value">${htmlEscape(closedByName) || '—'}</span></div>
      <div class="cell"><span class="label">Fermé le</span><span class="value">${fmtDate(closedAt)}</span></div>
    </div>
    ${groupsHtml || '<p style="color:var(--text-dim);text-align:center;padding:48px;">Aucun message dans ce ticket.</p>'}
    <div class="footer">
      Transcript généré par <a href="https://shardtwn.fr">Shardtown</a> ·
      Conservé pour audit support
    </div>
  </div>
</body>
</html>`;
}

app.post('/shard/guild/:guildID/poll', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, question, choices, durationHours } = req.body;
    if (!channelId || !question || !Array.isArray(choices) || choices.length < 2) return res.status(400).json({ success: false, error: 'Données manquantes' });
    // Discord native polls only accept a fixed set of durations (1h, 4h, 8h,
    // 24h, 72h, 168h = 1 sem., 336h = 2 sem.). We clamp to the closest valid
    // option, with 24h as the default.
    const ALLOWED_HOURS = [1, 4, 8, 24, 72, 168, 336];
    const requested = Number(durationHours) || 24;
    const hours = ALLOWED_HOURS.reduce((best, h) => Math.abs(h - requested) < Math.abs(best - requested) ? h : best, ALLOWED_HOURS[0]);
    const cleanChoices = choices.slice(0, 10).map(c => String(c).slice(0, 55));
    const pollPayload = {
        poll: {
            question: { text: String(question).slice(0, 300) },
            answers: cleanChoices.map(c => ({ poll_media: { text: c } })),
            duration: hours,
            allow_multiselect: false,
            layout_type: 1
        }
    };
    try {
        const msgRes = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, pollPayload, {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' }
        });
        const messageId = msgRes.data.id;
        const endsAtDate = new Date(Date.now() + hours * 3600 * 1000);
        const [result] = await db.execute(
            `INSERT INTO shard_polls (guildId, channelId, messageId, question, choices, endsAt, anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [guildID, channelId, messageId, question, JSON.stringify(cleanChoices), endsAtDate, 0]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' });
    }
});

app.post('/shard/guild/:guildID/poll/:pollId/end', checkAuthShard, async (req, res) => {
    const { guildID, pollId } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    const [rows] = await db.execute(`SELECT * FROM shard_polls WHERE id = ? AND guildId = ?`, [pollId, guildID]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Sondage introuvable' });
    const poll = rows[0];

    // Native Discord polls are ended via POST /channels/{channel.id}/polls/{message.id}/expire.
    // If that fails (legacy poll from before the migration, or already
    // expired) we fall back to deleting the message so the user still sees
    // the poll disappear from the channel.
    const authHdr = { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' };
    try {
        await axios.post(
            `https://discord.com/api/v10/channels/${poll.channelId}/polls/${poll.messageId}/expire`,
            {},
            { headers: authHdr }
        );
        await db.execute(`UPDATE shard_polls SET ended = 1 WHERE id = ?`, [pollId]);
        return res.json({ success: true });
    } catch (err) {
        const status = err.response?.status;
        const apiMsg = err.response?.data?.message;
        console.warn(`[poll/end] /expire failed for poll ${pollId} (HTTP ${status}): ${apiMsg || err.message}`);

        // Fallback: delete the legacy message so the channel reflects the close.
        try {
            await axios.delete(
                `https://discord.com/api/v10/channels/${poll.channelId}/messages/${poll.messageId}`,
                { headers: authHdr }
            );
            await db.execute(`UPDATE shard_polls SET ended = 1 WHERE id = ?`, [pollId]);
            return res.json({ success: true, fallback: 'deleted' });
        } catch (delErr) {
            console.warn(`[poll/end] delete fallback failed: ${delErr.response?.data?.message || delErr.message}`);
            return res.status(500).json({
                success: false,
                error: apiMsg || delErr.response?.data?.message || 'Impossible de terminer le sondage. Vérifiez les permissions du bot.',
            });
        }
    }
});

app.post('/shard/guild/:guildID/giveaway', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, prize, winnersCount = 1, endsAt, gwMinRole = '', gwMinLevel = 0 } = req.body;
    if (!channelId || !prize || !endsAt) return res.status(400).json({ success: false, error: 'Données manquantes' });
    // Caps page Premium : 1 max gratuit / 5 max Premium en simultané.
    const isPremium = await getShardPremium(guildID);
    const maxActive = isPremium ? 5 : 1;
    const [active] = await db.execute(
        `SELECT COUNT(*) AS c FROM shard_giveaways WHERE guildId = ? AND ended = 0`,
        [guildID],
    );
    if ((active[0]?.c || 0) >= maxActive) {
        return res.status(403).json({
            success: false,
            code: 'premium_required',
            error: `Limite atteinte : ${maxActive} giveaway(s) actif(s) max ${isPremium ? '(plafond Premium)' : '— passe Premium pour 5 simultanés'}. Termine ou attends la fin d'un giveaway en cours.`,
        });
    }
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    // Messages programmés = Premium only ([Premium.tsx:62]).
    if (!(await getShardPremium(guildID))) {
        return res.status(403).json(premiumRequiredResponse('messages programmés'));
    }
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_scheduled WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

/* ─── Stream alerts (Twitch + YouTube) ──────────────────────────────────
 * CRUD pour gérer les streamers à surveiller par guilde. Le worker en
 * fin de fichier poll Twitch + YouTube et envoie un message Discord
 * quand un streamer passe en live (transition offline → live).
 * Toute l'écriture est gated Premium ([Premium.tsx] "Alertes Twitch/YouTube").
 */
app.get('/shard/guild/:guildID/streamers', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });
    try {
        const [rows] = await db.execute(
            `SELECT id, platform, handle, discordChannelId, mentionRoleId, customMessage, lastStreamId, lastCheckedAt
             FROM shard_streamers WHERE guildId = ? ORDER BY platform, handle`,
            [guildID],
        );
        res.json({ success: true, streamers: rows, isPremium: await getShardPremium(guildID) });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/shard/guild/:guildID/streamer', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });
    if (!(await getShardPremium(guildID))) {
        return res.status(403).json(premiumRequiredResponse('alertes Twitch/YouTube'));
    }
    const { platform, handle, discordChannelId, mentionRoleId = null, customMessage = null } = req.body;
    if (platform !== 'twitch' && platform !== 'youtube') return res.status(400).json({ success: false, error: 'platform invalide' });
    const cleanHandle = String(handle || '').trim();
    // Twitch logins : 4-25 chars, alphanum + underscore. YouTube : channelId
    // "UC..." (24 chars) ou handle "@..." (≤30 chars).
    if (platform === 'twitch' && !/^[A-Za-z0-9_]{4,25}$/.test(cleanHandle)) {
        return res.status(400).json({ success: false, error: 'Pseudo Twitch invalide (4-25 caractères alphanum + underscore).' });
    }
    if (platform === 'youtube' && !/^(UC[A-Za-z0-9_-]{22}|@[A-Za-z0-9._-]{3,30})$/.test(cleanHandle)) {
        return res.status(400).json({ success: false, error: 'YouTube : channelId ("UC...") ou handle ("@nom") attendu.' });
    }
    if (!discordChannelId || !/^\d{17,20}$/.test(String(discordChannelId))) {
        return res.status(400).json({ success: false, error: 'Salon Discord invalide' });
    }
    try {
        const [r] = await db.execute(
            `INSERT INTO shard_streamers (guildId, platform, handle, discordChannelId, mentionRoleId, customMessage)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [guildID, platform, cleanHandle, discordChannelId, mentionRoleId || null, customMessage || null],
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Ce streamer est déjà suivi sur ce serveur.' });
        }
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/shard/guild/:guildID/streamer/:id', checkAuthShard, async (req, res) => {
    const { guildID, id } = req.params;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });
    try {
        await db.execute('DELETE FROM shard_streamers WHERE id = ? AND guildId = ?', [id, guildID]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/guild/:guildID/backup', checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const user = req.user;
    const userGuild = user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    try {
        await db.execute(`DELETE FROM shard_shop WHERE id = ? AND guildId = ?`, [id, guildID]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

/**
 * Components V2 publisher — accepts a simple block list from the visual
 * editor and compiles it down to a Discord Components V2 message payload.
 *
 * Block shapes (matching status-app/src/components/shard/ComponentsBuilder.tsx):
 *   { kind: "text", content }
 *   { kind: "separator", spacing: "small" | "large", divider: bool }
 *   { kind: "section", content, accessory: { kind: "thumb", url, description? } | { kind: "button", label, url } }
 *   { kind: "gallery", items: [{ url, description? }] }
 *   { kind: "buttons", buttons: [{ label, url }] }
 *
 * Discord component types we emit:
 *   17 = Container, 10 = Text Display, 14 = Separator, 9 = Section,
 *   11 = Thumbnail (section accessory), 12 = Media Gallery, 1 = Action Row,
 *   2 = Button (link style 5)
 */
app.post('/shard/guild/:guildID/send-components', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });
    const { channelId, accentColor, blocks } = req.body;
    if (!channelId || !/^\d{17,20}$/.test(String(channelId))) return res.status(400).json({ success: false, error: 'Salon invalide' });
    if (!Array.isArray(blocks) || blocks.length === 0) return res.status(400).json({ success: false, error: 'Aucun bloc à envoyer' });

    const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
    const accentInt = parseInt(String(accentColor || '#5b6dff').replace('#', ''), 16) || 0x5b6dff;

    const components = [];
    for (const blk of blocks) {
        if (!blk || typeof blk !== 'object') continue;
        if (blk.kind === 'text' && typeof blk.content === 'string' && blk.content.trim()) {
            components.push({ type: 10, content: String(blk.content).slice(0, 4000) });
        } else if (blk.kind === 'separator') {
            components.push({
                type: 14,
                spacing: blk.spacing === 'large' ? 2 : 1,
                divider: blk.divider !== false,
            });
        } else if (blk.kind === 'section' && typeof blk.content === 'string' && blk.content.trim()) {
            const acc = blk.accessory || {};
            let accessory = null;
            if (acc.kind === 'thumb' && isHttpUrl(acc.url)) {
                accessory = { type: 11, media: { url: acc.url } };
                if (acc.description) accessory.description = String(acc.description).slice(0, 200);
            } else if (acc.kind === 'button' && isHttpUrl(acc.url)) {
                accessory = { type: 2, style: 5, label: String(acc.label || 'Ouvrir').slice(0, 80), url: acc.url };
            }
            if (!accessory) continue; // section requires an accessory
            components.push({
                type: 9,
                components: [{ type: 10, content: String(blk.content).slice(0, 4000) }],
                accessory,
            });
        } else if (blk.kind === 'gallery' && Array.isArray(blk.items)) {
            const items = blk.items.filter(it => it && isHttpUrl(it.url)).slice(0, 10).map(it => {
                const m = { media: { url: it.url } };
                if (it.description) m.description = String(it.description).slice(0, 200);
                return m;
            });
            if (items.length === 0) continue;
            components.push({ type: 12, items });
        } else if (blk.kind === 'buttons' && Array.isArray(blk.buttons)) {
            const buttons = blk.buttons.filter(b => b && isHttpUrl(b.url)).slice(0, 5).map(b => ({
                type: 2, style: 5, label: String(b.label || 'Ouvrir').slice(0, 80), url: b.url,
            }));
            if (buttons.length === 0) continue;
            components.push({ type: 1, components: buttons });
        }
    }

    if (components.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun bloc valide à envoyer.' });
    }

    const payload = {
        flags: 1 << 15, // IS_COMPONENTS_V2 = 32768
        components: [{
            type: 17,
            accent_color: accentInt,
            components,
        }],
    };

    try {
        await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, {
            headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' },
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.response?.data?.message || 'Erreur serveur' });
    }
});

app.post('/shard/guild/:guildID/send-embed', checkAuthShard, async (req, res) => {
    const guildID = req.params.guildID;
    const shardUser = req.session.shardUser;
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
    const userGuild = shardUser.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
app.get(['/api/shardguard/server', '/api/shard/mod/server'], checkAuth, async (req, res) => {
    const userPayload = { id: req.user.id, username: req.user.username, avatar: req.user.avatar || null };
    const adminGuilds = req.user.guilds
        .filter(guild => hasGuildAdmin(guild))
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

app.get('/guild/:guildID', (req, res) => res.redirect(301, `/shard/guild/${req.params.guildID}`));

// ShardGuard guild config — consumed by React /shardguard/guild/:id
app.get(['/api/shardguard/guild/:guildID', '/api/shard/mod/guild/:guildID'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.post(['/shardguard/guild/:guildID/config', '/shard/mod/guild/:guildID/config'], checkAuth, async (req, res) => {
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

    // Normalise d'abord en tableaux nettoyés (entrées vides retirées).
    // Les caps Premium ci-dessous s'appuient sur la longueur réelle.
    const rulesFrArr = Array.isArray(rules_fr) ? rules_fr.filter(r => typeof r === 'string' && r.trim()) : null;
    const rulesEnArr = Array.isArray(rules_en) ? rules_en.filter(r => typeof r === 'string' && r.trim()) : null;
    const bannedArr  = Array.isArray(bannedWords) ? bannedWords.filter(w => typeof w === 'string' && w.trim()) : null;

    let modRolesJson;
    try { modRolesJson = JSON.stringify(JSON.parse(modRoles)); } catch { modRolesJson = '[]'; }

    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    try {
        // Récupérer l'ancienne configuration pour comparer
        const [oldSettingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const oldSettings = oldSettingsRows[0] || {};

        // ─── Caps Premium ShardGuard ────────────────────────────────────
        // Aligné sur la page /premium :
        //   • Mots interdits : 3 max gratuit / illimité Premium
        //   • Règles serveur : 3 max gratuit / 20 max Premium (par langue)
        // Enforced ici à l'écriture pour qu'un client custom (ou un repost
        // direct sur l'API) ne puisse pas contourner.
        const isPremium = !!oldSettings.isPremium;
        const MAX_BANNED = isPremium ? Infinity : 3;
        const MAX_RULES = isPremium ? 20 : 3;
        if (bannedArr && bannedArr.length > MAX_BANNED) {
            return res.status(403).json({
                success: false,
                code: 'premium_required',
                error: `Limite atteinte : ${MAX_BANNED} mots interdits maximum sans Premium (${bannedArr.length} soumis). Passe Premium pour les avoir illimités.`,
            });
        }
        if (rulesFrArr && rulesFrArr.length > MAX_RULES) {
            return res.status(403).json({
                success: false,
                code: 'premium_required',
                error: `Limite atteinte : ${MAX_RULES} règles FR maximum ${isPremium ? '(plafond Premium)' : "(passe Premium pour aller jusqu'à 20)"} — ${rulesFrArr.length} soumises.`,
            });
        }
        if (rulesEnArr && rulesEnArr.length > MAX_RULES) {
            return res.status(403).json({
                success: false,
                code: 'premium_required',
                error: `Limite atteinte : ${MAX_RULES} règles EN maximum ${isPremium ? '(plafond Premium)' : "(passe Premium pour aller jusqu'à 20)"} — ${rulesEnArr.length} soumises.`,
            });
        }

        const rulesFrJson = rulesFrArr ? JSON.stringify(rulesFrArr) : rules_fr;
        const rulesEnJson = rulesEnArr ? JSON.stringify(rulesEnArr) : rules_en;
        const bannedWordsJson = bannedArr ? JSON.stringify(bannedArr) : bannedWords;

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

app.use(['/shardguard/api', '/shard/mod/api'], apiLimiter);
app.use('/shard/api', apiLimiter);
// The non-/api guild routes (config save, giveaway/poll/scheduled
// creation, etc.) write to Discord and were previously unrate-limited.
// Each successful call hits the Discord API at least once, so an
// authenticated attacker could spam them to either bloat the audit log
// or get the bot token rate-limited globally by Discord.
app.use(['/shardguard/guild', '/shard/mod/guild'], apiLimiter);
app.use('/shard/guild', apiLimiter);

app.get(['/shardguard/api/guild/:guildID/members', '/shard/mod/api/guild/:guildID/members'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.post(['/shardguard/api/guild/:guildID/member/:userId/action', '/shard/mod/api/guild/:guildID/member/:userId/action'], checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.get(['/shardguard/api/guild/:guildID/member/:userId/warns', '/shard/mod/api/guild/:guildID/member/:userId/warns'], checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.get(['/shardguard/api/guild/:guildID/member/:userId/sanctions', '/shard/mod/api/guild/:guildID/member/:userId/sanctions'], checkAuth, async (req, res) => {
    const { guildID, userId } = req.params;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.get(['/shardguard/api/guild/:guildID/logs', '/shard/mod/api/guild/:guildID/logs'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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

app.get(['/shardguard/api/guild/:guildID/audit', '/shard/mod/api/guild/:guildID/audit'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false });

    try {
        const [audit] = await db.execute('SELECT * FROM audit_logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT 20', [guildID]);
        res.json({ success: true, audit });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post(['/shardguard/api/guild/:guildID/panic', '/shard/mod/api/guild/:guildID/panic'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    // Default to activate=true when the body is empty so a bare POST locks
    // down the server (matches the UI's "Activer le mode panic" button).
    // Pass { activate: false } explicitly to unlock.
    const activate = req.body?.activate !== false;
    const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };

    try {
        const channelsRes = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/channels`, { headers });
        const textChannels = channelsRes.data.filter(c => c.type === 0 || c.type === 5);

        let channels_locked = 0;
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

                await axios.put(`https://discord.com/api/v10/channels/${channel.id}/permissions/${guildID}`, {
                    type: 0,
                    allow: allow.toString(),
                    deny: deny.toString()
                }, { headers });
                channels_locked++;
                await new Promise(r => setTimeout(r, 100));
            } catch {}
        }

        // Also nuke active invites — they're the main vector for an ongoing raid.
        // No-op when deactivating (you can't "un-delete" an invite anyway).
        let invites_deleted = 0;
        if (activate) {
            try {
                const invRes = await axios.get(`https://discord.com/api/v10/guilds/${guildID}/invites`, { headers });
                for (const inv of invRes.data || []) {
                    try {
                        await axios.delete(`https://discord.com/api/v10/invites/${inv.code}`, { headers });
                        invites_deleted++;
                        await new Promise(r => setTimeout(r, 80));
                    } catch {}
                }
            } catch {}
        }

        await db.execute('UPDATE settings SET panicModeActive = ? WHERE guildId = ?', [activate ? 1 : 0, guildID]);

        res.json({ success: true, channels_locked, invites_deleted, active: activate });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

// In-memory job tracker for mass verifications. Keyed by guildId. The
// frontend polls /verify-all/status to know when the background job is
// done, since the HTTP request itself returns immediately (Nginx kills
// requests > 60s).
const verifyJobs = new Map();
const VERIFY_JOB_TTL = 30 * 60 * 1000; // 30 min — purged after that.
setInterval(() => {
    const now = Date.now();
    for (const [k, j] of verifyJobs) {
        if (j.doneAt && now - j.doneAt > VERIFY_JOB_TTL) verifyJobs.delete(k);
    }
}, 5 * 60 * 1000).unref?.();

// Mass-assign the configured verified role to every non-bot member of the
// guild. Fire-and-forget : we respond to the HTTP request immediately and
// keep iterating the Discord API in the background, since the full run on
// a multi-thousand member guild takes minutes. The client polls
// /verify-all/status to know when it's done.
app.post(['/shardguard/api/guild/:guildID/verify-all', '/shard/mod/api/guild/:guildID/verify-all'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };

    const [settingsRows] = await db.execute('SELECT verifiedRole FROM settings WHERE guildId = ?', [guildID]);
    const verifiedRole = settingsRows[0]?.verifiedRole;
    if (!verifiedRole) {
        return res.status(400).json({
            success: false,
            error: 'Rôle vérifié non configuré dans les paramètres ShardGuard.',
        });
    }

    // If a job is already running for this guild, just return its current
    // state — don't queue a parallel one.
    const existing = verifyJobs.get(guildID);
    if (existing && existing.running) {
        return res.json({
            success: true,
            queued: true,
            running: true,
            granted: existing.granted,
            skipped: existing.skipped,
        });
    }

    const job = {
        running: true,
        startedAt: Date.now(),
        doneAt: null,
        granted: 0,
        skipped: 0,
        error: null,
    };
    verifyJobs.set(guildID, job);

    // Respond IMMEDIATELY so Nginx doesn't time out.
    res.json({ success: true, queued: true });

    // Background job — runs after the response has been sent.
    (async () => {
        try {
            let after = '0';
            const MAX_PAGES = 10;
            for (let page = 0; page < MAX_PAGES; page++) {
                const r = await axios.get(
                    `https://discord.com/api/v10/guilds/${guildID}/members?limit=1000&after=${after}`,
                    { headers },
                );
                const batch = r.data || [];
                if (batch.length === 0) break;

                for (const m of batch) {
                    if (m.user?.bot) { job.skipped++; continue; }
                    const userId = m.user?.id;
                    if (!userId) continue;
                    const hasRole = Array.isArray(m.roles) && m.roles.includes(verifiedRole);
                    const username = m.user?.username || m.nick || 'unknown';

                    // ── Case 1 : has the role already.
                    // Skip the Discord PUT but backfill a Success log if the
                    // member wasn't tracked yet (handles members verified
                    // manually outside Shardtown, who otherwise never bump
                    // the verifiedCount stat).
                    if (hasRole) {
                        try {
                            const [rows] = await db.execute(
                                'SELECT 1 FROM logs WHERE guildId = ? AND userId = ? AND status = "Success" LIMIT 1',
                                [guildID, userId],
                            );
                            if (rows.length === 0) {
                                await db.execute(
                                    `INSERT INTO logs (guildId, userId, username, event, status)
                                     VALUES (?, ?, ?, 'Backfill verified', 'Success')`,
                                    [guildID, userId, username],
                                );
                                // Treat as granted — the stat now reflects them.
                                job.granted++;
                            } else {
                                job.skipped++;
                            }
                        } catch (logErr) {
                            console.warn('[verify-all] backfill log failed:', logErr.message);
                            job.skipped++;
                        }
                        continue;
                    }

                    // ── Case 2 : missing role. Grant it + log.
                    try {
                        await axios.put(
                            `https://discord.com/api/v10/guilds/${guildID}/members/${userId}/roles/${verifiedRole}`,
                            {},
                            { headers },
                        );
                        job.granted++;
                        try {
                            // Real schema (cf ShardGuard/bot.js addLog) is:
                            //   logs(guildId, userId, username, event, status)
                            await db.execute(
                                `INSERT INTO logs (guildId, userId, username, event, status)
                                 VALUES (?, ?, ?, 'Mass verification by admin', 'Success')`,
                                [guildID, userId, username],
                            );
                        } catch (logErr) {
                            console.warn('[verify-all] log insert failed:', logErr.message);
                        }
                        await new Promise(r => setTimeout(r, 60));
                    } catch { /* member left, role hierarchy issue, etc */ }
                }

                after = batch[batch.length - 1].user?.id || after;
                if (batch.length < 1000) break;
            }
        } catch (err) {
            console.error('[verify-all] bg error:', err.response?.data || err.message);
            job.error = err.response?.data?.message || err.message || 'Erreur inconnue';
        } finally {
            job.running = false;
            job.doneAt = Date.now();
        }
    })();
});

// Frontend polling endpoint. Returns the current state of the most recent
// verification job for that guild (running counts, doneAt, error).
app.get(['/shardguard/api/guild/:guildID/verify-all/status', '/shard/mod/api/guild/:guildID/verify-all/status'], checkAuth, (req, res) => {
    const guildID = req.params.guildID;
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ error: 'Accès refusé' });
    const j = verifyJobs.get(guildID);
    if (!j) return res.json({ exists: false });
    res.json({
        exists: true,
        running: j.running,
        granted: j.granted,
        skipped: j.skipped,
        startedAt: j.startedAt,
        doneAt: j.doneAt,
        error: j.error,
    });
});

app.post(['/shardguard/api/guild/:guildID/deploy', '/shard/mod/api/guild/:guildID/deploy'], checkAuth, async (req, res) => {
    const guildID = req.params.guildID;
    const VALID_DEPLOY_TYPES = ['all', 'verification', 'accesscode'];
    const deployType = VALID_DEPLOY_TYPES.includes(req.query.type) ? req.query.type : 'all';
    const { verificationChannelId, accessCodeChannelId } = req.body;

    console.log(`[Deploy] Guild: ${guildID}, Type: ${deployType}`);

    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
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
app.post(['/shardguard/api/guild/:guildID/bulk/:action', '/shard/mod/api/guild/:guildID/bulk/:action'], checkAuth, async (req, res) => {
    const { guildID, action } = req.params;
    const VALID_BULK_ACTIONS = ['verify', 'kick'];
    if (!VALID_BULK_ACTIONS.includes(action)) return res.status(400).json({ success: false, error: 'Action invalide' });
    const userGuild = req.user.guilds.find(g => g.id === guildID && hasGuildAdmin(g));
    if (!userGuild) return res.status(403).json({ success: false, error: 'Accès refusé' });

    try {
        const [settingsRows] = await db.execute('SELECT * FROM settings WHERE guildId = ?', [guildID]);
        const settings = settingsRows[0] || { language: 'fr' };
        const roleId = settings.verifiedRole;

        const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}` };

        // Paginate through ALL members. Without this, only the first 1000
        // are processed — on a server >1000 members, "kick all unverified"
        // would silently leave a chunk untouched.
        const allMembers = [];
        let after = '0';
        for (let safety = 0; safety < 200; safety++) {
            const response = await axios.get(
                `https://discord.com/api/v10/guilds/${guildID}/members?limit=1000&after=${after}`,
                { headers },
            );
            const batch = response.data || [];
            if (batch.length === 0) break;
            allMembers.push(...batch);
            if (batch.length < 1000) break;
            after = batch[batch.length - 1].user.id;
        }
        const members = allMembers;
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
    // Either the legacy passport-discord session OR a Shardtown account
    // with a linked Discord (req.user is synthesized by the middleware
    // mounted right after passport.session). Both populate `req.user`.
    if (req.user || req.isAuthenticated()) return next();
    // Fallback symétrique à checkAuthShard : le bot étant fusionné, une
    // session Shard OAuth identifie aussi l'utilisateur pour les
    // endpoints "ShardGuard". Synth req.user depuis shardUser.
    if (req.session?.shardUser) {
        req.user = {
            id: req.session.shardUser.id,
            username: req.session.shardUser.username || '',
            global_name: req.session.shardUser.username || null,
            avatar: req.session.shardUser.avatar || null,
            discriminator: '0',
            guilds: req.session.shardUser.guilds || [],
        };
        return next();
    }
    const isAjax = req.headers['content-type'] === 'application/json'
        || req.path.includes('/api/')
        || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isAjax) {
        return res.status(401).json({ error: 'Session expirée', redirect: '/account/login' });
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/account/login');
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
        // DB hiccup — fall back to the last cached value if available.
        // Without a cache entry we fail CLOSED: an admin endpoint should
        // never grant access while we can't verify the session hasn't
        // been revoked. Operator just has to log in again once the DB
        // is back.
        return cached ? cached.valid : false;
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
    { token: process.env.SHARD_TOKEN, label: 'Shard' }
];

// Boot-time check: warn loudly if the admin password is sitting in
// plaintext in the env. We don't refuse to start (would brick existing
// deployments) but the warning is unmissable in PM2 logs and we log
// the migration command so the operator can fix it in seconds.
(function checkAdminPasswordHardening() {
    const hasHash = process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD_HASH.includes(':');
    const hasPlaintext = !!process.env.ADMIN_PASSWORD;
    if (!hasHash && !hasPlaintext) {
        console.error('❌ Aucun ADMIN_PASSWORD_HASH ni ADMIN_PASSWORD défini — abandon du boot.');
        console.error('   Génère un hash : node -e "const c=require(\'crypto\'),s=c.randomBytes(16).toString(\'hex\');' +
            'console.log(s+\':\'+c.scryptSync(process.argv[1],s,64).toString(\'hex\'))" "TON_MOT_DE_PASSE"');
        process.exit(1);
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
    // Bearer-authed requests carry an explicit Authorization header, which
    // browsers don't attach automatically — they're not vulnerable to CSRF
    // by definition. Skip the check so legacy routes that opt in to
    // verifyCsrf directly (admin login, etc.) keep working for desktop
    // clients that authenticate via PAT.
    if (req.bearerAuthed) return next();
    const token = req.body?._csrf || req.headers['x-csrf-token'];
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
        await warmBotIdCache();
        const labelToBotId = new Map();
        for (const [id, b] of botIdCache.entries()) labelToBotId.set(b.label, id);

        const result = {
            guildId,
            bots: [],
            owner: null,
            recentAuditLogs: [],
            warningsCount: 0,
            blocked: false,
            blocked_at: null,
            blocked_name: null,
            csrfToken: generateCsrfToken(req),
        };

        for (const bot of BOTS) {
            const entry = { label: bot.label, botId: labelToBotId.get(bot.label) || null, present: false };
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

// Log retention. Without this the audit/log tables grow unbounded —
// over months that's GBs of MySQL storage and slow LIKE queries on the
// `logs` filter endpoint. Runs once shortly after boot and every 24h.
// Override via LOG_RETENTION_DAYS in env (default 90 days).
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS, 10) || 90;
async function purgeOldLogs() {
    const days = LOG_RETENTION_DAYS;
    if (!Number.isFinite(days) || days <= 0) return;
    for (const tbl of ['audit_logs', 'logs', 'admin_audit_log']) {
        try {
            const col = tbl === 'admin_audit_log' ? 'created_at' : 'timestamp';
            await db.execute(
                `DELETE FROM ${tbl} WHERE ${col} < DATE_SUB(NOW(), INTERVAL ? DAY)`,
                [days],
            );
        } catch { /* table or column missing — non-fatal */ }
    }
}
setTimeout(purgeOldLogs, 30_000).unref?.();
setInterval(purgeOldLogs, 24 * 60 * 60 * 1000).unref?.();

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

// Manual premium grant / revoke per (bot, guild). isPremium est stocké
// par bot — ShardGuard → table `settings`, Shard → `shard_settings`. Tant
// qu'aucun webhook Stripe n'écrit ce flag automatiquement, c'est ici que
// les abonnements sont activés à la main.
app.post('/admin/bot/:botId/guild/:guildId/premium', checkAdmin, verifyCsrf, async (req, res) => {
    const { botId, guildId } = req.params;
    const { enabled } = req.body;
    if (!isValidSnowflake(guildId)) return res.json({ success: false, error: 'Guild ID invalide' });
    const bot = await resolveBotByBotId(botId);
    if (!bot) return res.json({ success: false, error: 'Bot introuvable' });
    const flag = enabled ? 1 : 0;
    try {
        // shard_settings est la table principale (base shardguard).
        // settings (ShardGuard) peut ne pas exister dans cette base — on
        // l'essaie en best-effort sans bloquer si la table est absente.
        await db.execute(
            `INSERT INTO shard_settings (guildId, isPremium) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE isPremium = VALUES(isPremium)`,
            [guildId, flag],
        );
        try {
            await db.execute(
                `INSERT INTO settings (guildId, isPremium) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE isPremium = VALUES(isPremium)`,
                [guildId, flag],
            );
        } catch (e) {
            // settings n'existe pas dans cette base (ShardGuard séparé) — non fatal.
            console.warn('[admin/premium] settings skip:', e.message);
        }
        await logAdminAction(req, 'premium.set', { botId, guildId }, { enabled: !!enabled, syncedBoth: true });
        res.json({ success: true, isPremium: !!enabled });
    } catch (err) {
        console.error('[admin/premium]', err.message, err.stack);
        await logAdminAction(req, 'premium.set.failed', { botId, guildId }, { error: err.message || 'Erreur serveur' });
        res.json({ success: false, error: err.message || 'Erreur serveur' });
    }
});

/* ── Admin: utilisateurs ─────────────────────────────────────────────── */

app.get('/api/admin/users', checkAdmin, async (req, res) => {
    try {
        const search = req.query.q ? `%${req.query.q}%` : null;
        const [rows] = search
            ? await db.execute(
                `SELECT id, pseudo, email, discord_id, discord_username, discord_avatar,
                        verified, totp_enabled, created_at
                 FROM accounts
                 WHERE pseudo LIKE ? OR email LIKE ? OR discord_username LIKE ?
                 ORDER BY created_at DESC LIMIT 100`,
                [search, search, search],
              )
            : await db.execute(
                `SELECT id, pseudo, email, discord_id, discord_username, discord_avatar,
                        verified, totp_enabled, created_at
                 FROM accounts ORDER BY created_at DESC LIMIT 100`,
              );

        // Récupère les guilds premium pour chaque user
        const accountIds = rows.map(r => r.id);
        let premiumMap = {};
        if (accountIds.length) {
            const [customs] = await db.execute(
                `SELECT cb.accountId, cb.guildId, ss.isPremium
                 FROM shard_custom_bots cb
                 LEFT JOIN shard_settings ss ON ss.guildId = cb.guildId
                 WHERE cb.accountId IN (${accountIds.map(() => '?').join(',')})`,
                accountIds,
            );
            for (const r of customs) {
                if (!premiumMap[r.accountId]) premiumMap[r.accountId] = { total: 0, premium: 0 };
                premiumMap[r.accountId].total++;
                if (r.isPremium) premiumMap[r.accountId].premium++;
            }
        }

        const users = rows.map(r => ({
            id: r.id,
            pseudo: r.pseudo,
            email: r.email,
            discord_id: r.discord_id || null,
            discord_username: r.discord_username || null,
            discord_avatar: r.discord_avatar || null,
            verified: !!r.verified,
            totp_enabled: !!r.totp_enabled,
            created_at: r.created_at,
            bots_total: premiumMap[r.id]?.total ?? 0,
            bots_premium: premiumMap[r.id]?.premium ?? 0,
        }));
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/user/:id/verified', checkAdmin, verifyCsrf, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: 'ID invalide' });
    const { verified } = req.body;
    try {
        await db.execute(`UPDATE accounts SET verified = ? WHERE id = ?`, [verified ? 1 : 0, userId]);
        await logAdminAction(req, 'user.verified.set', { userId }, { verified: !!verified });
        res.json({ success: true, verified: !!verified });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ── Admin: bots personnalisés ───────────────────────────────────────── */

app.get('/api/admin/custom-bots', checkAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT cb.id, cb.guildId, cb.name, cb.avatarUrl, cb.status, cb.statusMessage,
                    cb.presence, cb.activityType, cb.activityText, cb.createdAt,
                    cb.accountId, a.pseudo, a.email, a.discord_username
             FROM shard_custom_bots cb
             LEFT JOIN accounts a ON a.id = cb.accountId
             ORDER BY cb.createdAt DESC`,
        );
        const bots = rows.map(r => ({
            id: r.id,
            guildId: r.guildId,
            name: r.name,
            avatarUrl: r.avatarUrl && r.avatarUrl.length < 300 ? r.avatarUrl : null,
            status: r.status,
            statusMessage: r.statusMessage,
            presence: r.presence,
            activityType: r.activityType,
            activityText: r.activityText,
            createdAt: r.createdAt,
            accountId: r.accountId,
            ownerPseudo: r.pseudo || null,
            ownerEmail: r.email || null,
            ownerDiscord: r.discord_username || null,
            runtime: customBotManager.getRuntimeStatus(r.guildId),
        }));
        res.json({ bots });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/custom-bot/:id/disable', checkAdmin, verifyCsrf, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [[row]] = await db.execute(`SELECT guildId, name FROM shard_custom_bots WHERE id = ?`, [id]);
        if (!row) return res.status(404).json({ error: 'Bot introuvable' });
        await db.execute(`UPDATE shard_custom_bots SET status = 'admin_disabled' WHERE id = ?`, [id]);
        await customBotManager.stop(row.guildId, { reason: 'admin_disabled' });
        await logAdminAction(req, 'custom_bot.disable', { id }, { guildId: row.guildId, name: row.name });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/custom-bot/:id/enable', checkAdmin, verifyCsrf, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [[row]] = await db.execute(`SELECT guildId, name FROM shard_custom_bots WHERE id = ?`, [id]);
        if (!row) return res.status(404).json({ error: 'Bot introuvable' });
        await db.execute(`UPDATE shard_custom_bots SET status = 'configured' WHERE id = ?`, [id]);
        await customBotManager.start(row);
        await logAdminAction(req, 'custom_bot.enable', { id }, { guildId: row.guildId, name: row.name });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/custom-bot/:id', checkAdmin, verifyCsrf, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID invalide' });
    try {
        const [[row]] = await db.execute(`SELECT guildId, name FROM shard_custom_bots WHERE id = ?`, [id]);
        if (!row) return res.status(404).json({ error: 'Bot introuvable' });
        await customBotManager.stop(row.guildId, { reason: 'admin_deleted' });
        await db.execute(`DELETE FROM shard_custom_bots WHERE id = ?`, [id]);
        await logAdminAction(req, 'custom_bot.delete', { id }, { guildId: row.guildId, name: row.name });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin DB browser ──────────────────────────────────────────────────────────
require('./lib/adminDBRoutes')(app, db, checkAdmin, verifyCsrf, logAdminAction);

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

        // shard_count > 0 : exclut les artefacts de migration (anciens rows avec DEFAULT 0)
        const [history] = await db.execute('SELECT * FROM bot_stats WHERE timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY) AND shard_count > 0 ORDER BY timestamp ASC');

        // Ping Discord API independently (indépendant du bot)
        let discordApiPing = null;
        try {
            const t0 = Date.now();
            const r = await fetch('https://discord.com/api/v10/gateway', { signal: AbortSignal.timeout(5000) });
            if (r.ok) discordApiPing = Date.now() - t0;
        } catch { /* Discord API injoignable */ }

        res.json({ current: botsInfo, history, discordApiPing });
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
                const [shards] = await db.execute(
                    `SELECT status, ping FROM shard_status WHERE bot_label = ? AND last_update > DATE_SUB(NOW(), INTERVAL 2 MINUTE)`,
                    [b.label]
                );
                const onlineShards = shards.filter(s => s.status === 'Online');
                const shardCount = onlineShards.length;
                const avgLatency = onlineShards.length > 0
                    ? Math.round(onlineShards.reduce((s, x) => s + (x.ping || 0), 0) / onlineShards.length)
                    : 0;
                // N'enregistre que quand au moins un shard est en ligne pour éviter
                // des faux "rouge" dans l'historique si le bot est temporairement offline
                if (shardCount > 0) {
                    await db.execute(
                        'INSERT INTO bot_stats (bot_label, guild_count, member_count, shard_count, avg_latency) VALUES (?, ?, ?, ?, ?)',
                        [b.label, info.guilds.length, memberCount, shardCount, avgLatency]
                    );
                }
            }
        }
        console.log('📊 Stats des bots collectées');
    } catch (err) {
        console.error('Erreur collecte stats:', err.message);
    }
}

// Collecte toutes les heures
setInterval(collectStats, 60 * 60 * 1000).unref?.();
// Et au démarrage après un court délai pour laisser la DB se connecter
setTimeout(collectStats, 5000).unref?.();

/* ─── Worker stream alerts (Twitch + YouTube) ───────────────────────────
 * Boucle toutes les 90s :
 *   1. Twitch : récupère un app token (mis en cache), bat tous les
 *      streamers Twitch en un seul appel /helix/streams (jusqu'à 100
 *      logins par requête).
 *   2. YouTube : interroge un par un /videos?part=snippet,liveStreamingDetails
 *      via la search API (coûteuse en quota — voir env YOUTUBE_API_KEY).
 *   3. Pour chaque streamer, compare le lastStreamId stocké en DB. Si
 *      transition offline→live (ou changement de stream), poste un embed
 *      Discord et met à jour lastStreamId. Si offline alors qu'on avait
 *      un id stocké, on remet à NULL (prêt pour la prochaine annonce).
 * Le worker se désactive proprement si les env vars sont absentes.
 */
const STREAM_POLL_INTERVAL_MS = 90 * 1000;

let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;

async function getTwitchAppToken() {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
    if (twitchAppToken && Date.now() < twitchAppTokenExpiresAt - 60_000) return twitchAppToken;
    try {
        const r = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials',
            },
            timeout: 8000,
        });
        twitchAppToken = r.data.access_token;
        twitchAppTokenExpiresAt = Date.now() + (r.data.expires_in || 3600) * 1000;
        return twitchAppToken;
    } catch (err) {
        console.warn('[stream-alerts] Twitch token failed:', err.response?.data || err.message);
        return null;
    }
}

async function postStreamAlert(streamer, embed, mentionLine) {
    const content = [mentionLine, streamer.customMessage].filter(Boolean).join('\n') || undefined;
    try {
        await axios.post(
            `https://discord.com/api/v10/channels/${streamer.discordChannelId}/messages`,
            { content, embeds: [embed], allowed_mentions: { parse: ['roles', 'users'], replied_user: false } },
            { headers: { Authorization: `Bot ${process.env.SHARD_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 8000 },
        );
    } catch (err) {
        console.warn(`[stream-alerts] post message (guild ${streamer.guildId}):`, err.response?.data?.message || err.message);
    }
}

async function pollTwitch(streamers) {
    if (streamers.length === 0) return;
    const token = await getTwitchAppToken();
    if (!token) return;
    // /helix/streams accepte jusqu'à 100 user_login par requête.
    const chunks = [];
    for (let i = 0; i < streamers.length; i += 100) chunks.push(streamers.slice(i, i + 100));
    for (const chunk of chunks) {
        const params = new URLSearchParams();
        for (const s of chunk) params.append('user_login', s.handle.toLowerCase());
        try {
            const r = await axios.get(`https://api.twitch.tv/helix/streams?${params}`, {
                headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
                timeout: 8000,
            });
            const liveByLogin = new Map();
            for (const live of r.data?.data || []) liveByLogin.set(live.user_login.toLowerCase(), live);
            for (const s of chunk) {
                const live = liveByLogin.get(s.handle.toLowerCase());
                if (live) {
                    if (s.lastStreamId === live.id) continue; // déjà notifié
                    const thumb = live.thumbnail_url?.replace('{width}', '640').replace('{height}', '360');
                    const embed = {
                        color: 0x9146ff,
                        author: { name: `${live.user_name} est en live sur Twitch !`, url: `https://twitch.tv/${live.user_login}` },
                        title: live.title || 'Stream en cours',
                        url: `https://twitch.tv/${live.user_login}`,
                        description: live.game_name ? `🎮 **${live.game_name}**` : undefined,
                        fields: [{ name: 'Viewers', value: String(live.viewer_count ?? 0), inline: true }],
                        image: thumb ? { url: `${thumb}?t=${Date.now()}` } : undefined,
                        timestamp: live.started_at || new Date().toISOString(),
                    };
                    const mention = s.mentionRoleId ? `<@&${s.mentionRoleId}>` : '';
                    await postStreamAlert(s, embed, mention);
                    await db.execute(
                        'UPDATE shard_streamers SET lastStreamId = ?, lastCheckedAt = NOW() WHERE id = ?',
                        [live.id, s.id],
                    );
                } else if (s.lastStreamId) {
                    // Plus en live — reset pour qu'on re-notifie au prochain live.
                    await db.execute(
                        'UPDATE shard_streamers SET lastStreamId = NULL, lastCheckedAt = NOW() WHERE id = ?',
                        [s.id],
                    );
                } else {
                    await db.execute('UPDATE shard_streamers SET lastCheckedAt = NOW() WHERE id = ?', [s.id]);
                }
            }
        } catch (err) {
            console.warn('[stream-alerts] Twitch poll failed:', err.response?.data || err.message);
        }
    }
}

async function resolveYoutubeChannelId(handleOrId) {
    // Handle direct si déjà un channelId.
    if (/^UC[A-Za-z0-9_-]{22}$/.test(handleOrId)) return handleOrId;
    // Sinon résolution via /channels?forHandle=@xxx (1 unité de quota).
    if (!process.env.YOUTUBE_API_KEY) return null;
    try {
        const r = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'id', forHandle: handleOrId, key: process.env.YOUTUBE_API_KEY },
            timeout: 8000,
        });
        return r.data?.items?.[0]?.id || null;
    } catch (err) {
        console.warn('[stream-alerts] YT handle resolve failed:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

async function pollYoutube(streamers) {
    if (streamers.length === 0 || !process.env.YOUTUBE_API_KEY) return;
    // YouTube quota : search.list = 100 unités/appel, daily quota = 10k par
    // défaut. On poll donc séquentiellement et on rate-limite implicitement
    // via STREAM_POLL_INTERVAL_MS (90s) — soit ~40 streamers/jour si plein
    // régime. Au-delà tu dois demander un quota augmenté à Google ou
    // espacer (passer à 300s).
    for (const s of streamers) {
        const channelId = await resolveYoutubeChannelId(s.handle);
        if (!channelId) {
            await db.execute('UPDATE shard_streamers SET lastCheckedAt = NOW() WHERE id = ?', [s.id]);
            continue;
        }
        try {
            const r = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    channelId,
                    eventType: 'live',
                    type: 'video',
                    maxResults: 1,
                    key: process.env.YOUTUBE_API_KEY,
                },
                timeout: 8000,
            });
            const item = r.data?.items?.[0];
            if (item?.id?.videoId) {
                const videoId = item.id.videoId;
                if (s.lastStreamId === videoId) {
                    await db.execute('UPDATE shard_streamers SET lastCheckedAt = NOW() WHERE id = ?', [s.id]);
                    continue;
                }
                const snippet = item.snippet || {};
                const embed = {
                    color: 0xff0000,
                    author: { name: `${snippet.channelTitle || s.handle} est en live sur YouTube !`, url: `https://www.youtube.com/watch?v=${videoId}` },
                    title: snippet.title || 'Stream en cours',
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    description: snippet.description ? String(snippet.description).slice(0, 300) : undefined,
                    image: snippet.thumbnails?.high?.url ? { url: snippet.thumbnails.high.url } : undefined,
                    timestamp: snippet.publishedAt || new Date().toISOString(),
                };
                const mention = s.mentionRoleId ? `<@&${s.mentionRoleId}>` : '';
                await postStreamAlert(s, embed, mention);
                await db.execute(
                    'UPDATE shard_streamers SET lastStreamId = ?, lastCheckedAt = NOW() WHERE id = ?',
                    [videoId, s.id],
                );
            } else if (s.lastStreamId) {
                await db.execute(
                    'UPDATE shard_streamers SET lastStreamId = NULL, lastCheckedAt = NOW() WHERE id = ?',
                    [s.id],
                );
            } else {
                await db.execute('UPDATE shard_streamers SET lastCheckedAt = NOW() WHERE id = ?', [s.id]);
            }
        } catch (err) {
            // 403 quotaExceeded → on log et on attend le reset Google.
            console.warn('[stream-alerts] YT poll failed:', err.response?.data?.error?.message || err.message);
        }
    }
}

async function pollStreamAlerts() {
    try {
        // Ne charger que les serveurs Premium — c'est la garantie côté
        // worker en plus du gate sur le POST. Si quelqu'un avait un
        // streamer en DB puis a perdu Premium (annulation Stripe), on
        // arrête immédiatement les notifications.
        const [rows] = await db.execute(`
            SELECT s.* FROM shard_streamers s
            JOIN shard_settings ss ON ss.guildId = s.guildId
            WHERE ss.isPremium = 1
        `);
        const twitch = rows.filter(s => s.platform === 'twitch');
        const youtube = rows.filter(s => s.platform === 'youtube');
        await pollTwitch(twitch);
        await pollYoutube(youtube);
    } catch (err) {
        console.error('[stream-alerts] tick failed:', err.message);
    }
}

if (process.env.TWITCH_CLIENT_ID || process.env.YOUTUBE_API_KEY) {
    console.log('[stream-alerts] worker actif (interval 90s)');
    setInterval(pollStreamAlerts, STREAM_POLL_INTERVAL_MS).unref?.();
    setTimeout(pollStreamAlerts, 10_000).unref?.();
} else {
    console.log('[stream-alerts] worker désactivé (TWITCH_CLIENT_ID / YOUTUBE_API_KEY absents du .env)');
}

// SPA catch-all — must be last. Anything that didn't match an Express route
// (and isn't an API/webhook/OAuth path) gets the React build.
app.get(/.*/, (req, res, next) => {
    if (req.hostname === 'support.shardtwn.fr') return next();
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

// ── Ticket system API ─────────────────────────────────────────────────────────
const ticketRoutes = require('./lib/ticketRoutes');
app.use('/api/support', ticketRoutes);

// ── Support subdomain (support.shardtwn.fr) ───────────────────────────────────
const SUPPORT_DIST = path.join(__dirname, 'support-app', 'dist');
if (require('fs').existsSync(SUPPORT_DIST)) {
    const supportStatic = require('express').static(SUPPORT_DIST, { index: false, fallthrough: true });
    app.use((req, res, next) => {
        if (req.hostname !== 'support.shardtwn.fr') return next();
        if (req.path.startsWith('/api/') || req.path.startsWith('/transcripts/')) return next();
        supportStatic(req, res, () => res.sendFile(path.join(SUPPORT_DIST, 'index.html')));
    });
}


console.log('Tentative de démarrage du serveur...');
app.listen(PORT, () => console.log(`Tableau de bord démarré sur http://localhost:${PORT}`));