/**
 * In-memory live presence store. Maps a "scope" (typically a SPA path
 * like /shardguard/guild/123) to a Map of user-id → { user, field,
 * lastSeen }. Entries expire after PRESENCE_TTL_MS without a heartbeat.
 *
 * The dashboard SPA sends a heartbeat every ~8s while the user is on a
 * page, and polls peers every ~6s. The TTL of 20s gives us a safe
 * margin for one missed heartbeat without dropping the user.
 *
 * No persistence — restart wipes the table. That's fine: it's just
 * "who's currently here", not a durable resource.
 */

const PRESENCE_TTL_MS = 20_000;
const SWEEP_INTERVAL_MS = 60_000;

const store = new Map(); // scope → Map<userId, { user, field, lastSeen }>

function getScope(scope) {
    let m = store.get(scope);
    if (!m) { m = new Map(); store.set(scope, m); }
    return m;
}

function pruneScope(m) {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    for (const [k, v] of m) {
        if (v.lastSeen < cutoff) m.delete(k);
    }
}

function heartbeat(scope, user, extras) {
    const m = getScope(scope);
    const ex = extras || {};
    m.set(user.id, {
        user: {
            id: user.id,
            username: user.username || '',
            global_name: user.global_name || user.username || '',
            avatar: user.avatar || null,
        },
        field: ex.field || null,
        path: ex.path || null,
        cursor: ex.cursor || null,
        lastSeen: Date.now(),
    });
}

function leave(scope, userId) {
    const m = store.get(scope);
    if (m) m.delete(userId);
}

function peers(scope, excludeUserId) {
    const m = store.get(scope);
    if (!m) return [];
    pruneScope(m);
    const out = [];
    for (const [id, v] of m) {
        if (id === excludeUserId) continue;
        out.push({
            ...v.user,
            field: v.field,
            path: v.path,
            cursor: v.cursor,
        });
    }
    return out;
}

// Periodic full sweep so dead scopes don't accumulate memory when nobody
// queries them anymore (e.g. an admin closed all tabs).
setInterval(() => {
    for (const [scope, m] of store) {
        pruneScope(m);
        if (m.size === 0) store.delete(scope);
    }
}, SWEEP_INTERVAL_MS).unref?.();

module.exports = { heartbeat, leave, peers };
