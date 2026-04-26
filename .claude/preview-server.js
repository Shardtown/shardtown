const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SPA_DIST = path.join(ROOT, 'status-app', 'dist');
const IMAGE_DIR = path.join(ROOT, 'image');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.ico':  'image/x-icon',
};

function sendFile(res, filepath) {
    fs.readFile(filepath, (err, buf) => {
        if (err) { res.statusCode = 404; res.end('Not found'); return; }
        const ext = path.extname(filepath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        if (ext !== '.html' && ext !== '.json') res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(buf);
    });
}

function safeJoin(base, rel) {
    const target = path.normalize(path.join(base, rel));
    if (!target.startsWith(base)) return null;
    return target;
}

function buildShards(label, count, opts = {}) {
    const shards = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const offline = (opts.offlineIds || []).includes(i);
        shards.push({
            shard_id: i, bot_label: label,
            ping: offline ? 0 : Math.floor(40 + Math.random() * (opts.highPing ? 280 : 120)),
            status: offline ? 'Offline' : 'Online',
            guild_count: Math.floor(80 + Math.random() * 200),
            last_update: new Date(now - Math.random() * 60_000).toISOString(),
        });
    }
    return shards;
}

function buildHistory() {
    const out = [];
    const now = Date.now();
    for (let h = 24 * 7; h >= 0; h--) {
        const ts = new Date(now - h * 3_600_000).toISOString();
        out.push({ bot_label: 'ShardGuard', timestamp: ts, guild_count: 1200 + Math.floor(Math.random() * 80 + h * 0.4), member_count: 95000 + Math.floor(Math.random() * 5000 + h * 12) });
        out.push({ bot_label: 'Shard',      timestamp: ts, guild_count:  380 + Math.floor(Math.random() * 30 + h * 0.2), member_count: 22000 + Math.floor(Math.random() *  800 + h * 5) });
    }
    return out;
}

function statsResponse(incident) {
    const shardGuardShards = buildShards('ShardGuard', 8, { offlineIds: incident ? [3] : [], highPing: incident });
    const shardShards = buildShards('Shard', 4);
    return {
        current: [
            { label: 'ShardGuard', online: true, guilds: shardGuardShards.reduce((s, x) => s + x.guild_count, 0), members: 142000, shards: shardGuardShards },
            { label: 'Shard',      online: true, guilds: shardShards.reduce((s, x) => s + x.guild_count, 0),      members:  38000, shards: shardShards },
        ],
        history: buildHistory(),
    };
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/stats') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(statsResponse(url.searchParams.get('incident') === '1')));
        return;
    }
    const cookie = req.headers.cookie || '';
    const mockUser = url.searchParams.get('user') === '1' || cookie.includes('preview-user=1');
    if (url.searchParams.get('user') === '1') {
        res.setHeader('Set-Cookie', 'preview-user=1; Path=/; Max-Age=3600');
    }
    if (url.searchParams.get('user') === '0') {
        res.setHeader('Set-Cookie', 'preview-user=0; Path=/; Max-Age=0');
    }

    if (pathname === '/api/me') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            user: mockUser ? {
                id: '294819284928193845', username: 'demo_user', global_name: 'Demo User',
                avatar: null, discriminator: '0001'
            } : null
        }));
        return;
    }
    if (pathname === '/api/premium') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!mockUser) { res.statusCode = 401; res.end(JSON.stringify({ adminGuilds: [] })); return; }
        res.end(JSON.stringify({
            adminGuilds: [
                { id: '1111111111', name: 'Communauté Demo' },
                { id: '2222222222', name: 'Mon Serveur Test' },
                { id: '3333333333', name: 'Studio Créatif' },
            ]
        }));
        return;
    }
    if (pathname === '/api/shard/server' || pathname === '/api/shardguard/server') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!mockUser) { res.statusCode = 401; res.end(JSON.stringify({ guilds: [], botGuildIds: [], clientId: '' })); return; }
        res.end(JSON.stringify({
            user: { id: '294819284928193845', username: 'demo_user', avatar: null },
            guilds: [
                { id: '1111111111', name: 'Communauté Demo', icon: null },
                { id: '2222222222', name: 'Mon Serveur Test', icon: null },
                { id: '3333333333', name: 'Studio Créatif', icon: null },
                { id: '4444444444', name: 'Friends Lounge', icon: null },
            ],
            botGuildIds: ['1111111111', '2222222222'],
            clientId: '999999999999999',
        }));
        return;
    }
    const sgGuildMatch = pathname.match(/^\/api\/shardguard\/guild\/([^/]+)$/);
    if (sgGuildMatch) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!mockUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Non connecté' })); return; }
        const guildId = sgGuildMatch[1];
        res.end(JSON.stringify({
            guild: { id: guildId, name: 'Communauté Demo', icon: null },
            roles: [
                { id: 'r0', name: '@everyone', color: 0 },
                { id: 'r1', name: 'Admin', color: 0xed4245 },
                { id: 'r2', name: 'Modérateur', color: 0x3498db },
                { id: 'r3', name: 'Vérifié', color: 0x57f287 },
                { id: 'r4', name: 'Membre', color: 0x99aab5 },
                { id: 'r5', name: 'Quarantaine', color: 0xf57f17 },
            ],
            channels: [
                { id: 'c1', name: 'général' },
                { id: 'c2', name: 'vérification' },
                { id: 'c3', name: 'logs-modération' },
                { id: 'c4', name: 'salon-staff' },
            ],
            settings: {
                language: 'fr', verifiedRole: 'r3', rules_fr: '["Soyez respectueux","Pas de spam","Pas de NSFW"]',
                rules_en: '["Be respectful","No spam","No NSFW"]',
                serverLocked: 'false', accessCode: '', verificationChannelId: 'c2', accessCodeChannelId: '',
                captchaDigits: 6, captchaNoise: 'medium', captchaAttempts: 3, verificationTimeout: 15,
                autoKickUnverified: 'false', modRoles: '["r1","r2"]',
                bannedWords: '["spam","insulte"]', bannedWordsEnabled: 'true', bannedWordsAction: 'delete',
                automodAntiSpam: 'true', automodSpamThreshold: 5, automodSpamInterval: 5, automodSpamAction: 'warn',
                automodAntiLinks: 'false', automodLinksAction: 'delete',
                automodAntiRaid: 'true', automodRaidThreshold: 10, automodRaidAction: 'lockdown',
                warnMessage: '', muteMessage: '', kickMessage: '', banMessage: '',
                notifAutoDelete: 'true', notifDeleteDelay: 5,
                automodAntiCaps: 'false', automodCapsThreshold: 70, automodCapsAction: 'delete',
                automodSlowmodeEnabled: 'false', automodSlowmodeDuration: 10, automodSlowmodeExpiry: 5,
                warnThresholdMute: 3, warnThresholdKick: 5, warnThresholdBan: 7, warnMuteDuration: 60,
                isPremium: '0',
                antiRaidEnabled: '1', antiRaidThreshold: 10, antiRaidWindow: 10,
                quarantineEnabled: '1', quarantineRoleId: 'r5', quarantineDuration: 10,
                modAlertUserId: '', webhookAlertEnabled: '0', webhookAlertChannelId: '',
            },
            stats: { totalMembers: 1284, verifiedCount: 1102 },
            chartData: {},
        }));
        return;
    }
    if (pathname.match(/^\/shardguard\/guild\/([^/]+)\/config$/) && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: true, mock: true }));
        return;
    }

    const sgLogsMatch = pathname.match(/^\/shardguard\/api\/guild\/([^/]+)\/logs$/);
    if (sgLogsMatch) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const event = url.searchParams.get('event') || '';
        const status = url.searchParams.get('status') || '';
        const search = (url.searchParams.get('search') || '').toLowerCase();
        const all = [
            { id: 1, userId: '111', username: 'alice42',  status: 'Success',  event: 'Verification', timestamp: new Date(Date.now() - 60_000).toISOString() },
            { id: 2, userId: '222', username: 'bob_007',  status: 'Join',     event: 'Join',         timestamp: new Date(Date.now() - 5 * 60_000).toISOString() },
            { id: 3, userId: '333', username: 'charlie',  status: 'Failed',   event: 'Verification', timestamp: new Date(Date.now() - 12 * 60_000).toISOString() },
            { id: 4, userId: '444', username: 'diana',    status: 'Pending',  event: 'Verification', timestamp: new Date(Date.now() - 25 * 60_000).toISOString() },
            { id: 5, userId: '555', username: 'eric',     status: 'Leave',    event: 'Leave',        timestamp: new Date(Date.now() - 40 * 60_000).toISOString() },
            { id: 6, userId: '666', username: 'frank',    status: 'Success',  event: 'Verification', timestamp: new Date(Date.now() - 60 * 60_000).toISOString() },
            { id: 7, userId: '777', username: 'grace',    status: 'Sanction', event: 'Sanction',     timestamp: new Date(Date.now() - 90 * 60_000).toISOString() },
        ];
        const filtered = all.filter(l =>
            (!event || l.event.includes(event)) &&
            (!status || l.status.includes(status)) &&
            (!search || l.username.toLowerCase().includes(search) || l.userId.includes(search))
        );
        res.end(JSON.stringify(filtered));
        return;
    }
    const sgMembersMatch = pathname.match(/^\/shardguard\/api\/guild\/([^/]+)\/members$/);
    if (sgMembersMatch) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify([
            { id: '111', username: 'alice42', displayName: 'Alice', avatar: null, joinedAt: new Date(Date.now() - 30 * 86400_000).toISOString(), warnCount: 0, isMuted: false },
            { id: '222', username: 'bob_007', displayName: 'Bob', avatar: null, joinedAt: new Date(Date.now() - 12 * 86400_000).toISOString(), warnCount: 2, isMuted: false },
            { id: '333', username: 'charlie', displayName: 'Charlie', avatar: null, joinedAt: new Date(Date.now() - 5 * 86400_000).toISOString(), warnCount: 0, isMuted: false },
            { id: '444', username: 'diana_x', displayName: 'Diana', avatar: null, joinedAt: new Date(Date.now() - 2 * 86400_000).toISOString(), warnCount: 1, isMuted: true },
            { id: '555', username: 'eric99',  displayName: 'Eric',  avatar: null, joinedAt: new Date(Date.now() - 1 * 86400_000).toISOString(), warnCount: 0, isMuted: false },
        ]));
        return;
    }
    if (pathname.match(/^\/shardguard\/api\/guild\/([^/]+)\/(panic|deploy|bulk)/) && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: true, mock: true }));
        return;
    }
    if (pathname.match(/^\/shardguard\/api\/guild\/([^/]+)\/member\/([^/]+)\/action$/) && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: true, mock: true }));
        return;
    }

    const sGuildMatch = pathname.match(/^\/api\/shard\/guild\/([^/]+)$/);
    if (sGuildMatch) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!mockUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Non connecté' })); return; }
        res.end(JSON.stringify({
            guild: { id: sGuildMatch[1], name: 'Communauté Demo', icon: null },
            channels: [
                { id: 'c1', name: 'général' }, { id: 'c2', name: 'bienvenue' },
                { id: 'c3', name: 'départs' }, { id: 'c4', name: 'level-up' },
                { id: 'c5', name: 'tickets-log' }, { id: 'c6', name: 'panel-tickets' },
                { id: 'c7', name: 'anniversaires' }, { id: 'c8', name: 'annonces' },
            ],
            voiceChannels: [
                { id: 'v1', name: 'Salon vocal' }, { id: 'v2', name: '➕ Créer un vocal' },
            ],
            categories: [
                { id: 'cat1', name: 'Tickets' }, { id: 'cat2', name: 'Vocaux temporaires' },
            ],
            roles: [
                { id: 'r1', name: 'Admin', color: 0xed4245 },
                { id: 'r2', name: 'Modérateur', color: 0x3498db },
                { id: 'r3', name: 'Membre vérifié', color: 0x57f287 },
                { id: 'r4', name: 'Booster', color: 0xf47fff },
                { id: 'r5', name: 'VIP', color: 0xffd700 },
            ],
            guildEmojis: [],
            settings: {
                welcomeChannelId: 'c2', welcomeTitle: 'Bienvenue !', welcomeMessage: 'Bienvenue {user} sur **{server}** ! Nous sommes {memberCount} membres.', welcomeFooter: 'Lis bien les règles', welcomeColor: '#3b82f6',
                leaveChannelId: 'c3', leaveTitle: 'Au revoir', leaveMessage: '{username} a quitté **{server}**.', leaveFooter: '', leaveColor: '#6b7280',
                autoRoleId: 'r3',
                tempVoiceTrigger: 'v2', tempVoiceCategory: 'cat2', tempVoiceName: 'Salon de {username}',
                levelsEnabled: 1, xpMin: 15, xpMax: 25, xpCooldown: 60, levelUpChannelId: 'c4',
                levelUpMessage: '🎉 GG {user}, tu passes au niveau {level} !', levelUpColor: '#3b82f6',
                levelThresholds: '[100,250,500,1000,2000,3500,5500,8000,11500,15000]',
                levelRewards: '[{"level":5,"roleId":"r4"},{"level":10,"roleId":"r5"}]',
                xpRoleMultipliers: '[{"roleId":"r5","multiplier":2}]',
                ticketEnabled: 1, ticketCategoryId: 'cat1', ticketSupportRoleId: 'r2', ticketLogChannelId: 'c5', ticketMaxPerUser: 1,
                ticketPanelChannelId: 'c6', ticketPanelTitle: '🎫 Support', ticketPanelDescription: 'Cliquez pour ouvrir un ticket.', ticketPanelColor: '#3b82f6',
                birthdayChannelId: 'c7', birthdayMessage: '🎂 Joyeux anniversaire {user} !', birthdayRoleId: 'r5',
                economyEnabled: 1, economyCurrencyName: 'shards', economyDailyMin: 50, economyDailyMax: 200,
                isPremium: 0, referralEnabled: 1, referralReward: 100,
                autoReactions: [{ text: 'gg', emoji: '🎉' }, { text: 'goodnight', emoji: '🌙' }],
            },
            giveaways: [
                { id: 1, channelId: 'c1', prize: 'Steam Key — Hollow Knight', winnersCount: 2, endsAt: new Date(Date.now() + 2 * 86400_000).toISOString(), ended: 0 },
            ],
            scheduledAnnouncements: [
                { id: 1, channelId: 'c8', message: 'Petit rappel : la session du week-end commence vendredi 20h !', intervalHours: 168, nextRun: new Date(Date.now() + 3 * 86400_000).toISOString() },
            ],
            shopItems: [
                { id: 1, roleId: 'r4', price: 5000, name: 'Booster' },
                { id: 2, roleId: 'r5', price: 15000, name: 'VIP' },
            ],
            polls: [
                { id: 1, channelId: 'c1', question: 'Pizza ou kebab ?', choices: '["Pizza","Kebab","Les deux"]', endsAt: null, ended: 0 },
            ],
        }));
        return;
    }
    if (pathname.match(/^\/shard\/guild\/([^/]+)\/(config|test|send-embed|reactions|rewards|poll|giveaway|scheduled|shop|ticket-panel|backup|restore)/) && (req.method === 'POST' || req.method === 'DELETE')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: true, mock: true, id: Math.floor(Math.random() * 100000), pollId: Math.floor(Math.random() * 100000) }));
        return;
    }
    if (pathname === '/api/admin/csrf') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ csrfToken: 'mock-csrf-token-' + Math.random().toString(36).slice(2, 10) }));
        return;
    }
    if (pathname === '/api/admin') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const isAdmin = url.searchParams.get('admin') === '1' || cookie.includes('preview-admin=1');
        if (url.searchParams.get('admin') === '1') res.setHeader('Set-Cookie', 'preview-admin=1; Path=/; Max-Age=3600');
        if (!isAdmin) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Non admin' })); return; }
        res.end(JSON.stringify({
            bots: [
                {
                    id: '1494091615650840666', username: 'ShardGuard', discriminator: '0', avatar: null,
                    guilds: [
                        { id: '1111111111', name: 'Communauté Demo', icon: null },
                        { id: '2222222222', name: 'Studio Créatif', icon: null },
                        { id: '5555555555', name: 'Toxic Server (test)', icon: null },
                    ],
                },
                {
                    id: '1503948576102842', username: 'Shard', discriminator: '0', avatar: null,
                    guilds: [
                        { id: '1111111111', name: 'Communauté Demo', icon: null },
                        { id: '2222222222', name: 'Studio Créatif', icon: null },
                    ],
                },
            ],
            blockedGuilds: [
                { guild_id: '9999999999', guild_name: 'Bad Server' },
            ],
            totalGuilds: 5,
            totalMembers: 14872,
            csrfToken: 'mock-csrf-' + Math.random().toString(36).slice(2, 10),
        }));
        return;
    }
    if (pathname === '/api/create-checkout' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: 'Mode preview — Stripe désactivé en local.' }));
        return;
    }
    if (pathname.startsWith('/assets/')) {
        const target = safeJoin(SPA_DIST, pathname);
        if (target) return sendFile(res, target);
    }
    if (pathname.startsWith('/image/')) {
        const target = safeJoin(IMAGE_DIR, pathname.replace('/image', ''));
        if (target) return sendFile(res, target);
    }
    // SPA catch-all
    return sendFile(res, path.join(SPA_DIST, 'index.html'));
});

const PORT = process.env.PORT || 4173;
server.listen(PORT, () => console.log(`Preview on http://localhost:${PORT}/status`));
