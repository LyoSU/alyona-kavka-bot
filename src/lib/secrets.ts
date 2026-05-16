import sodium from 'libsodium-wrappers';

let _ready = false;

export async function initSodium(): Promise<void> {
  if (_ready) return;
  await sodium.ready;
  _ready = true;
}

function keyFromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('invalid key: must be 64 hex chars');
  }
  return sodium.from_hex(hex);
}

export function encrypt(plaintext: string, hexKey: string): string {
  if (!_ready) throw new Error('sodium not initialised — call initSodium() first');
  const key = keyFromHex(hexKey);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  return `${sodium.to_base64(nonce)}.${sodium.to_base64(ct)}`;
}

export function decrypt(ciphertext: string, hexKey: string): string {
  if (!_ready) throw new Error('sodium not initialised — call initSodium() first');
  const key = keyFromHex(hexKey);
  const idx = ciphertext.indexOf('.');
  if (idx === -1) throw new Error('malformed ciphertext');
  const noncePart = ciphertext.slice(0, idx);
  const ctPart = ciphertext.slice(idx + 1);
  if (!noncePart || !ctPart) throw new Error('malformed ciphertext');
  const nonce = sodium.from_base64(noncePart);
  const ct = sodium.from_base64(ctPart);
  const pt = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  return sodium.to_string(pt);
}
