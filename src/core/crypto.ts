/** Password-based encryption for backups: AES-GCM with a PBKDF2-derived key (600 000 iterations). */

export const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedEnvelope {
  app: 'pengeoversikt';
  encrypted: true;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-GCM';
  salt: string;
  iv: string;
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plain));
  return {
    app: 'pengeoversikt',
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  };
}

export async function decryptText(envelope: EncryptedEnvelope, password: string): Promise<string> {
  const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource }, key, fromBase64(envelope.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Feil passord, eller filen er skadet.');
  }
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return typeof value === 'object' && value != null && (value as { encrypted?: unknown }).encrypted === true && typeof (value as { data?: unknown }).data === 'string';
}
