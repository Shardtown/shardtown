/**
 * Shardtown bot — dedicated support-tickets relay.
 *
 * Listens to messages posted by staff in any channel under
 * SUPPORT_CATEGORY_ID and writes them into the `support_messages` table
 * so the web dashboard's chat panel surfaces them on its next poll.
 *
 * Also flips the matching `support_tickets` row to `status = 'closed'`
 * when staff deletes the channel.
 *
 * Required env:
 *   SHARDTOWN_TOKEN        — bot token (the bot must be in the support guild)
 *   SUPPORT_CATEGORY_ID    — Discord category that hosts ticket channels
 *   DB_HOST, DB_USER, DB_PASS, DB_NAME — same MySQL the dashboard uses
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const mysql = require('mysql2/promise');

const SUPPORT_CATEGORY_ID = process.env.SUPPORT_CATEGORY_ID || '';
const TOKEN = process.env.SHARDTOWN_TOKEN || '';

if (!TOKEN) {
    console.error('❌ SHARDTOWN_TOKEN absent.');
    process.exit(1);
}
if (!SUPPORT_CATEGORY_ID) {
    console.error('❌ SUPPORT_CATEGORY_ID absent — rien à écouter.');
    process.exit(1);
}

let db;
async function initDb() {
    db = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
    });
    console.log('✅ Shardtown connecté à MySQL');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, c => {
    console.log(`✅ Shardtown logué comme ${c.user.tag} (catégorie support: ${SUPPORT_CATEGORY_ID})`);
});

client.on(Events.MessageCreate, async message => {
    if (!message.guild) return;
    if (message.channel.parentId !== SUPPORT_CATEGORY_ID) return;
    // Skip bots — both this bot's own embeds (relayed user messages from
    // the dashboard) and any other bot in the guild.
    if (message.author.bot) return;
    if (!message.content || !message.content.trim()) return;

    try {
        const [tickets] = await db.execute(
            `SELECT id, status FROM support_tickets WHERE channel_id = ? LIMIT 1`,
            [message.channel.id],
        );
        const ticket = tickets[0];
        if (!ticket || ticket.status !== 'open') return;

        const avatar = message.author.displayAvatarURL({ size: 128, extension: 'png' });
        const displayName = message.member?.displayName || message.author.globalName || message.author.username;

        await db.execute(
            `INSERT INTO support_messages
             (ticket_id, side, author_id, author_name, author_avatar, content, discord_message_id)
             VALUES (?, 'staff', ?, ?, ?, ?, ?)`,
            [ticket.id, message.author.id, displayName, avatar, message.content.slice(0, 4000), message.id],
        );
    } catch (e) {
        console.error('[support relay]', e.message);
    }
});

client.on(Events.ChannelDelete, async channel => {
    if (channel.parentId !== SUPPORT_CATEGORY_ID) return;
    try {
        await db.execute(
            `UPDATE support_tickets SET status = 'closed', closed_at = NOW()
             WHERE channel_id = ? AND status = 'open'`,
            [channel.id],
        );
    } catch (e) {
        console.error('[support close]', e.message);
    }
});

(async () => {
    await initDb();
    await client.login(TOKEN);
})().catch(e => {
    console.error('❌ Bot Shardtown crash:', e);
    process.exit(1);
});
