/**
 * Shardtown Support Bot — sharder.
 *
 * Mirrors the pattern used by Shard / ShardGuard:
 *   - dotenv pulls credentials from the repo-root .env
 *   - ShardingManager spawns bot.js workers, auto-shard count
 *   - One concern per process so PM2 can isolate restarts
 *
 * Launched by shardctl.sh option [4] / PM2 name "shardtown-bot".
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ShardingManager } = require('discord.js');
const path = require('path');

if (!process.env.SHARDTOWN_TOKEN) {
    console.error('[Shardtown] SHARDTOWN_TOKEN manquant dans .env — arrêt.');
    process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
    token: process.env.SHARDTOWN_TOKEN,
    totalShards: 'auto',
});

manager.on('shardCreate', shard => {
    console.log(`[Shardtown Manager] Shard lancé : ${shard.id}`);
});

manager.spawn().catch(err => {
    console.error('[Shardtown Manager] Erreur spawn:', err);
});
