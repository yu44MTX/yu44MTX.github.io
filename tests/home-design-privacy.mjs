// Run from any directory: node --test tests/home-design-privacy.mjs (Node 20+).
// All cryptographic fixtures are synthetic; never read a production password.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const publicRoot = fileURLToPath(new URL('../content/home-design/', import.meta.url));
const gateURL = new URL('../content/home-design/private/gate.mjs', import.meta.url);
const encryptedPath = 'private/budget.enc.json';
const fixturePassword = 'fixture-password-not-production';
const encoder = new TextEncoder();
const payload = {
  schema: 1,
  sections: { budget: 'fixture', sources: 'fixture' },
  data: { meta: {}, items: [], sources: [] },
  files: [],
};
const publicExtensions = new Set(['.html', '.json', '.css', '.js', '.mjs', '.md', '.svg', '.csv']);
const oldBudgetFiles = [
  'budget.json',
  '武汉预算清单.csv',
  '设计调整与询价说明.md',
  '父母主卧与衣帽间_20261030/预算调整.json',
  '次卧功能优化_20261030/预算调整.json',
  '次卧功能优化_20261030/次卧预算调整.csv',
];

async function walk(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Public symlink needs explicit privacy review: ${relative}`);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function readPublic(relative) {
  return readFile(path.join(publicRoot, relative), 'utf8');
}

function decodeBase64(value, label) {
  assert.equal(typeof value, 'string', `${label} must be base64 text`);
  assert.match(value, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, `${label} must be canonical base64`);
  const bytes = Buffer.from(value, 'base64');
  assert.equal(bytes.toString('base64'), value, `${label} must round-trip`);
  return bytes;
}

function checkEnvelope(envelope) {
  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf, 'PBKDF2-SHA256');
  assert.equal(envelope.iterations, 600000);
  assert.equal(decodeBase64(envelope.salt, 'salt').length, 16);
  assert.equal(decodeBase64(envelope.iv, 'iv').length, 12);
  assert.ok(decodeBase64(envelope.ciphertext, 'ciphertext').length > 16, 'Ciphertext must include content and the GCM tag');
  assert.deepEqual(Object.keys(envelope).sort(), ['version', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext'].sort(), 'Envelope must not carry plaintext or password metadata');
}

let fixturePromise;
function fixture() {
  return fixturePromise ??= (async () => {
    assert.ok(globalThis.crypto?.subtle, 'Run with Node 20+ global Web Crypto');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey('raw', encoder.encode(fixturePassword), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('home-design-private-v1'), tagLength: 128 },
      key, encoder.encode(JSON.stringify(payload)),
    );
    return {
      version: 1, kdf: 'PBKDF2-SHA256', iterations: 600000,
      salt: Buffer.from(salt).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
  })();
}

async function decrypt(envelope, password = fixturePassword) {
  const module = await import(gateURL.href);
  assert.equal(typeof module.decryptEnvelope, 'function', 'gate.mjs must export decryptEnvelope');
  return module.decryptEnvelope(envelope, password);
}

test('synthetic PBKDF2/AES-GCM fixture decrypts to the exact JSON payload', async () => {
  const envelope = await fixture();
  checkEnvelope(envelope);
  assert.deepEqual(await decrypt(structuredClone(envelope)), payload);
});

test('wrong password rejects instead of returning private content', async () => {
  const envelope = structuredClone(await fixture());
  await assert.rejects(() => decrypt(envelope, 'wrong-fixture-password'));
});

// Each negative test receives an independent copy, preserving the valid fixture.
test('a modified ciphertext or authentication tag rejects', async (t) => {
  for (const position of [0, -1]) {
    await t.test(position === 0 ? 'content byte' : 'tag byte', async () => {
      const envelope = structuredClone(await fixture());
      const bytes = Buffer.from(envelope.ciphertext, 'base64');
      bytes[position < 0 ? bytes.length - 1 : position] ^= 1;
      envelope.ciphertext = bytes.toString('base64');
      await assert.rejects(() => decrypt(envelope));
    });
  }
});

test('malformed or unsupported envelopes reject', async (t) => {
  const valid = await fixture();
  const invalid = [
    ['null', null], ['array', []], ['empty object', {}],
    ['unsupported version', { ...valid, version: 2 }],
    ['unsupported KDF', { ...valid, kdf: 'PBKDF2-SHA1' }],
    ['zero iterations', { ...valid, iterations: 0 }],
    ['fractional iterations', { ...valid, iterations: 1.5 }],
    ['non-numeric iterations', { ...valid, iterations: '600000' }],
    ['invalid salt encoding', { ...valid, salt: '%%%not-base64%%%' }],
    ['short salt', { ...valid, salt: Buffer.alloc(8).toString('base64') }],
    ['short IV', { ...valid, iv: Buffer.alloc(8).toString('base64') }],
    ['missing ciphertext', { ...valid, ciphertext: undefined }],
    ['truncated ciphertext', { ...valid, ciphertext: 'AA==' }],
  ];
  for (const [label, envelope] of invalid) {
    await t.test(label, async () => { await assert.rejects(() => decrypt(envelope)); });
  }
});

function checkNoBudgetLiterals(text, relative) {
  // Number boundaries avoid matching an amount inside a longer ID. Ciphertext
  // is handled separately, since random base64 can accidentally contain digits.
  assert.doesNotMatch(text, /(?<![\p{L}\p{N}_])(?:195450|195,450|142450|142,450|6999|19800)(?![\p{L}\p{N}_])/u, `${relative}: known budget/price canary`);
  // Renderer property names are legitimate; actual numeric data is private.
  assert.doesNotMatch(text, /["'](?:target_total|unit_low|unit_high|estimate_low_total|estimate_high_total)["']\s*:\s*-?\d/i, `${relative}: literal budget data`);
}

test('published text assets contain no known budget amounts or literal budget rows', async () => {
  const files = (await walk(publicRoot)).filter(file => publicExtensions.has(path.extname(file).toLowerCase()));
  assert.ok(files.includes('index.html'), 'The public root page must exist');
  for (const relative of files) {
    const text = await readPublic(relative);
    if (relative === encryptedPath) {
      const envelope = JSON.parse(text);
      checkEnvelope(envelope);
      // Only random cryptographic byte fields are exempt, never extra fields.
      const { salt, iv, ciphertext, ...metadata } = envelope;
      checkNoBudgetLiterals(JSON.stringify(metadata), relative);
    } else checkNoBudgetLiterals(text, relative);
  }
});

test('the sole encrypted JSON asset has the expected envelope and location', async () => {
  const files = await walk(publicRoot);
  assert.deepEqual(files.filter(file => /\.enc\.json$/i.test(file)), [encryptedPath]);
  checkEnvelope(JSON.parse(await readPublic(encryptedPath)));
});

test('old plaintext downloads are absent or explicit empty redaction stubs', async (t) => {
  for (const relative of oldBudgetFiles) {
    await t.test(relative, async () => {
      let text;
      try { text = await readPublic(relative); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      checkNoBudgetLiterals(text, relative);
      // Fail closed for surviving legacy files: only a small, explicit notice
      // with no numeric content or budget rows counts as a redacted stub.
      assert.ok(text.length <= 2048, `${relative}: surviving file is not a small stub`);
      assert.match(text, /redact|removed|private|encrypt|已移除|已隐藏|已加密|需解锁|解锁后/i, `${relative}: expected an explicit redaction notice`);
      assert.doesNotMatch(text, /\d|["'](?:items|sources|target_total|unit_low|budget)["']\s*:/i, `${relative}: redaction stub still contains data`);
    });
  }
});

// Bare "total" can describe geometry (for example closet.depth_target.total).
// In metadata it denotes an amount; explicit monetary keys are forbidden everywhere.
const monetaryKey = /budget|target_total|unit_(?:low|high|price)|estimate_(?:low|high)_total|(?:^|_)(?:amount|price|cost|unallocated|reserve)(?:_|$)|预算|金额|单价|总价|差额/i;
function checkLayout(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkLayout(entry, `${location}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assert.ok(!monetaryKey.test(key), `${location}.${key}: public layout contains a monetary field`);
      if (/\.meta(?:data)?(?:\.|\[|$)/i.test(location)) {
        assert.doesNotMatch(key, /^(?:total|delta|balance)$/i, `${location}.${key}: monetary metadata`);
      }
      checkLayout(entry, `${location}.${key}`);
    }
  } else if (typeof value === 'string') {
    checkNoBudgetLiterals(value, location);
    assert.doesNotMatch(value, /[¥￥]\s*\d|\d[\d,.]*\s*(?:万元|元)/u, `${location}: public metadata contains an amount`);
  }
}

test('retained layout JSON contains no budget fields or monetary metadata at any depth', async () => {
  const files = (await walk(publicRoot)).filter(file => /(?:^|\/)layout\.json$/i.test(file));
  assert.ok(files.length >= 2, 'Both room layouts should remain available after sanitization');
  for (const relative of files) checkLayout(JSON.parse(await readPublic(relative)), relative);
});

test('root HTML no longer embeds the old plaintext budget script', async () => {
  const html = await readPublic('index.html');
  assert.doesNotMatch(html, /<script\b[^>]*\bid\s*=\s*(["'])budget-data\1/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bid\s*=\s*budget-data(?:\s|>)/i);
});

test('password controls fail closed before the handler loads', async () => {
  const html = await readPublic('index.html');
  const inputs = html.match(/<input\b[^>]*type="password"[^>]*>/g) ?? [];
  assert.equal(inputs.length, 2);
  for (const input of inputs) {
    assert.match(input, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(input, /\sname\s*=/i);
  }
  const submits = html.match(/<button\b[^>]*type="submit"[^>]*>/g) ?? [];
  assert.equal(submits.length, 2);
  for (const button of submits) assert.match(button, /\sdisabled(?:\s|>)/);
});

test('room budget links navigate to the password gate', async () => {
  for (const room of ['次卧功能优化_20261030', '父母主卧与衣帽间_20261030']) {
    const html = await readPublic(`${room}/index.html`);
    const links = html.match(/<a\b[^>]*href="\.\.\/index\.html#budget"[^>]*>/g) ?? [];
    assert.ok(links.length > 0, `${room}: missing password gate link`);
    for (const link of links) assert.doesNotMatch(link, /\sdownload(?:\s|=|>)/i);
  }
});

test('public modules and HTML do not embed passwords or a default unlock credential', async () => {
  const files = (await walk(publicRoot)).filter(file => /\.(?:html|js|mjs)$/i.test(file));
  assert.ok(files.includes('private/gate.mjs'), 'The browser gate module must exist');
  for (const relative of files) {
    const text = await readPublic(relative);
    assert.ok(!text.includes(fixturePassword), `${relative}: test password shipped publicly`);
    // Unknown production secrets cannot be matched by value. Check literal
    // credential assignments and prefilled password inputs without forbidding
    // normal password-input selectors, empty resets, or user-supplied values.
    assert.doesNotMatch(text, /\b(?:password|passphrase|unlockPassword|privatePassword|defaultPassword|expectedPassword)\s*[=:]\s*(["'`])[^"'`\r\n]+\1/i, `${relative}: hardcoded password assignment`);
    assert.doesNotMatch(text, /<input\b(?=[^>]*\btype\s*=\s*["']password["'])(?=[^>]*\bvalue\s*=\s*(["'])[^"']+\1)[^>]*>/i, `${relative}: prefilled password input`);
    assert.doesNotMatch(text, /\bdata-password\s*=|\bdecryptEnvelope\s*\([^,\n]+,\s*(["'`])[^"'`]+\1/i, `${relative}: embedded unlock credential`);
  }
});
