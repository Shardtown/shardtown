require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ShardingManager } = require('discord.js');
const path = require('path');

const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto'
});

manager.on('shardCreate', shard => {
    console.log(`[ShardGuard Manager] Shard lancé : ${shard.id}`);
});

manager.spawn().catch(err => {
    console.error('[ShardGuard Manager] Erreur spawn:', err);
});
