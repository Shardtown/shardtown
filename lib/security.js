const crypto = require('crypto');

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

module.exports = { cryptoShuffle, timingSafeEqual, verifyAdminPassword };
