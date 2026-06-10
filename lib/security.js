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

module.exports = { cryptoShuffle, timingSafeEqual };
