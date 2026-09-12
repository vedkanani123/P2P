/**
 * NEXUS - Proven Web Crypto API Primitives
 * Uses standard W3C Web Cryptography API:
 * - ECDH (NIST P-256 curve) for Diffie-Hellman Key Exchanges
 * - HKDF (SHA-256) for Key Derivation Functions
 * - AES-GCM (256-bit key, 96-bit IV, 128-bit tag) for Authenticated Encryption
 * - SHA-256 for Content Addressing (CIDs) and Hash Chaining
 */

import { ProofOfWorkResult } from '../types';

const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  throw new Error('Web Cryptography API is not available in this environment');
};

// Convert Uint8Array to Hex String
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex String to Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Generate an ECDH KeyPair (NIST P-256)
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return await getCrypto().subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
}

// Export ECDH Public Key to raw Hex
export async function exportPublicKeyHex(key: CryptoKey): Promise<string> {
  const raw = await getCrypto().subtle.exportKey('raw', key);
  return bytesToHex(new Uint8Array(raw));
}

// Export ECDH Private Key to JWK string (stored only in client memory)
export async function exportPrivateKeyJwk(key: CryptoKey): Promise<string> {
  const jwk = await getCrypto().subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

// Import ECDH Public Key from raw Hex
export async function importPublicKeyFromHex(hex: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hex);
  return await getCrypto().subtle.importKey(
    'raw',
    bytes,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

// Import ECDH Private Key from JWK string
export async function importPrivateKeyFromJwk(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await getCrypto().subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Perform Diffie-Hellman exchange: DH(privateKeyA, publicKeyB) -> 32-byte shared bits
export async function computeDiffieHellman(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<Uint8Array> {
  const sharedBits = await getCrypto().subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    256 // 32 bytes
  );
  return new Uint8Array(sharedBits);
}

// HKDF-Extract and Expand using Web Crypto
export async function hkdfDerive(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  outputLengthBytes: number = 32
): Promise<Uint8Array> {
  const baseKey = await getCrypto().subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const derivedBits = await getCrypto().subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: new TextEncoder().encode(info),
    },
    baseKey,
    outputLengthBytes * 8
  );
  return new Uint8Array(derivedBits);
}

// SHA-256 Hash
export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await getCrypto().subtle.digest('SHA-256', buffer);
  return new Uint8Array(hash);
}

// Generate Content ID (CID) using SHA-256 (IPFS-like content addressing)
export async function generateContentId(data: Uint8Array | string): Promise<string> {
  const hashBytes = await sha256(data);
  const hex = bytesToHex(hashBytes);
  return `bafk${hex.substring(0, 32)}`; // Content ID representation
}

// Encrypt plaintext with AES-256-GCM
export async function encryptAesGcm(
  plaintext: string | Uint8Array,
  keyBytes: Uint8Array,
  ivBytes?: Uint8Array
): Promise<{ ciphertextHex: string; ivHex: string; authTagHex: string }> {
  const iv = ivBytes || getCrypto().getRandomValues(new Uint8Array(12)); // 96-bit IV
  const key = await getCrypto().subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);

  const encodedData = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  const encryptedBuffer = await getCrypto().subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128, // 16-byte authentication tag
    },
    key,
    encodedData
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  // In Web Crypto AES-GCM, the last 16 bytes of the output is the authentication tag
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const authTagBytes = encryptedBytes.slice(encryptedBytes.length - 16);

  return {
    ciphertextHex: bytesToHex(ciphertextBytes),
    ivHex: bytesToHex(iv),
    authTagHex: bytesToHex(authTagBytes),
  };
}

// Decrypt ciphertext with AES-256-GCM
export async function decryptAesGcm(
  ciphertextHex: string,
  ivHex: string,
  authTagHex: string,
  keyBytes: Uint8Array
): Promise<string> {
  const ciphertext = hexToBytes(ciphertextHex);
  const iv = hexToBytes(ivHex);
  const authTag = hexToBytes(authTagHex);

  // Combine ciphertext and authTag back for Web Crypto format
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const key = await getCrypto().subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);

  try {
    const decryptedBuffer = await getCrypto().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      combined
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error('CRYPTOGRAPHIC_AUTHENTICATION_FAILURE: Tampering or invalid key detected');
  }
}

// Format a readable cryptographic fingerprint (safety numbers)
export function formatFingerprint(hexKey: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < Math.min(hexKey.length, 32); i += 4) {
    const chunk = hexKey.substring(i, i + 4).toUpperCase();
    chunks.push(chunk);
  }
  return chunks.slice(0, 6).join('-');
}

// Hashcash Proof-of-Work challenge solver (Anti-Bot without metadata leakage)
export async function solveProofOfWork(
  challengeSeed: string,
  difficulty: number = 3 // Number of leading zeros in hex
): Promise<ProofOfWorkResult> {
  const startTime = performance.now();
  const targetPrefix = '0'.repeat(difficulty);
  let nonce = 0;
  let hashHex = '';

  while (true) {
    const attempt = `${challengeSeed}:${nonce}`;
    const hash = await sha256(attempt);
    hashHex = bytesToHex(hash);
    if (hashHex.startsWith(targetPrefix)) {
      break;
    }
    nonce++;
    // Yield every 5000 iterations to avoid freezing UI
    if (nonce % 5000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    nonce,
    hash: hashHex,
    difficulty,
    timeMs: Math.round(performance.now() - startTime),
  };
}

// Verify Proof-of-Work
export async function verifyProofOfWork(
  challengeSeed: string,
  nonce: number,
  difficulty: number = 3
): Promise<boolean> {
  const targetPrefix = '0'.repeat(difficulty);
  const attempt = `${challengeSeed}:${nonce}`;
  const hash = await sha256(attempt);
  const hashHex = bytesToHex(hash);
  return hashHex.startsWith(targetPrefix);
}
