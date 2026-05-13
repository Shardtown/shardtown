const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { cryptoShuffle, timingSafeEqual, verifyAdminPassword } = require('../lib/security');

test('cryptoShuffle returns a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = cryptoShuffle(input);
    assert.strictEqual(out.length, input.length);
    assert.deepStrictEqual([...out].sort((a, b) => a - b), input);
});

test('cryptoShuffle does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = input.slice();
    cryptoShuffle(input);
    assert.deepStrictEqual(input, snapshot);
});

test('timingSafeEqual: equal strings match', () => {
    assert.strictEqual(timingSafeEqual('hello', 'hello'), true);
});

test('timingSafeEqual: different strings do not match', () => {
    assert.strictEqual(timingSafeEqual('hello', 'world'), false);
});

test('timingSafeEqual: different lengths do not match', () => {
    assert.strictEqual(timingSafeEqual('abc', 'abcd'), false);
});

test('timingSafeEqual: handles empty strings', () => {
    assert.strictEqual(timingSafeEqual('', ''), true);
    assert.strictEqual(timingSafeEqual('', 'a'), false);
});

test('verifyAdminPassword: returns false when no env is set', () => {
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevPlain = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD;
    try {
        assert.strictEqual(verifyAdminPassword('whatever'), false);
    } finally {
        if (prevHash !== undefined) process.env.ADMIN_PASSWORD_HASH = prevHash;
        if (prevPlain !== undefined) process.env.ADMIN_PASSWORD = prevPlain;
    }
});

test('verifyAdminPassword: plaintext fallback path', () => {
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevPlain = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
    try {
        assert.strictEqual(verifyAdminPassword('correct-horse-battery-staple'), true);
        assert.strictEqual(verifyAdminPassword('nope'), false);
    } finally {
        if (prevHash !== undefined) process.env.ADMIN_PASSWORD_HASH = prevHash;
        else delete process.env.ADMIN_PASSWORD_HASH;
        if (prevPlain !== undefined) process.env.ADMIN_PASSWORD = prevPlain;
        else delete process.env.ADMIN_PASSWORD;
    }
});

test('verifyAdminPassword: scrypt hash path', () => {
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevPlain = process.env.ADMIN_PASSWORD;
    const password = 'tr0ub4dor&3';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    process.env.ADMIN_PASSWORD_HASH = `${salt}:${hash}`;
    delete process.env.ADMIN_PASSWORD;
    try {
        assert.strictEqual(verifyAdminPassword(password), true);
        assert.strictEqual(verifyAdminPassword('wrong'), false);
        assert.strictEqual(verifyAdminPassword(''), false);
    } finally {
        if (prevHash !== undefined) process.env.ADMIN_PASSWORD_HASH = prevHash;
        else delete process.env.ADMIN_PASSWORD_HASH;
        if (prevPlain !== undefined) process.env.ADMIN_PASSWORD = prevPlain;
    }
});

test('verifyAdminPassword: malformed hash returns false', () => {
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevPlain = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD_HASH = 'notavalidhash';
    delete process.env.ADMIN_PASSWORD;
    try {
        assert.strictEqual(verifyAdminPassword('anything'), false);
    } finally {
        if (prevHash !== undefined) process.env.ADMIN_PASSWORD_HASH = prevHash;
        else delete process.env.ADMIN_PASSWORD_HASH;
        if (prevPlain !== undefined) process.env.ADMIN_PASSWORD = prevPlain;
    }
});

test('server.js parses without syntax errors', () => {
    const { execSync } = require('node:child_process');
    const path = require('node:path');
    const serverPath = path.join(__dirname, '..', 'server.js');
    assert.doesNotThrow(() => {
        execSync(`node --check "${serverPath}"`, { stdio: 'pipe' });
    });
});
