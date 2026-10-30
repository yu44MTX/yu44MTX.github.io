const ITERATIONS = 600000;
const MAX_BYTES = 32 * 1024 * 1024;
const AAD = new TextEncoder().encode('home-design-private-v1');
const ENVELOPE_URL = new URL('./budget.enc.json', import.meta.url);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function base64Bytes(value, min, max) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(max / 3) ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid encoded bytes');
  }
  const raw = atob(value);
  if (raw.length < min || raw.length > max || btoa(raw) !== value) {
    throw new Error('Invalid byte length');
  }
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

/** Decrypt only; callers validate the application payload before rendering. */
export async function decryptEnvelope(envelope, password) {
  if (!object(envelope) || envelope.version !== 1 ||
      envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) {
    throw new Error('Unsupported envelope');
  }
  if (typeof password !== 'string' || password.length === 0) throw new Error('Password required');
  const salt = base64Bytes(envelope.salt, 16, 16);
  const iv = base64Bytes(envelope.iv, 12, 12);
  const ciphertext = base64Bytes(envelope.ciphertext, 17, MAX_BYTES);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto requires a secure context');
  let passwordBytes = new TextEncoder().encode(password);
  let material;
  let key;
  let plaintext;
  try {
    material = await subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    passwordBytes.fill(0);
    passwordBytes = null;
    key = await subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    plaintext = new Uint8Array(await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, ciphertext
    ));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } finally {
    passwordBytes?.fill(0);
    plaintext?.fill(0);
    material = null;
    key = null;
    password = '';
  }
}

function validatePayload(payload) {
  if (!object(payload) || payload.schema !== 1 || !object(payload.sections) ||
      typeof payload.sections.budget !== 'string' || typeof payload.sections.sources !== 'string' ||
      !object(payload.data) || !Array.isArray(payload.files)) {
    throw new Error('Invalid private content');
  }
  const ids = new Set();
  let total = 0;
  for (const file of payload.files) {
    if (!object(file) || typeof file.id !== 'string' || !file.id || ids.has(file.id) ||
        typeof file.name !== 'string' || !file.name ||
        typeof file.mime !== 'string' || !file.mime) throw new Error('Invalid private file');
    ids.add(file.id);
    const bytes = base64Bytes(file.base64, 0, MAX_BYTES);
    total += bytes.length;
    if (total > MAX_BYTES) throw new Error('Private files too large');
  }
  return payload;
}

function initializeGate() {
  const roots = ['budget', 'sources'].map(id => document.getElementById(id));
  if (roots.some(root => !root || !root.querySelector('form[data-private-unlock]'))) return;
  const originals = roots.map(root => root.innerHTML);
  let pending = false;
  let unlocked = false;
  let generation = 0;
  let controller = null;
  let cleanup = null;

  // Remove only the previous renderer's plaintext edits, never unrelated keys.
  try { globalThis.localStorage?.removeItem('home-design-budget-v6'); } catch { /* Storage may be blocked. */ }

  function message(selector, text) {
    for (const root of roots) {
      const target = root.querySelector(selector);
      if (target) target.textContent = text;
    }
  }

  function clearPasswords() {
    for (const root of roots) {
      for (const input of root.querySelectorAll('input[type="password"]')) input.value = '';
    }
  }

  function busy(value) {
    for (const root of roots) {
      for (const form of root.querySelectorAll('form[data-private-unlock]')) {
        form.setAttribute('aria-busy', String(value));
        for (const control of form.querySelectorAll('input, button')) control.disabled = value;
      }
    }
  }

  function lock(focus = false, announce = true) {
    generation += 1;
    controller?.abort();
    controller = null;
    const dispose = cleanup;
    cleanup = null;
    try { dispose?.(); } catch { /* Restore the lock even if renderer cleanup fails. */ }
    clearPasswords();
    roots.forEach((root, index) => { root.innerHTML = originals[index]; });
    unlocked = false;
    clearPasswords();
    busy(pending);
    message('[data-private-error]', '');
    message('[data-private-status]', announce ? '已重新锁定。' : '');
    if (focus) roots[0].querySelector('input[type="password"]')?.focus();
  }

  async function unlock(event) {
    const form = event.target.closest?.('form[data-private-unlock]');
    if (!form || !roots.some(root => root.contains(form))) return;
    event.preventDefault();
    if (pending || unlocked) return;
    const input = form.querySelector('input[type="password"]');
    if (!input?.value) {
      message('[data-private-error]', '请输入密码。');
      input?.focus();
      return;
    }
    if (!globalThis.crypto?.subtle || globalThis.isSecureContext === false) {
      clearPasswords();
      message('[data-private-error]', '此浏览器无法解锁，请通过 HTTPS 访问，并使用支持 WebCrypto 的现代浏览器。');
      return;
    }
    pending = true;
    const attempt = ++generation;
    controller = new AbortController();
    let password = input.value;
    let payload = null;
    let stage = 'network';
    let inserted = false;
    busy(true);
    message('[data-private-error]', '');
    message('[data-private-status]', '正在解锁…');
    try {
      const response = await fetch(ENVELOPE_URL, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Private content unavailable');
      stage = 'decrypt';
      const envelope = await response.json();
      if (attempt !== generation) return;
      payload = validatePayload(await decryptEnvelope(envelope, password));
      password = '';
      clearPasswords();
      if (attempt !== generation) return;
      stage = 'render';
      const { mountBudget } = await import('./budget.mjs');
      if (attempt !== generation) return;
      if (typeof mountBudget !== 'function') throw new Error('Renderer unavailable');
      inserted = true;
      for (const root of roots) {
        root.innerHTML = payload.sections[root.id];
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.privateLock = '';
        button.textContent = '重新锁定';
        root.append(button);
      }
      const dispose = mountBudget(payload);
      if (typeof dispose !== 'function') throw new Error('Renderer cleanup required');
      cleanup = dispose;
      unlocked = true;
      message('[data-private-status]', '已解锁；离开或刷新页面后需重新输入密码。');
      roots[0].querySelector('[data-private-lock]')?.focus();
    } catch {
      if (attempt !== generation) return;
      if (inserted) lock(false, false);
      message('[data-private-status]', '');
      message('[data-private-error]', stage === 'network'
        ? '暂时无法加载加密内容，请检查网络后重试。'
        : stage === 'render'
          ? '暂时无法显示内容，请稍后重试。'
          : '无法解锁，请检查密码后重试。');
    } finally {
      password = '';
      payload = null;
      clearPasswords();
      controller = null;
      pending = false;
      busy(false);
    }
  }

  document.addEventListener('submit', unlock);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-private-lock]');
    if (button && roots.some(root => root.contains(button))) lock(true);
  });
  globalThis.addEventListener('pagehide', () => lock(false));
  globalThis.addEventListener('pageshow', event => {
    if (event.persisted) lock(false);
  });
  busy(false);
  clearPasswords();
}

// Importing the decryption helper in Node must not require a DOM.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGate, { once: true });
  } else {
    initializeGate();
  }
}
