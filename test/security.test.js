const test = require('node:test');
const assert = require('node:assert');
const { cryptoShuffle, timingSafeEqual } = require('../lib/security');

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

test('server.js parses without syntax errors', () => {
    const { execSync } = require('node:child_process');
    const path = require('node:path');
    const serverPath = path.join(__dirname, '..', 'server.js');
    assert.doesNotThrow(() => {
        execSync(`node --check "${serverPath}"`, { stdio: 'pipe' });
    });
});
