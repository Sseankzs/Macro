// Minimal client-side encryption utilities using WebCrypto
// Prototype for task encryption with a single local team key

const ENC_PREFIX = 'enc:v1:';
const WRAP_PREFIX = 'wrap:v1:'; // for wrapped team keys persisted remotely

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

async function exportAesKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function getTeamKeyStorageKey(teamId: string) {
  return `e2ee:teamkey:${teamId}`;
}

export async function ensureTeamKey(teamId = 'default-team'): Promise<CryptoKey> {
  // 1) Try cached local key
  const storageKey = getTeamKeyStorageKey(teamId);
  const existing = localStorage.getItem(storageKey);
  if (existing) return importAesKey(fromBase64(existing));

  // 2) Try remote wrapped key (prototype: passphrase prompt)
  try {
    // dynamic import to avoid bundling Tauri in browser
    const { invoke } = await import('@tauri-apps/api/core');
    const record = await invoke<any>('get_team_key_record', { teamId: teamId });
    if (record && typeof record === 'object') {
      const pass = window.prompt('Enter team passphrase to decrypt tasks');
      if (!pass) throw new Error('Passphrase required');
      const key = await unwrapTeamKeyWithPass(pass, record);
      const raw = await exportAesKey(key);
      localStorage.setItem(storageKey, toBase64(raw));
      return key;
    }
  } catch (_) {
    // ignore and fallback
  }

  // 3) Create new team key locally, optionally offer to store remotely
  const key = await generateAesKey();
  try {
    const save = window.confirm('Create new team encryption key? (Prototype)');
    if (save) {
      const pass1 = window.prompt('Create team passphrase');
      const pass2 = window.prompt('Confirm team passphrase');
      if (pass1 && pass1 === pass2) {
        const wrapped = await wrapTeamKeyWithPass(pass1, key);
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('upsert_team_key_record', {
          teamId,
          keyId: wrapped.key_id,
          wrappedKeyB64: wrapped.ct,
          kdfSaltB64: wrapped.salt,
          kdfIters: wrapped.iters,
          wrapIvB64: wrapped.iv,
        });
      }
    }
  } catch (_) {}

  const raw = await exportAesKey(key);
  localStorage.setItem(storageKey, toBase64(raw));
  return key;
}

export async function encryptTextForTeam(plaintext: string, teamId = 'default-team'): Promise<string> {
  const key = await ensureTeamKey(teamId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plaintext));
  const payload = {
    iv: toBase64(iv.buffer),
    ct: toBase64(ct),
    t: teamId,
    a: 'AES-GCM-256',
    v: 1,
  };
  return ENC_PREFIX + btoa(JSON.stringify(payload));
}

export async function decryptTextForTeam(maybeCiphertext: string): Promise<string> {
  if (!maybeCiphertext?.startsWith(ENC_PREFIX)) return maybeCiphertext;
  const jsonB64 = maybeCiphertext.slice(ENC_PREFIX.length);
  const decoded = atob(jsonB64);
  const obj = JSON.parse(decoded);
  const teamId = obj.t || 'default-team';
  const key = await ensureTeamKey(teamId);
  const iv = new Uint8Array(fromBase64(obj.iv));
  const ct = fromBase64(obj.ct);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return textDecoder.decode(pt);
}

export function isEncrypted(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

// ----- Passphrase wrapping (prototype) -----

async function importPbkdfKey(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
}

async function deriveAesKeyFromPass(passphrase: string, salt: ArrayBuffer, iters = 150000): Promise<CryptoKey> {
  const baseKey = await importPbkdfKey(passphrase);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapTeamKeyWithPass(passphrase: string, teamKey: CryptoKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await deriveAesKeyFromPass(passphrase, salt.buffer);
  const rawTeamKey = await exportAesKey(teamKey);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawTeamKey);
  return {
    v: 1,
    alg: 'PBKDF2-AES-GCM',
    salt: toBase64(salt.buffer),
    iv: toBase64(iv.buffer),
    ct: toBase64(ct),
    key_id: 'v1',
  };
}

export async function unwrapTeamKeyWithPass(passphrase: string, record: any): Promise<CryptoKey> {
  const salt = fromBase64(record.kdf_salt_b64 || record.salt);
  const iv = fromBase64(record.wrap_iv_b64 || record.iv);
  const ct = fromBase64(record.wrapped_key_b64 || record.ct);
  const iters = record.kdf_iters || record.iters || 150000;
  const kek = await deriveAesKeyFromPass(passphrase, salt, iters);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, kek, ct);
  return importAesKey(raw);
}
