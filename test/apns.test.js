const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const apns = require('../lib/apns');

// Generate an ephemeral P-256 keypair to mock a .p8 — Apple uses the same
// curve so we can exercise the JWT signing path without needing a real key.
function makeFakeP8() {
    const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    });
    return privateKey;
}

function withApnsEnv(values, fn) {
    const prev = {};
    for (const k of Object.keys(values)) {
        prev[k] = process.env[k];
        if (values[k] === undefined) delete process.env[k];
        else process.env[k] = values[k];
    }
    try { return fn(); } finally {
        for (const k of Object.keys(prev)) {
            if (prev[k] === undefined) delete process.env[k];
            else process.env[k] = prev[k];
        }
    }
}

test('isConfigured() returns false when env vars are missing', () => {
    withApnsEnv({
        APPLE_APNS_KEY: undefined,
        APPLE_APNS_KEY_ID: undefined,
        APPLE_APNS_TEAM_ID: undefined,
        APPLE_APNS_TOPIC: undefined,
    }, () => {
        assert.strictEqual(apns.isConfigured(), false);
    });
});

test('isConfigured() returns true when all env vars are present', () => {
    withApnsEnv({
        APPLE_APNS_KEY: makeFakeP8(),
        APPLE_APNS_KEY_ID: 'ABCDEFGHIJ',
        APPLE_APNS_TEAM_ID: '1234567890',
        APPLE_APNS_TOPIC: 'fr.shardtwn.dashboard',
    }, () => {
        assert.strictEqual(apns.isConfigured(), true);
    });
});

test('sendPush() returns APNS_NOT_CONFIGURED when env is missing', async () => {
    const result = await withApnsEnv({
        APPLE_APNS_KEY: undefined,
        APPLE_APNS_KEY_ID: undefined,
        APPLE_APNS_TEAM_ID: undefined,
        APPLE_APNS_TOPIC: undefined,
    }, () => apns.sendPush({ deviceToken: 'abc', title: 't', body: 'b' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'APNS_NOT_CONFIGURED');
});

test('sendPush() rejects empty / non-string device token', async () => {
    const result = await withApnsEnv({
        APPLE_APNS_KEY: makeFakeP8(),
        APPLE_APNS_KEY_ID: 'ABCDEFGHIJ',
        APPLE_APNS_TEAM_ID: '1234567890',
        APPLE_APNS_TOPIC: 'fr.shardtwn.dashboard',
    }, () => apns.sendPush({ deviceToken: '', title: 't', body: 'b' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'BAD_DEVICE_TOKEN');
});

test('isDeadToken() flags 410, BadDeviceToken and Unregistered', () => {
    assert.strictEqual(apns.isDeadToken({ status: 410 }), true);
    assert.strictEqual(apns.isDeadToken({ status: 400, reason: 'BadDeviceToken' }), true);
    assert.strictEqual(apns.isDeadToken({ status: 410, reason: 'Unregistered' }), true);
    assert.strictEqual(apns.isDeadToken({ status: 200 }), false);
    assert.strictEqual(apns.isDeadToken({ status: 429, reason: 'TooManyRequests' }), false);
    assert.strictEqual(apns.isDeadToken(null), false);
});
