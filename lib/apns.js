/**
 * Apple Push Notification service (APNs) client over HTTP/2.
 *
 * Sends remote pushes to macOS / iOS device tokens using token-based auth
 * (a .p8 ECDSA private key from developer.apple.com), no certs required.
 *
 * Env vars (all required; module no-ops cleanly when any is missing):
 *   APPLE_APNS_KEY      The full .p8 contents (PEM, with -----BEGIN/END----- lines).
 *   APPLE_APNS_KEY_ID   10-char alphanumeric key id (filename suffix of the .p8).
 *   APPLE_APNS_TEAM_ID  10-char alphanumeric Apple Developer Team ID.
 *   APPLE_APNS_TOPIC    Push topic — for macOS/iOS apps it's the bundle id,
 *                       e.g. fr.shardtwn.dashboard.
 *   APPLE_APNS_ENV      "production" (default) or "development" (sandbox).
 *
 * JWT auth (ES256): Apple accepts the same token for up to 1 hour. We
 * cache it for 50 minutes to stay comfortably under that horizon.
 *
 * Network: Apple's APNs endpoint is HTTP/2 only. We keep one long-lived
 * h2 session per env and lazily reconnect on disconnect.
 */

const crypto = require('node:crypto');
const http2 = require('node:http2');

const JWT_TTL_MS = 50 * 60 * 1000;

let cachedJwt = null;
let cachedJwtExpiresAt = 0;

let h2Session = null;
let h2SessionEnv = null;

function envConfig() {
    const key = process.env.APPLE_APNS_KEY;
    const keyId = process.env.APPLE_APNS_KEY_ID;
    const teamId = process.env.APPLE_APNS_TEAM_ID;
    const topic = process.env.APPLE_APNS_TOPIC;
    const env = process.env.APPLE_APNS_ENV === 'development' ? 'development' : 'production';
    if (!key || !keyId || !teamId || !topic) return null;
    return { key, keyId, teamId, topic, env };
}

function isConfigured() {
    return envConfig() !== null;
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function signJwt(cfg) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' };
    const claims = { iss: cfg.teamId, iat: now };
    const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
    const signer = crypto.createSign('SHA256');
    signer.update(signingInput);
    signer.end();
    // Apple requires JOSE-style (R||S) ECDSA signatures; Node's default
    // is DER. `dsaEncoding: 'ieee-p1363'` flips it to the right format.
    const signature = signer.sign({ key: cfg.key, dsaEncoding: 'ieee-p1363' });
    return signingInput + '.' + b64url(signature);
}

function getJwt(cfg) {
    const now = Date.now();
    if (cachedJwt && now < cachedJwtExpiresAt) return cachedJwt;
    cachedJwt = signJwt(cfg);
    cachedJwtExpiresAt = now + JWT_TTL_MS;
    return cachedJwt;
}

function apnsHost(env) {
    return env === 'development'
        ? 'https://api.sandbox.push.apple.com'
        : 'https://api.push.apple.com';
}

function getSession(cfg) {
    if (h2Session && !h2Session.destroyed && !h2Session.closed && h2SessionEnv === cfg.env) {
        return h2Session;
    }
    if (h2Session && !h2Session.destroyed) {
        h2Session.close();
    }
    h2Session = http2.connect(apnsHost(cfg.env));
    h2SessionEnv = cfg.env;
    // Reset on error so the next call reconnects.
    const reset = () => { if (h2Session) { h2Session = null; } };
    h2Session.once('error', reset);
    h2Session.once('close', reset);
    return h2Session;
}

/**
 * Send a push to a single device token.
 *
 * @param {object} args
 * @param {string} args.deviceToken Hex-encoded device token (64 chars on macOS).
 * @param {string} args.title       Notification title.
 * @param {string} args.body        Notification body.
 * @param {string} [args.category]  APNs category for action buttons (optional).
 * @param {object} [args.extra]     Extra top-level keys (deep-link url, etc.).
 * @returns {Promise<{ok: boolean, status: number, reason?: string}>}
 */
async function sendPush({ deviceToken, title, body, category, extra }) {
    const cfg = envConfig();
    if (!cfg) return { ok: false, status: 0, reason: 'APNS_NOT_CONFIGURED' };
    if (!deviceToken || typeof deviceToken !== 'string') {
        return { ok: false, status: 0, reason: 'BAD_DEVICE_TOKEN' };
    }

    const payload = {
        aps: {
            alert: { title, body },
            sound: 'default',
            ...(category ? { category } : {}),
        },
        ...(extra || {}),
    };
    const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');

    const session = getSession(cfg);
    const jwt = getJwt(cfg);

    return new Promise(resolve => {
        const req = session.request({
            ':method': 'POST',
            ':path': `/3/device/${deviceToken}`,
            'authorization': `bearer ${jwt}`,
            'apns-topic': cfg.topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'content-type': 'application/json',
            'content-length': payloadBuf.length,
        });

        let status = 0;
        let respBody = '';
        req.on('response', headers => { status = headers[':status'] || 0; });
        req.on('data', chunk => { respBody += chunk; });
        req.on('end', () => {
            if (status === 200) return resolve({ ok: true, status });
            let reason = 'UNKNOWN';
            try { reason = JSON.parse(respBody).reason || 'UNKNOWN'; } catch { /* */ }
            resolve({ ok: false, status, reason });
        });
        req.on('error', err => resolve({ ok: false, status: 0, reason: err.code || String(err.message) }));
        req.setTimeout(8000, () => { req.close(http2.constants.NGHTTP2_CANCEL); });
        req.end(payloadBuf);
    });
}

/**
 * Send the same notification to a batch of device tokens. Returns an array
 * of per-token results in the same order so the caller can mark dead
 * tokens (BadDeviceToken / Unregistered → 410) for cleanup.
 */
async function sendPushBatch(tokens, args) {
    const results = await Promise.all(
        tokens.map(t => sendPush({ ...args, deviceToken: t })),
    );
    return results.map((r, i) => ({ ...r, deviceToken: tokens[i] }));
}

/** Reasons that indicate the device token is permanently dead and should be
 *  deleted from our store on next pass (HTTP 410 territory). */
const DEAD_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered']);

function isDeadToken(result) {
    if (!result) return false;
    if (result.status === 410) return true;
    return Boolean(result.reason) && DEAD_TOKEN_REASONS.has(result.reason);
}

module.exports = { isConfigured, sendPush, sendPushBatch, isDeadToken };
