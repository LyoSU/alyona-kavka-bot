import { beforeAll, describe, expect, it } from 'vitest';
import { decrypt, encrypt, initSodium } from '@/lib/secrets';

const KEY = 'a'.repeat(64);

beforeAll(async () => {
  await initSodium();
});

describe('secrets', () => {
  it('round-trips text', () => {
    const enc = encrypt('hello world', KEY);
    expect(decrypt(enc, KEY)).toBe('hello world');
  });

  it('encrypts to different ciphertext each time (nonce uniqueness)', () => {
    const a = encrypt('same', KEY);
    const b = encrypt('same', KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe('same');
    expect(decrypt(b, KEY)).toBe('same');
  });

  it('rejects invalid key length', () => {
    expect(() => encrypt('x', 'short')).toThrow();
  });

  it('fails on tampered ciphertext', () => {
    const enc = encrypt('secret-token', KEY);
    const parts = enc.split('.');
    if (parts.length !== 2 || !parts[1]) throw new Error('bad format');
    const tampered = `${parts[0]}.${parts[1].slice(0, -2)}AA`;
    expect(() => decrypt(tampered, KEY)).toThrow();
  });

  it('fails on wrong key', () => {
    const enc = encrypt('x', KEY);
    const otherKey = 'b'.repeat(64);
    expect(() => decrypt(enc, otherKey)).toThrow();
  });

  it('fails on malformed ciphertext', () => {
    expect(() => decrypt('no-dot', KEY)).toThrow();
  });
});
